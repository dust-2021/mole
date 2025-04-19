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

//
export async function ipcSend(msg: string) {
    await window['electron'].send(msg);
}

export function ipcOn(channel: string, func: (...args: any[])=> void){
    window['electron'].on(channel, func);
}

export async function request(req: HttpReq): Promise<HttpResp> {
    return await window['electron'].invoke('request', req);
}

export type user = {
    username: string,
    password: string,
}
export type server = {
    host: string;
    port: number;
    users: user[];
    defaultUser?: user;
    token?: string;
}
/*
* 封装的ipc数据类型，原数据存储在electron主进程中，通过接口函数操作原数据
* */
export class IPCContainer<T> {
    private readonly name: string;

    constructor(name: string) {
        this.name = name;
    }

    public async get(key: string): Promise<T> {
        return await window['electron'].invoke(this.name, 'get', key)
    }

    public async set(key: string, value: server): Promise<void> {
        await window['electron'].invoke(this.name, 'set', key, value);
    }

    public async delete(key: string): Promise<void> {
        await window['electron'].invoke(this.name, 'delete', key);
    }

    public async has(key: string): Promise<boolean> {
        return await window['electron'].invoke(this.name, 'has', key);
    }

    public async pop(key: string): Promise<T> {
        return await window['electron'].invoke(this.name, 'pop', key);
    }

    public async all(): Promise<Map<string, T>> {
        const resp: [string, T][] =  await window['electron'].invoke(this.name, 'all');
        return new Map<string, T>(resp);
    }

}
// 全部服务器信息
export const Services = new IPCContainer<server>('Services');
// 全部变量
export const Public = new IPCContainer<any>('Public');

