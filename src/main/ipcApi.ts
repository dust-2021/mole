import path from 'path';
import { app, ipcMain } from "electron";
import os from 'os';
import fs = require('fs');
import { Configs, Logger } from "./public";
import { handleIPC, NatMethod } from "./udp";
import { handleIPC as wgIpc } from './extern/wireguard/wireguard';

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
    ipc.handle("udp", async (Event, method: NatMethod, ...args: any[]) => {
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
    ipc.handle("wireguard", async (Event, type_: string, ...args: any[]) => {
        return await wgIpc(type_, ...args);
    });
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