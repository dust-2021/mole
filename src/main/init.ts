import {Configs, Public, Services} from './public/public';
import {Connection} from './ws/connection'
import {registerApis as userApi} from './api/user';
import {registerApis as systemApi} from './api/server';
import path from 'path';
import {ipcMain} from "electron";
import {request, wsRequest} from "./app/channel";
import os from 'os';
import {WebSocket} from "ws";

function initialApi() {
    userApi();
    systemApi();
}

// 注册主进程和渲染进程通信接口
export function initialIPC(ipc: typeof ipcMain) {
    ipc.handle("Public", (Event, method: string, ...args) => {
        return Public.call(method, ...args);
    })
    ipc.handle("Services", (Event, method: string, ...args) => {
        return Services.call(method, ...args);
    })
    ipc.handle("Configs", (Event, method: string, ...args) => {
        return Configs.call(method, ...args);
    })
    ipc.handle("request", request)
    ipc.handle("wsRequest", wsRequest)
    ipc.handle("wsActive", (Event, serverName: string) => {
        const conn = Connection.getInstance(serverName);
        conn.active();
        return conn.conn?.readyState === WebSocket.OPEN;
    })
    ipc.handle("wsClose", (Event, serverName: string) => {
        if (!Connection.All.has(serverName)) {
            return true;
        }
        const conn = Connection.getInstance(serverName);
        conn.close();
        return conn.conn?.readyState === WebSocket.CLOSED || conn.conn?.readyState === WebSocket.CLOSING;
    })
}

function getMacAddress(): string | undefined {
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
    return undefined;
}

export function initialize(ipc: typeof ipcMain) {
    if (!Public.has("basedir")) {
        Public.set("basedir", path.dirname(__dirname));
    }
    const macAddress = getMacAddress();
    if (macAddress) {
        Public.set("mac", macAddress);
    }
    initialIPC(ipc);
    initialApi();
}