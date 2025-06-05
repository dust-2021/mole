import {wsReqBody, wsRespBody, wsListener, WsHandler, Services, Windows, Public, Logger} from "../public/public";
import {WebSocket as socket, MessageEvent} from 'ws';

export class Connection {
    static All: Map<string, Connection> = new Map();
    public conn: socket | null = null;
    private singleHandleMap: Map<string, wsListener>;

    private constructor(public serverName: string) {
        if (!Services.has(serverName)) {
            throw new Error(`No service available for ${serverName}`);
        }
        this.singleHandleMap = new Map<string, wsListener>();
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
        const svr = Services.get(this.serverName);
        this.conn = new socket(`${svr?.host}:${svr?.port}/ws`, {
            headers: {
                "Token": svr?.token,
                "Mac": Public.has("mac") ? Public.get("mac") : "",
            }
        });
        this.conn.onmessage = this.handle.bind(this);
        this.conn.onerror = (event) => {
            Logger.error("wsError:" + event.message)
        }
        this.conn.onclose = () => {
            const win = Windows.get('main');
            win?.webContents?.send(`wsClose.${this.serverName}`);
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
        const r: wsRespBody = JSON.parse(data);
        try {
            if (WsHandler.has(r.id)) {
                const f = WsHandler.get(r.id);
                f?.(r);
            } else if (this.singleHandleMap.has(r.id)) {
                const f = this.singleHandleMap.get(r.id);
                f?.(r);
            } else {
                // 未找到相应处理函数直接发送到渲染进程
                const win = Windows.get("main");
                win?.webContents?.send(r.id, r);
            }
        } catch (e) {
            console.error(e);
        } finally {
            this.singleHandleMap.delete(r.id);
        }
    }

    // 发送ws消息并添加单次回调函数
    public async send(msg: wsReqBody, handle?: wsListener): Promise<void> {
        if (this.conn === null || this.conn.readyState !== this.conn.OPEN) {
            return;
        }
        this.conn.send(JSON.stringify(msg));
        if (handle) {
            this.singleHandleMap.set(msg.id, handle);
        }
    }
}