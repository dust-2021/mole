/*
* 用于electron和vue直接通信的类型规范
* */
import path = require('path');
import fs = require('fs');
import {app} from "electron";

const storePath = app.getPath('userData');

export const BaseDir = path.dirname(path.dirname(__dirname));

export let environment: string = "dev";

class AppConfig {
    private attribute: Map<string, any>;
    private static readonly path: string = path.join(storePath, 'config.json');
    private static singleton: AppConfig = new AppConfig();

    private constructor() {
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

    static getInstance(): AppConfig {
        return AppConfig.singleton;
    }

    get loglevel(): string {
        const v = this.attribute.get('loglevel');
        return v ? v : 'info';
    }

    get natPort(): number {
        const port = this.attribute.get('port');
        return port ? port : 8080;
    }

    public get(name: string): any | undefined {
        return this.attribute.get(name);
    }

    public update(key: string, value: any) {
        if (!this.attribute.has(key)) return;
        this.attribute.set(key, value);
    }

    public save() {
        const data = JSON.stringify(Array.from(this.attribute.values()));
        fs.writeFileSync(AppConfig.path, data);
    }
}

// app设置
export const Configs = AppConfig.getInstance();

import winston = require('winston');

// 配置日志记录器
const logFile = path.join(storePath, 'logs', 'mole.log');

export const Logger = winston.createLogger({
    level: Configs.loglevel, // 默认日志级别
    transports: [
        new winston.transports.Console({format: winston.format.simple()}),  // 控制台输出
        new winston.transports.File({
            filename: logFile, format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({timestamp, level, message}) => `${timestamp} ${level}: ${message}`)
            )
        })  // 日志文件输出
    ]
});

