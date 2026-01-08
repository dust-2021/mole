import { Logger, Configs } from "./public";
import dgram = require('dgram')
import { AsyncMap } from "../shared/asynchronous";
import { ipcRenderer } from "electron";
import { v4 as uuid } from "uuid";

enum NatMsgType {
    // 向公网服务器获取本机公网地址
    getPublicAddressMain = "getPublicAddressMain",
    // 副端口确认nat类型，不同端口的公网地址是否相同
    getPublicAddressSlave = "getPublicAddressSlave",
    connectPeer = "connectPeer",
    heartbeat = "heartbeat",
    // 接收公网地址
    receivePublicAddress = "receivePublicAddress",

    peerReply = "peerReply",

    heartbeatBack = "heartbeatBack",
}

function udpPayload(type: NatMsgType, uuid: string, data: string): string {
    return `${type}\r\n${uuid}\r\n${data}`;
}

/**
 * NAT穿透类
 * 负责nat打洞，打洞完成后释放端口，由wireguard适配器占用端口进行通信
 */
class NatCreator {

    private soc: dgram.Socket;
    private slaveSoc: dgram.Socket;
    private readonly port: number;
    // 存储心跳检测控制函数和失败计数
    private heartbeatTarget: AsyncMap<{ call: NodeJS.Timeout, count: number }> = new AsyncMap();
    // 存储连接任务和连接超时控制
    private connecting: AsyncMap<{ task: NodeJS.Timeout, timeout: NodeJS.Timeout }> = new AsyncMap();

    constructor() {
        this.port = Configs.natPort;
        this.soc = dgram.createSocket({type: 'udp4', reuseAddr: true});
        this.slaveSoc = dgram.createSocket('udp4');
        this.soc.on('message', this.listener);
        this.slaveSoc.on("message", (msg: Buffer, info: dgram.RemoteInfo) => {
            const message = msg.toString('utf-8').split('\r\n');
            if (message.length !== 3 || message[0] !== NatMsgType.receivePublicAddress.toString()) return;
        });
    }

    // udp监听处理函数
    private listener(message: Buffer, info: dgram.RemoteInfo) {
        Logger.info(`Received message ${message} from ${info.address}:${info.port}`);
        const context = message.toString('utf-8').split('\r\n');
        if (context.length !== 3) return;
        switch (context[0]) {
            case NatMsgType.connectPeer.toString():
                this.soc.send(udpPayload(NatMsgType.peerReply, context[1], ""), info.port, info.address);
                break;
            case NatMsgType.peerReply.toString():
                // 接收到确认消息后，停止udp通讯请求
                this.connecting.withLock((m) => {
                    const item = m.get(`${info.address}:${info.port}`);
                    item?.timeout.close();
                    clearInterval(item?.task);
                }).then();
                this.heartbeat(info.address, info.port).then();
                // 收到确认，向渲染进程发送成功消息
                ipcRenderer.send(`nat-connect-${info.address}:${info.port}`, true);
                break;
            case NatMsgType.heartbeat.toString():
                this.soc.send(udpPayload(NatMsgType.heartbeatBack, context[1], ""), info.port, info.address);
                break;
            case NatMsgType.heartbeatBack.toString():
                Logger.debug('heartbeatSuccess')
                // 接收到成功消息后置零计数器
                this.heartbeatTarget.withLock((m) => {
                    let item = m.get(`${info.address}:${info.port}`);
                    if (item) {

                        item.count = 0;
                    }
                }).then()
                break;
            case NatMsgType.receivePublicAddress.toString():

        }
    }

    // 完成nat连接后的心跳检测
    private async heartbeat(host: string, port: number): Promise<void> {
        const id = setInterval(async () => {
            // 每发送一次心跳检测，计数器加一
            await this.heartbeatTarget.withLock((m) => {
                let item = m.get(`${host}:${port}`)
                if (item) {
                    item.count += 1
                    // 累计计数器达到10则断开连接
                    if (item.count > 10) {
                        this.disconnect(host, port).then(() => {
                        })
                        ipcRenderer.send(`nat-lose-${host}:${port}`);
                    }
                }
            })
            this.soc.send(`heartbeat`, port, host, async (error, bytes) => {
                if (error) {
                    Logger.error(`heartbeat send failed: ${error}`);
                }
            });
        }, 2000)
        await this.heartbeatTarget.set(`${host}:${port}`, { call: id, count: 0 });
    }

    // 10秒内持续向目标地址发送udp信息，成功通信后维持心跳检测
    public async connect(host: string, port: number): Promise<void> {
        // 持续发起连接请求，直到收到回复
        const task = setInterval(() => {
            this.soc.send(udpPayload(NatMsgType.connectPeer, uuid(), ""), port, host, async (error, bytes) => {
                if (error) {
                    Logger.debug("nat punch failed of " + `${host}:${port}`, error);
                    return;
                }
            })
        }, 500)
        // 十秒内连接失败则向渲染进程发送失败信号
        const t = setTimeout(async () => {
            clearInterval(task);
            ipcRenderer.send(`nat-connect-${host}:${port}`, false)
        }, 10000);
        await this.connecting.set(`${host}:${port}`, { task: task, timeout: t });
    }

    // 仅仅是停止心跳检测
    public async disconnect(host: string, port: number): Promise<void> {
        // 先确认是否正在进行连接任务
        await this.connecting.withLock((m) => {
            const item = m.get(`${host}:${port}`);
            if (item === undefined) return;
            item.timeout.close();
            clearInterval(item.task);
            m.delete(`${host}:${port}`);
        })
        // 关闭心跳检测
        const item = await this.heartbeatTarget.pop(`${host}:${port}`);
        if (item) {
            clearInterval(item.call);
        }
    }

    public open(): void {
        this.soc.bind(this.port);
        this.slaveSoc.bind(this.port + 1);
    }

    public close(): void {
        this.soc.close();
        this.slaveSoc.close();
    }

}

export const natHandler = new NatCreator();

export type NatMethod = "connect" | "disconnect" | "open" | "close";


export async function handleIPC(method: NatMethod, ...args: any[]): Promise<any> {
    switch (method) {
        case "connect":
            return await natHandler.connect(args[0], args[1]);
        case "disconnect":
            return await natHandler.disconnect(args[0], args[1]);
        case "open":
            return natHandler.open();
        case "close":
            return natHandler.close();

    }
}