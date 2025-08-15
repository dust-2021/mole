export type HttpResp = {
    code: number,
    data?: any,
    message?: string
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
    data: any; // statusCode不为0时，data是string类型的错误信息
};

// 发送ipc信号
export async function ipcSend(msg: string) {
    await window['electron'].send(msg);
}
export async function ipcInvoke(key: string, ...args: any[]): Promise<any> {
    return await window['electron'].invoke(key, ...args);
}

export function log(level: string, message?: string) {
    window['electron'].invoke('log', level, message).then();
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

