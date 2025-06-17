/*
* 用于electron和vue直接通信的类型规范
* */
import path = require('path');
import fs = require('fs');
import {app, BrowserWindow} from "electron";

const storePath = app.getPath('userData');

// 通用封装map类型，storeKey为持久化文件名，未传递则不保存
class globals<T> {
    private readonly data = new Map<string, T>();
    private readonly storeKey: string = "";

    constructor(storeKey?: string) {
        if (!storeKey) {
            return;
        }
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

    public get(key: string, defaultValue?: T): T | null {
        const item = this.data.get(key);
        if (item) {
            return item;
        }
        return defaultValue ? defaultValue : null;
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
        if (!this.storeKey){
            return;
        }
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

// ipc传递ws请求规范
export type ipcWsReq = {
    serverName: string,
    uuid: string,
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
    method: string;
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

// http请求处理函数类型，等待结果返回并处理
export type httpHandler = (svr: server, ...args: any) => Promise<HttpResp>;
// ws请求发送函数类型，不等待请求结果
export type wsSender = (r: wsReqBody) => Promise<void>;
// 监听并处理ws请求
export type wsListener = (serverName: string, r: wsRespBody) => Promise<void>;

// 全局变量
export const Public = new globals<any>('Public');
// app设置
export const Configs = new globals<any>('Configs');
// 服务器接口
export const Api = new globals<httpHandler>();
// ipc可调用ws接口
export const WsApi = new globals<wsSender>();
// ws监听处理函数
export const WsHandler = new globals<wsListener>();
// 服务器
export const Services = new globals<server>('Services');
// 渲染窗口
export const Windows = new globals<BrowserWindow>();

import winston = require('winston');

// 配置日志记录器
const logPath = path.join(storePath, 'logs');
const logFile = path.join(logPath, 'app.log');

export const Logger = winston.createLogger({
    level: Configs.get("logLevel", "info"), // 默认日志级别
    transports: [
        new winston.transports.Console({ format: winston.format.simple() }),  // 控制台输出
        new winston.transports.File({ filename: logFile, format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
            ) })  // 日志文件输出
    ]
});

