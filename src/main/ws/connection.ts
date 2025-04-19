import {wsHandler, wsReqBody, wsRespBody, WsApi} from "../public/public";

export class Connection {
    static All : Map<string, Connection> = new Map();
    private readonly conn: WebSocket;
    private singleHandleMap: Map<string, wsHandler>;

    constructor(key: string, host: string, port: number) {
        this.conn = new WebSocket(`${host}:${port}/ws`);
        this.singleHandleMap = new Map<string, wsHandler>();
        this.conn.onmessage = this.handle
        Connection.All.set(key, this);
    }

    private async handle(event: MessageEvent) {
        if (event.data === 'ping') {
            this.conn.send('pong');
            return;
        }
        try {
            const r: wsRespBody = JSON.parse(event.data);
            if (WsApi.has(r.id)) {
                const f = WsApi.get(r.id);
                f?.(r);
            } else if (this.singleHandleMap.has(r.id)) {
                const f = this.singleHandleMap.get(r.id);
                this.singleHandleMap.delete(r.id);
                f?.(r);
            }
        } catch (e) {
            console.error(e);
        }
    }
    // 发送ws消息并添加单次回调函数
    public async send(msg: wsReqBody, handle?: wsHandler): Promise<void> {
        if (this.conn.readyState === WebSocket.OPEN) {
            this.conn.send(JSON.stringify(msg));
        }
        if (handle) {
            this.singleHandleMap.set(msg.id, handle);
        }
    }
}