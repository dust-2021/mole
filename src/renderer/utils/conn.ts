import { Services } from "./stores";
import { wsReq, wsResp, log } from './publicType'
import { ElMessage } from "element-plus";
import { v4 as uuid } from "uuid";
import { AsyncMap, RWLock } from '../../shared/asynchronous'

// ws响应处理函数类型，传入当前服务器ws连接类和ws报文
export type wsHandleFunc = (resp: wsResp) => void;

/* ws连接管理，每个服务器名会生成一个连接单例
所有连接共有一个publicHandleByMethod回调处理函数表，私有handleByMethod，handleById回调处理函数表，回调请求只会
处理一次，id > method > publicMethod
* */
export class Connection {
    static All: Map<string, Connection> = new Map();
    public static publicHandleByMethod = new AsyncMap<string, wsHandleFunc>();

    private conn: WebSocket | null = null;
    private readonly lock = new RWLock();
    private handleByMethod = new AsyncMap<string, wsHandleFunc>(this.lock);
    private handleById = new AsyncMap<string, wsHandleFunc>(this.lock);

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

    public async active(onclose?: ()=> void): Promise<boolean> {
        const release = await this.lock.acquireWrite();
        try {
            if (this.conn && this.conn.readyState === this.conn.OPEN) {
                return true;
            }
            const svr = Services().get(this.serverName);
            if (svr == undefined) {
                return false;
            }
            this.conn = await Connection.createConn(`${svr.certify ? 'https://' : 'http://'}${svr.host}:${svr.port}/ws`);

            this.conn.onmessage = this.handle.bind(this);
            this.conn.onerror = (event) => {
                // Logger.error("wsError:" + event.message)
            }
            this.conn.onclose = () => {
                log('info', 'connection closed');
                if (onclose) onclose();
            }
            return true;
        } catch (e) {
            log('error', `create ws connection failed:${e.toString()}`)
            return false;
        } finally {
            release();
        }
    }

    public close() {
        if (this.conn && this.conn.readyState === this.conn.OPEN) {
            this.lock.acquireWrite().then((f) => {
                this.conn?.close();
                this.conn = null;
                f();
            });
            return;
        }
        this.conn = null;
    }

    private async handle(event: MessageEvent): Promise<void> {
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
        let f: wsHandleFunc | undefined = undefined;
        try {
            // 响应服务器消息
            if (await this.handleByMethod.has(r.method)) {
                f = await this.handleByMethod.get(r.method);
            } else if (await Connection.publicHandleByMethod.has(r.method)) {
                f = await Connection.publicHandleByMethod.get(r.method);
            };
            if (await this.handleById.has(r.id)) {
                f = await this.handleById.get(r.id);
            }
            f?.(r);
        } catch (e) {
            console.error(e);
        } finally {
            await this.handleById.delete(r.id);
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
            await this.handleById.set(msg.id, handle);
        }
    }

    // 添加ws处理函数
    public methodHandler(key: string, handler: wsHandleFunc): void {
        this.handleByMethod.set(key, handler).then();

    }
    public removeMethodHandler(key: string): void {
        this.handleByMethod.delete(key).then();
    }
}

export async function wsRequest(serverName: string, method: string, args: any[], handle?: wsHandleFunc) {
    const conn = Connection.getInstance(serverName);
    const id: string = uuid().toString();
    const req: wsReq = { id: id, method: method, params: args }
    await conn.send(req, handle);
    return id;
}