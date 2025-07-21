import {WebSocket as socket, MessageEvent} from 'ws';
import {Services, Public} from "../stores";
import {wsReq, wsResp} from '../publicType'
import {ElMessage} from "element-plus";

// ws响应处理函数类型，传入当前服务器ws连接类和ws报文
export type wsHandleFunc = (conn: Connection, resp: wsResp) => any;

const svr = Services();
const pub = Public();

export class Connection {
    static All: Map<string, Connection> = new Map();
    private conn: socket | null = null;
    private handleByMethod = new Map<string, wsHandleFunc>();
    private handleById = new Map<string, wsHandleFunc>();

    private constructor(public serverName: string) {
        if (!svr.has(serverName)) {
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

    public active() {
        if (this.conn && this.conn.readyState === this.conn.OPEN) {
            return;
        }
        const server = svr.get(this.serverName);
        this.conn = new socket(`${server?.host}:${server?.port}/ws`, {
            headers: {
                "Token": server?.token,
                "Mac": pub.has("mac") ? pub.get("mac") : "",
            }
        });
        this.conn.onmessage = this.handle.bind(this);
        this.conn.onerror = (event) => {
            // Logger.error("wsError:" + event.message)
        }
        this.conn.onclose = () => {
            // const win = Windows.get('main');
            // win?.webContents?.send(`wsClose.${this.serverName}`);
        }

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
        try {
            // 响应服务器消息
            if (this.handleByMethod.has(r.method)) {
                const f = this.handleByMethod.get(r.method);
                f?.(this, r);

            } else if (this.handleById.has(r.id)) {
                const f = this.handleById.get(r.id);
                f?.(this, r);
            } else {

            }
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
        this.conn.send(JSON.stringify(msg), (err: Error) => {
            if (err) {
                ElMessage({
                    type: 'error',
                    message: '发送ws请求错误：' + err.message,
                })
            } else {
                if (handle) {
                    this.handleById.set(msg.id, handle);
                }
            }
        });

    }

    // 添加ws处理函数
    public addMethodHandler(key: string, handler: wsHandleFunc): void {
        this.handleByMethod.set(key, handler);
    }
}