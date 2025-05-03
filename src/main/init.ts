import {Api, Public, Services} from './public/public';
import {registerApis as userApi} from './api/user';
import {registerApis as systemApi} from './api/server';
import path from 'path';
import {ipcMain} from "electron";
import {request, wsRequest} from "./app/channel";
import {natHandler} from './ws/nat'

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
    ipc.handle("request", request)
    ipc.handle("wsRequest", wsRequest)
}

export function initialize(ipc: typeof ipcMain) {
    Public.set("basedir", path.dirname(__dirname));
    // natHandler.stun("127.0.0.1", 8001).then();
    Services.set("default", {host: "http://127.0.0.1", port: 8000, users: [], defaultUser: {username: 'mole', password: '123456'}})
    initialIPC(ipc);
    initialApi();
}