import path from 'path';
import {app, ipcMain} from "electron";
import os from 'os';
import fs = require('fs');
import {Configs, Logger} from "./public/public";
import {natHandler} from "./ws/nat";

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
    ipc.handle("nat", (Event) => {})
    ipc.handle("log", (Event, level: string, message: string) => {
        Logger.log(level, message);
    })
    ipc.handle("getConfig", (Event, name: string) => {
        return Configs.get(name);
    })
    ipc.handle("setConfig", (Event, name: string, value: any) => {
        Configs.update(name, value);
    })
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