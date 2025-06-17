// 和electron通信的类型规范
import {v4 as uuid} from 'uuid'
import {ElMessage} from "element-plus";

export type HttpReq = {
    serverName: string,
    apiName: string,
    args?: any[]
}

export type HttpResp = {
    success: boolean,
    statusCode: number,
    data?: any,
    msg?: string
}

export type ipcWsReq = {
    serverName: string,
    uuid?: string,
    apiName: string,
    args: any[]
}

export type wsResp = {
    id: string;
    method: string;
    statusCode: number;
    data: any;
};

// 发送ipc信号
export async function ipcSend(msg: string) {
    await window['electron'].send(msg);
}

// ipc事件监听
export function ipcOn(channel: string, func: (...args: any[]) => void) {
    window['electron'].on(channel, func);
}

// 取消ipc事件监听，必须传入开启监听时的函数引用
export function ipcRemove(channel: string, func: (...args: any[]) => void) {
    window['electron'].remove(channel, func);
}

export function ipcOnce(channel: string, func: (...args: any[]) => void) {
    window['electron'].once(channel, func);
}

// 使用ipc调用对服务器的http网络请求
export async function request(req: HttpReq): Promise<HttpResp> {
    return await window['electron'].invoke('request', req);
}

// 发送ws消息并返回ipc回调函数引用
export async function wsRequest(req: ipcWsReq, once: boolean = true, timeout: number = 2000,
                                callback?: (resp: wsResp) => any, timeoutFunc?: () => any): Promise<(r: wsResp) => any | null> {
    if (req.uuid === undefined || req.uuid === '') {
        req.uuid = uuid().toString();
    }
    await window['electron'].invoke("wsRequest", req);
    let listener = null;
    if (callback === undefined || callback === null) {
        return listener;
    }

    if (timeout === undefined || timeout === null || timeout <= 0) {
        timeout = 2000;
    }
    const timer = setTimeout(() => {
        if (timeoutFunc) {
            timeoutFunc();
        } else {
            ElMessage({
                showClose: true,
                message: `访问服务器：${req.serverName}-${req.apiName}超时`,
                type: 'error'
            })
        }
    }, timeout);
    listener = function (resp: wsResp) {
        clearTimeout(timer);
        callback(resp);
    }
    if (once) {
        ipcOnce(req.uuid, listener);
    } else {
        ipcOn(req.uuid, listener);
    }
    return listener;
}

// 账号信息
export type user = {
    username: string,
    password: string,
}

export type connection = {
    connected: boolean,
    user: user,
}

// 服务器信息
export type server = {
    host: string;
    port: number;
    users: user[];
    defaultUser?: user;
    token?: string;
}

