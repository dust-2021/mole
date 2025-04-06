import {wsHandler, wsReqBody, wsRespBody} from "@/main/public/public";

export class Connection {
    static All : Map<string, Connection> = new Map();
    private readonly conn: WebSocket;
    private handleMap: Map<string, wsHandler>;
    private singleHandleMap: Map<string, wsHandler>;

    constructor(key: string, host: string, port: number, ...handlers: { key: string, value: wsHandler }[]) {
        this.conn = new WebSocket(`${host}:${port}/ws`);
        this.handleMap = new Map<string, wsHandler>();
        this.singleHandleMap = new Map<string, wsHandler>();

        for (const handler of handlers) {
            if (this.handleMap.has(handler.key)) {
                throw new Error("重复创建ws处理函数");
            }
            this.handleMap.set(handler.key, handler.value);
        }
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
            let f: wsHandler | undefined;
            if (this.handleMap.has(r.id)) {
                f = this.handleMap.get(r.id);
            } else if (this.singleHandleMap.has(r.id)) {
                f = this.singleHandleMap.get(r.id);
                this.singleHandleMap.delete(r.id);
            }
            f?.(r);

        } catch (e) {
            console.error(e);
        }
    }

    public async send(msg: wsReqBody, handle?: wsHandler): Promise<void> {
        if (this.conn.readyState === WebSocket.OPEN) {
            this.conn.send(JSON.stringify(msg));
        }
        if (handle) {
            this.singleHandleMap.set(msg.id, handle);
        }
    }
}