import path from 'path';
import { app, ipcMain } from "electron";
import os from 'os';
import fs = require('fs');
import { Configs, Logger } from "./public";
import { handleIPC, natHandler } from "./nat";
import { WgHandler } from './extern/wireguard/wireguard';

// 注册主进程和渲染进程通信接口
export function initialIPC(ipc: typeof ipcMain) {
    ipc.handle("loadLocal", (Event, name: string) => {
        const p = path.join(app.getPath('userData'), name + '.json');
        try {
            return fs.readFileSync(p, 'utf8');
        } catch (e) {
            return
        }
    })

    ipc.handle("saveLocal", (Event, name: string, data: string) => {
        fs.writeFileSync(path.join(app.getPath('userData'), name + '.json'), data);
    })
    ipc.handle("macAddress", (Event) => {
        return getMacAddress();
    })
    ipc.handle("nat", (Event, method: string, address: string) => {
        handleIPC(method, address);
    });
    ipc.handle("log", (Event, level: string, message: string) => {
        Logger.log(level, message);
    })
    ipc.handle("getConfig", (Event, name: string) => {
        return Configs.get(name);
    })
    ipc.handle("setConfig", (Event, name: string, value: any) => {
        Configs.update(name, value);
    })

    // 虚拟局域网相关接口
    ipc.handle("wireguard-createRoom", (Event, roomName: string) => { return WgHandler.create_room(roomName); })
    ipc.handle("wireguard-delRoom", (Event, roomName: string) => { return WgHandler.del_room(roomName); })
    ipc.handle("wireguard-addPeer", (Event, roomName: string, peerName: string, ip: string,
        port: number, pub_key: string, vlan_ip: string, vlan_mask: number
    ) => { return WgHandler.add_peer(roomName, peerName, ip, port, pub_key, vlan_ip, vlan_mask); })
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