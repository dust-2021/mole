import {Api, Public, Services} from './public/public';
import {login, logout, register} from './api/user';
import {serverTime} from './api/server';
import path from 'path';
import {ipcMain} from "electron";
import {request, wsRequest} from "./app/channel";

function initialApi() {
    Api.set("login", login);
    Api.set("logout", logout);
    Api.set("register", register);
    Api.set("serverTime", serverTime);
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
    Services.set("default", {host: "http://127.0.0.1", port: 8000, users: [], defaultUser: {username: '13900004990', password: '123456'}})
    initialIPC(ipc);
    initialApi();
}