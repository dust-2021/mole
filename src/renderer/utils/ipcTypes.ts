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

// 使用ipc调用对服务器的http网络请求，网络错误时electron会提示错误，请求错误则需要处理
export async function request(req: HttpReq): Promise<HttpResp> {
    return await window['electron'].invoke('request', req);
}

function wsFailedHandler() {

}

// 发送ws消息并返回ipc回调函数引用
export async function wsRequest(req: ipcWsReq, timeout: number = 2000,
                                callback?: (resp: wsResp) => any, timeoutFunc?: () => any): Promise<void> {
    if (req.uuid === undefined || req.uuid === '') {
        req.uuid = uuid().toString();
    }
    await window['electron'].invoke("wsRequest", req);
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
    let listener = function (resp: wsResp) {
        clearTimeout(timer);
        if (callback) {
            callback(resp);
        } else {
            if (resp.statusCode !== 0) {
                ElMessage({
                    showClose: true,
                    message: `ws请求失败:${resp.data}`,
                    type: 'error'
                })
            }
        }
    }
    ipcOnce(req.uuid, listener);
}

// 账号信息
export type user = {
    username: string,
    password: string,
}

// 服务器信息
export type server = {
    host: string;
    port: number;
    users: user[];
    defaultUser?: user;
    token?: string;
}

