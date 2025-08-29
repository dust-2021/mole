import {Logger, Configs} from "../public/public";
import dgram = require('dgram')
import {AsyncMap} from "../../shared/asynchronous";
import {ipcRenderer} from "electron";


class NatCreator {
    // ipc通信信号
    public static onConnectSignal: string = "nat-connect";
    public static onConnectFailed: string = "nat-connectFailed";
    public static onLose: string = "nat-lose";

    private soc: dgram.Socket;
    private slaveSoc: dgram.Socket;
    private readonly port: number;

    private heartbeatTarget: AsyncMap<{ call: NodeJS.Timeout, count: number }> = new AsyncMap();
    private connecting: AsyncMap<{ task: NodeJS.Timeout, timeout: NodeJS.Timeout }> = new AsyncMap();

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
        const context = String(message).split('\r\n');
        switch (context[0]) {
            case "connect":
                this.soc.send(`success`, info.port, info.address);
                break;
            case "success":
                // 接收到确认消息后，停止udp通讯请求
                this.connecting.withLock((m) => {
                    const item = m.get(`${info.address}:${info.port}`);
                    item?.timeout.close();
                    clearInterval(item?.task);
                }).then();
                this.heartbeat(info.address, info.port).then();
                // 收到确认，向渲染进程发送成功消息
                ipcRenderer.send(`${NatCreator.onConnectSignal}-${info.address}:${info.port}`, true);
                break;
            case "heartbeat":
                this.soc.send(`heartbeatBack`, info.port, info.address);
                break;
            case "heartbeatBack":
                Logger.debug('heartbeatSuccess')
                // 接收到成功消息后置零计数器
                this.heartbeatTarget.withLock((m) => {
                    let item = m.get(`${info.address}:${info.port}`);
                    if (item) {
                        item.count = 0;
                    }
                }).then()
                break;
            case "wgPublicKey":

                break;
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
                        ipcRenderer.send(`${NatCreator.onLose}-${host}:${port}`);
                    }
                }
            })
            this.soc.send(`heartbeat`, port, host, async (error, bytes) => {
                if (error) {
                    Logger.error(`heartbeat send failed: ${error}`);
                }
            });
        }, 2000)
        await this.heartbeatTarget.set(`${host}:${port}`, {call: id, count: 0});
    }

    // 10秒内持续向目标地址发送udp信息，成功通信后维持心跳检测
    public async connect(host: string, port: number): Promise<void> {
        // 持续发起连接请求，直到收到回复
        const task = setInterval(() => {
            this.soc.send(Buffer.from(`connect`), port, host, async (error, bytes) => {
                if (error) {
                    Logger.debug("nat punch failed of " + `${host}:${port}`, error);
                    return;
                }
            })
        }, 500)
        // 十秒内连接失败则向渲染进程发送失败信号
        const t = setTimeout(async () => {
            clearInterval(task);
            ipcRenderer.send( `${NatCreator.onConnectFailed}-${host}:${port}`, false)
        }, 10000);
        await this.connecting.set(`${host}:${port}`, {task: task, timeout: t});
    }

    public async disconnect(host: string, port: number): Promise<void> {
        // 先确认是否正在进行连接任务
        await this.connecting.withLock((m)=>{
            const item = m.get(`${host}:${port}`);
            item?.timeout.close();
            clearInterval(item?.task);
        })
        // 关闭心跳检测
        const item = await this.heartbeatTarget.pop(`${host}:${port}`);
        if (item) {
            clearInterval(item.call);
        }
    }
}

export const natHandler = new NatCreator();


export function handleIPC(method: string, address: string): any {
    const info = address.split(':')
    switch (method) {
        case "connect":
            natHandler.connect(info[0], parseInt(info[1])).then(() => {
            });
            break
        case "disconnect":
            natHandler.disconnect(info[0], parseInt(info[1])).then(() => {
            });
            break;
    }
}