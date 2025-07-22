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

export type wsReq = {
    id: string,
    method: string,
    params: any[],
    signature?: string,
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

