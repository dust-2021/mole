import {Logger, Configs} from "../public/public";
import dgram = require('dgram')
import {v4 as uuid} from 'uuid';
import {Mutex} from 'async-mutex';

class NatCreator {
    private soc: dgram.Socket;
    private slaveSoc: dgram.Socket;
    private readonly port: number;

    private heartbeatTarget: Map<string, NodeJS.Timeout> = new Map();
    private rooms: Map<string, string[]> = new Map();
    private lock: Mutex = new Mutex();

    constructor() {
        this.port = Configs.natPort;
        this.soc = dgram.createSocket('udp4');
        this.slaveSoc = dgram.createSocket('udp4');
        this.soc.bind(this.port);
        this.slaveSoc.bind(this.port + 1);
        this.soc.on('message', this.listener);
    }

    // udp监听处理函数
    private listener(message: Buffer, info: dgram.RemoteInfo) {
        Logger.info(`Received message ${message} from ${info.address}:${info.port}`);
        const context = String(message);
        const result = context.split('\r\n')
        const type_ = result[0];
        switch (type_) {
            case "punch":
                this.soc.send(`punchSuccess\r\n${result[1]}`, info.port, info.address);
                this.heartbeat(info.address, info.port).then();
                break;
            case "punchSuccess":
                this.heartbeat(info.address, info.port).then();
                break;
            case "heartbeat":
                // 心跳检测不作回应，双方心跳检测各自独立
                break;
        }
    }

    // 完成nat连接后的心跳检测
    private async heartbeat(addr: string, port: number): Promise<void> {
        const id = setInterval(async () => {
            this.soc.send(`heartbeat`, port, addr, async (error, bytes) => {
                if (error) {
                    this.disconnect(addr, port)
                }
            });
        }, 2000)
        const release = await this.lock.acquire();
        try {
            this.heartbeatTarget.set(`${addr}:${port}`, id);
        } catch (error) {
        } finally {
            release();
        }
    }

    public connect(address: string, port: number, key: string, roomId: string): void {
        const call = setInterval(() => {
            this.soc.send(Buffer.from(`punch\r\n${key}`), port, address, (error, bytes) => {
                if (error) {
                    Logger.debug("nat punch failed of " + `${address}:${port}`, error);
                    return;
                }
                if (!this.rooms.has(roomId)) {
                    this.rooms.set(roomId, []);
                }
                this.rooms.get(roomId)?.push(`${address}:${port}`);
            })
            call.close()
        }, 500)

    }

    public disconnect(address: string, port: number): void {
        // 关闭心跳检测
        const id = this.heartbeatTarget.get(`${address}:${port}`);
        if (id) {
            clearInterval(id);
        }
        this.heartbeatTarget.delete(`${address}:${port}`);
    }

    public disconnectRoom(roomId: string): void {
        const room = this.rooms.get(roomId);
        if (!room) {
            return;
        }
        for (const id in room) {
            const addr = id.split(':')[0];
            const port = parseInt(id.split(':')[1]);
            this.disconnect(addr, port);
        }
        this.rooms.delete(roomId);
    }
}

export const natHandler = new NatCreator();


export function handleIPC(method: string, ...args: any[]): any {
    switch (method) {

    }
}