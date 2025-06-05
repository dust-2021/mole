// 和electron通信的类型规范

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
    uuid: string,
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
export function ipcOn(channel: string, func: (...args: any[])=> void){
    window['electron'].on(channel, func);
}

// 取消ipc事件监听
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

export async function wsRequest(req: ipcWsReq) {
    return await window['electron'].invoke("wsRequest", req);
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

