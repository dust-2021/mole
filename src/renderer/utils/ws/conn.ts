import {Services} from "../stores";
import {wsReq, wsResp, log} from '../publicType'
import {ElMessage} from "element-plus";
import {v4 as uuid} from "uuid";


// ws响应处理函数类型，传入当前服务器ws连接类和ws报文
export type wsHandleFunc = (resp: wsResp) => any;

export class Connection {
    static All: Map<string, Connection> = new Map();
    private conn: WebSocket = null;
    private handleByMethod = new Map<string, wsHandleFunc>();
    private handleById = new Map<string, wsHandleFunc>();

    private constructor(public serverName: string) {
        const s = Services();
        if (!s.has(serverName)) {
            throw new Error(`No service available for ${serverName}`);
        }
        Connection.All.set(serverName, this);
    }

    public static getInstance(serverName: string): Connection {
        let ins = Connection.All.get(serverName);
        if (ins === undefined) {
            ins = new Connection(serverName);
        }
        return ins;
    }
    private static createConn(url: string) {
        return new Promise<WebSocket>((resolve, reject) => {
            const socket = new WebSocket(url);
            socket.addEventListener("open", () => {
                resolve(socket);
            })
            socket.addEventListener("error", (err) => {
                reject(err);
            })
        })
    }

    public async active(): Promise<boolean> {
        if (this.conn && this.conn.readyState === this.conn.OPEN) {
            return true;
        }
        const svr = Services().get(this.serverName);
        try {
            this.conn = await Connection.createConn(`${svr.host}:${svr.port}/ws`);
        } catch (e) {
            ElMessage({
                type: 'error',
                message: `连接服务器失败`
            })
            log('error', `create ws connection failed:${e.toString()}`)
            return false;
        }
        this.conn.onmessage = this.handle.bind(this);
        this.conn.onerror = (event) => {
            // Logger.error("wsError:" + event.message)
        }
        this.conn.onclose = () => {
        }
        return true;
    }

    public close() {
        if (this.conn && this.conn.readyState === this.conn.OPEN) {
            this.conn.close();
        }
        this.conn = null;
    }

    private handle(event: MessageEvent): void {
        if (this.conn === null || this.conn.readyState !== this.conn.OPEN) {
            return;
        }
        let data: string = "";
        if (typeof event.data !== "string") {
            data = event.data.toString('utf-8');
        } else {
            data = event.data;
        }
        if (data === 'ping') {
            this.conn.send('pong');
            return;
        }
        const r: wsResp = JSON.parse(data);
        let f: wsHandleFunc;
        try {
            // 响应服务器消息
            if (this.handleByMethod.has(r.method)) {
                f = this.handleByMethod.get(r.method);
            } else if (this.handleById.has(r.id)) {
                f = this.handleById.get(r.id);
            }
            f?.(r);
        } catch (e) {
            console.error(e);
        } finally {
            this.handleById.delete(r.id);
        }
    }

    // 发送ws消息并添加单次回调函数
    public async send(msg: wsReq, handle?: wsHandleFunc): Promise<void> {
        if (this.conn === null || this.conn.readyState !== this.conn.OPEN) {
            ElMessage({
                type: 'warning',
                message: '未建立ws连接',
            })
            return;
        }
        this.conn.send(JSON.stringify(msg));
        if (handle) {
            this.handleById.set(msg.id, handle);
        }
    }

    // 添加或删除ws处理函数
    public methodHandler(key: string, handler?: wsHandleFunc): void {
        if (handler) {
            this.handleByMethod.set(key, handler);
        } else {
            this.handleByMethod.delete(key);
        }
    }
}

export async function wsRequest(serverName: string, method: string, args?: any[], handle?: wsHandleFunc) {
    const conn = Connection.getInstance(serverName);
    const id: string = uuid().toString();
    const req: wsReq = {id: id, method: method, params: args}
    await conn.send(req, handle);
    return id;
}