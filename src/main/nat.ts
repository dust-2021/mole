import { Logger, Configs } from "./public";
import dgram = require('dgram')
import { AsyncMap } from "../shared/asynchronous";
import { ipcRenderer } from "electron";

enum UdpMsgType {
    // 向公网服务器获取本机公网地址
    getPublicAddressMain = "getPublicAddressMain",
    // 副端口确认nat类型，不同端口的公网地址是否相同
    getPublicAddressSlave = "getPublicAddressSlave",
    connectPeer = "connectPeer",
    // 接收公网地址
    receivePublicAddress = "receivePublicAddress",

    peerReply = "peerReply",
}

function udpPayload(type: UdpMsgType, uuid: string, data: string): string {
    return `${type}\r\n${uuid}\r\n${data}`;
}

/**
 * NAT穿透类
 * 负责nat打洞，打洞完成后释放端口，由wireguard适配器占用端口进行通信
 */
class UdpHandler {

    private soc: dgram.Socket;
    private slaveSoc: dgram.Socket;
    private readonly port: number;
    // 存储连接任务和连接超时控制
    private connecting: AsyncMap<string, { task: NodeJS.Timeout, timeout: NodeJS.Timeout }> = new AsyncMap();

    constructor() {
        this.port = Configs.udpPort;
        this.soc = dgram.createSocket('udp4');
        this.slaveSoc = dgram.createSocket('udp4');
        this.soc.on('message', this.listener);
        this.slaveSoc.on("message", (msg: Buffer, info: dgram.RemoteInfo) => {
            const message = msg.toString('utf-8').split('\r\n');
            if (message.length !== 3 || message[0] !== UdpMsgType.receivePublicAddress.toString()) return;
        });
        this.soc.bind(this.port);
        this.slaveSoc.bind(this.port + 1);
    }

    // udp监听处理函数
    private listener(message: Buffer, info: dgram.RemoteInfo) {
        Logger.info(`Received message ${message} from ${info.address}:${info.port}`);
        const context = message.toString('utf-8').split('\r\n');
        if (context.length !== 3) return;
        switch (context[0]) {
            case UdpMsgType.connectPeer.toString():
                this.soc.send(udpPayload(UdpMsgType.peerReply, context[1], ""), info.port, info.address);
                break;
            case UdpMsgType.peerReply.toString():
                // 接收到确认消息后，停止udp通讯请求
                this.connecting.withLock((m) => {
                    const item = m.get(`${info.address}:${info.port}`);
                    item?.timeout.close();
                    clearInterval(item?.task);
                }).then();
                // 收到确认，向渲染进程发送成功消息
                ipcRenderer.send(`udp-connect-${context[1]}`, true);
                break;
            case UdpMsgType.receivePublicAddress.toString():


        }
    }

    // 10秒内持续向目标地址发送udp信息
    public async connect(host: string, port: number, uid: string, timeout_s: number): Promise<void> {
        // 持续发起连接请求，直到收到回复
        const task = setInterval(() => {
            this.soc.send(udpPayload(UdpMsgType.connectPeer, uid, ""), port, host, async (error, bytes) => {
                if (error) {
                    Logger.debug("connect send failed of " + `${host}:${port}`, error);
                    return;
                }
            })
        }, 500)
        // 十秒内连接失败则向渲染进程发送失败信号
        const t = setTimeout(async () => {
            clearInterval(task);
            // 发送失败信号
            ipcRenderer.send(`udp-connect-${uid}`, false)
        }, timeout_s * 1000);
        await this.connecting.set(uid, { task: task, timeout: t });
    }
}

export const udpHandle = new UdpHandler();

export type NatMethod = "connect";


export async function handleIPC(method: NatMethod, ...args: any[]): Promise<any> {
    switch (method) {
        case "connect":
            return await udpHandle.connect(args[0], args[1], args[2], args[3]);
    }
}