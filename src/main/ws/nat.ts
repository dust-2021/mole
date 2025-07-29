import {Logger, Configs} from "../public/public";
import dgram = require('dgram')
import {v4 as uuid} from 'uuid'
import {Mutex} from "async-mutex";

class NatCreator {
    private soc: dgram.Socket;
    private slaveSoc: dgram.Socket;
    private readonly port: number;
    public symmetry = false;
    private heartbeatTarget: Map<string, NodeJS.Timeout> = new Map();
    private rooms: Map<string, string[]> = new Map();

    constructor() {
        this.port = Configs.natPort;
        this.soc = dgram.createSocket('udp4');
        this.slaveSoc = dgram.createSocket('udp4');
        this.soc.bind(this.port);
        this.slaveSoc.bind(this.port + 1);
        this.soc.on('message', this.listener);
    }

    // udp监听处理函数
    private async listener(message: Buffer, info: dgram.RemoteInfo) {
        Logger.info(`Received message ${message} from ${info.address}:${info.port}`);
        const context = String(message);
        const result = context.split('\r\n')
        const type_ = result[0];
        switch (type_) {
            case "stun":
                // 约定格式："stun\r\n{bool}"，代表主soc和从soc在nat网络中是否为同一端口
                this.symmetry = !Boolean(result[1]);
                break;
            case "punch":
                this.soc.send(`punchSuccess\r\n${result[1]}`, info.port, info.address);
                await this.heartbeat(info.address, info.port);
                break;
            case "punchSuccess":
                await this.heartbeat(info.address, info.port);
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
                    await this.disconnect(addr, port)
                }
            });
        }, 2000)
        this.heartbeatTarget.set(`${addr}:${port}`, id);
    }

    public async connect(address: string, port: number, key: string, roomId: string, retry: number = 0, maxRetry: number = 10,
    ): Promise<void> {
        if (retry > maxRetry) {
            Logger.error(`Retry to connect to ${address}:${port} more than ${maxRetry}`);
            return;
        }
        this.soc.send(Buffer.from(`punch\r\n${key}`), port, address, (error, bytes) => {
            if (error) {
                return this.connect(address, port, key, roomId, retry + 1);
            }
            if (roomId === "") {
                throw new Error(`Room ${address} not found.`);
            }
            if (this.rooms.get(roomId) === null) {
                this.rooms.set(roomId, []);
            }
            this.rooms.get(roomId)?.push(`${address}:${port}`);
        })
    }

    public async disconnect(address: string, port: number): Promise<void> {
        // 关闭心跳检测
        const id = this.heartbeatTarget.get(`${address}:${port}`);
        if (id) {
            clearInterval(id);
        }
        this.heartbeatTarget.delete(`${address}:${port}`);
    }

    public async disconnectRoom(roomId: string): Promise<void> {
        const room = this.rooms.get(roomId);
        if (!room) {
            return;
        }
        for (const id in room) {
            const addr = id.split(':')[0];
            const port = parseInt(id.split(':')[1]);
            await this.disconnect(addr, port);
        }
        this.rooms.delete(roomId);
    }

    public async stun(address: string, port: number): Promise<void> {
        const key = uuid()
        // 与服务器约定的报文格式
        this.soc.send(`stun\r\n${key}`, port, address, (error, bytes) => {
            if (error) {
                Logger.error(`stun failed: ${error}`);
            }
        });

        this.slaveSoc.send(`stunSlave\r\n${key}`, port, address, (error, bytes) => {
            if (error) {
                Logger.error(`stun slave failed: ${error}`);
            }
        });
    }
}

export const natHandler = new NatCreator();