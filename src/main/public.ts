import path = require('path');
import fs = require('fs');
import {app, ipcRenderer} from "electron";

const storePath = app.getPath('userData');

// src目录，编译后的dist目录
export const BaseDir = path.dirname(__dirname);

const env = process.env.MOLE_ENV;
export let environment: string = env ? env : "pro";

// 向窗口发送消息
export function sendToFront(type_ : 'info' | 'warning' | 'success' | 'error', msg: string): void {
    ipcRenderer.send('msg', type_, msg);
}

// app设置项
class AppConfig {
    private attribute: Map<string, any>;
    private static readonly path: string = path.join(storePath, 'config.json');

    public constructor() {
        this.attribute = new Map<string, any>();
        try {
            const mem: [string, any][] = JSON.parse(fs.readFileSync(AppConfig.path, 'utf8'));
            for (const key of mem) {
                this.attribute.set(key[0], key[1]);
            }
        } catch (e) {
            return
        }
    }

    get loglevel(): string {
        const v = this.attribute.get('loglevel');
        return v !== undefined ? v : 'info';
    }

    get wgPort(): number {
        const port = this.attribute.get('wgPort');
        return port !== undefined ? port : 8080;
    }

    public get(name: string): any | undefined {
        return this.attribute.get(name);
    }

    public update(key: string, value: any) {
        this.attribute.set(key, value);
    }

    public save() {
        const data = JSON.stringify(Array.from(this.attribute.values()));
        fs.writeFileSync(AppConfig.path, data);
    }
}

// app设置
export const Configs = new AppConfig();

import winston = require('winston');

// 配置日志记录器
const logFile = path.join(storePath, 'logs', 'mole.log');

const logOutpot = [];

if(environment === "dev") {
    logOutpot.push(new winston.transports.Console({format: winston.format.simple()}));
    Configs.update("loglevel", "debug");
} else {
    logOutpot.push(new winston.transports.File({
            filename: logFile, format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({timestamp, level, message}) => `${timestamp} ${level}: ${message}`)
            )
        })  // 日志文件输出
    )
}

export const Logger = winston.createLogger({
    level: Configs.loglevel, // 默认日志级别
    transports: logOutpot
});


Logger.info(`app run on env: ${environment}, log level: ${Configs.loglevel}`);

