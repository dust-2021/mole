/*
* 用于electron和vue直接通信的类型规范
* */
import path = require('path');
import fs = require('fs');
import {app, BrowserWindow} from "electron";

const storePath = app.getPath('userData');

class globals<T> {
    private readonly data = new Map<string, T>();
    private readonly storeKey: string;

    constructor(storeKey: string) {
        this.storeKey = storeKey;
        const p = path.join(storePath, storeKey + '.memory');
        try {
            const mem: [key: string, value: any][] = JSON.parse(fs.readFileSync(p, 'utf8'));
            this.data = new Map<string, T>(mem);
        } catch (e) {
            return
        }
    }

    public set(key: string, data: T) {
        this.data.set(key, data);
    }

    public get(key: string): T | null {
        const item = this.data.get(key);
        if (item) {
            return item;
        }
        return null;
    }

    public delete(key: string): void {
        this.data.delete(key);
        return
    }

    // 获取并删除
    public pop(key: string): T | null {
        const item = this.data.get(key);
        if (item) {
            this.data.delete(key);
            return item;
        }
        return null;
    }

    public has(key: string): boolean {
        return this.data.has(key);
    }

    public all(): [string, T][] {
        let results: [string, T][] = [];
        this.data.entries().forEach((v, i) => (
            results.push(v)
        ));
        return results;
    }

    public call(method: string, ...args: any): any {
        if (method === "call") {
            throw new Error("circle calling of method 'call'");
        }
        if (this[method as keyof this] instanceof Function) {
            return (this[method as keyof this] as Function)(...args);
        }
    }

    public save(): void {
        fs.writeFileSync(path.join(storePath, this.storeKey + '.memory'), JSON.stringify(Array.from(this.data)));
    }
}

// 后端http响应规范
export type HttpResp = {
    success: boolean,
    statusCode: number,
    data?: any,
    msg?: string
}

// ipc传递http请求规范
export type ipcHttpReq = {
    serverName: string,
    apiName: string,
    args: any[]
}
// ws发送信息格式 和服务器对应
export type wsReqBody = {
    method: string;
    id: string;
    params: any[],
    signature?: string;
};
// ws接收信息格式 和服务器对应
export type wsRespBody = {
    id: string;
    statusCode: number;
    data: any;
};

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

export type httpHandler = (svr: server, ...args: any) => Promise<HttpResp>
export type wsHandler = (r: wsRespBody) => Promise<any>;

// 全局变量
export const Public = new globals<any>('Public');
// 服务器接口
export const Api = new globals<httpHandler>('Api');

export const WsApi = new globals<wsHandler>('WsApi');
// 服务器
export const Services = new globals<server>('Services');
// 渲染窗口
export const Windows = new globals<BrowserWindow>('Windows');
