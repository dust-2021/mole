import path from 'path';
import { app, ipcMain } from "electron";
import os from 'os';
import fs = require('fs');
import { Configs, Logger } from "./public";
import { handleIPC, NatMethod } from "./nat";
import { WgHandler } from './extern/wireguard/wireguard';

// 注册主进程和渲染进程通信接口
export function initialIPC(ipc: typeof ipcMain) {
    // 读取本地配置
    ipc.handle("loadLocal", (Event, name: string) => {
        const p = path.join(app.getPath('userData'), name + '.json');
        try {
            return fs.readFileSync(p, 'utf8');
        } catch (e) {
            return
        }
    })
    // 配置本地化
    ipc.handle("saveLocal", (Event, name: string, data: string) => {
        fs.writeFileSync(path.join(app.getPath('userData'), name + '.json'), data);
    })
    // 获取mac地址
    ipc.handle("macAddress", (Event) => {
        return getMacAddress();
    })
    // nat相关接口
    ipc.handle("nat", async (Event, method: NatMethod, ...args: any[]) => {
        return await handleIPC(method, ...args);
    });
    // 日志接口
    ipc.handle("log", (Event, level: string, message: string) => {
        Logger.log(level, message);
    })
    // 获取配置参数
    ipc.handle("getConfig", (Event, name: string) => {
        return Configs.get(name);
    })
    // 更新配置参数
    ipc.handle("setConfig", (Event, name: string, value: any) => {
        Configs.update(name, value);
    })

    // 虚拟局域网相关接口
    ipc.handle("wireguard-createRoom", (Event, roomName: string) => { return WgHandler.create_room(roomName); })
    ipc.handle("wireguard-delRoom", (Event, roomName: string) => { return WgHandler.del_room(roomName); })
    ipc.handle("wireguard-runAdapter", (Event, roomName: string) => { return WgHandler.run_adapter(roomName); })
    ipc.handle("wireguard-pauseAdapter", (Event, roomName: string) => { return WgHandler.pause_adapter(roomName); })
    ipc.handle("wireguard-addPeer", (Event, roomName: string, peerName: string, host: string,
        port: number, pub_key: string, vlan_ip: string, vlan_mask: number
    ) => { return WgHandler.add_peer(roomName, peerName, host, port, pub_key, vlan_ip, vlan_mask); })
    ipc.handle("wireguard-delPeer", (Event, roomName: string, peerName: string) => { return WgHandler.del_peer(roomName, peerName); })
    ipc.handle("wireguard-publicKey", (Event) => { return Buffer.from(WgHandler.public_key).toString('base64'); })

}

function getMacAddress(): string {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        if (!interfaces) continue;
        for (const item of interfaces) {
            if (!item.internal && item.mac) {
                return item.mac;
            }
        }
    }
    return "";
}

export function initialize(ipc: typeof ipcMain) {
    initialIPC(ipc);
}