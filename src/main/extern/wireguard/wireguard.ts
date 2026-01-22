import { platform } from "process";
import { Configs, Logger, environment } from "../../public";
import { wgApi, WireGuardLoggerCallback_R } from "./ctype"
import path = require("path");
import { WireGuardAPI as winApi } from "./wgWindows";
import nacl from 'tweetnacl';
import dns from 'dns/promises';
import * as net from 'net';

function generateCurve25519Key() {
    const keyPair = nacl.box.keyPair();
    let pri = new Uint8Array(keyPair.secretKey);
    // 清除第一字节最低三位
    pri[0] &= 248;
    // 清除最后字节最高位
    pri[31] &= 127;
    // 设置最后字节次高位为1
    pri[31] |= 64;

    return { publicKey: nacl.scalarMult.base(pri), privateKey: pri }
}

/**
 * 访问dll，通过dll实现对wireguard的管理
 * 无需考虑并发问题，koffi实现一定是串行
 */
class Wg {
    private lib: wgApi;
    public public_key: Uint8Array;
    private private_key: Uint8Array;
    constructor() {
        if (platform == 'win32') {
            this.lib = winApi;
        } else {
            throw Error("platform error: not support for " + platform);
        }
        const data = generateCurve25519Key();
        this.private_key = Uint8Array.from(data.privateKey);
        this.public_key = Uint8Array.from(data.publicKey);
        this.lib.set_env(environment);
        this.lib.set_logger(WireGuardLoggerCallback_R);
    }

    // 创建vlan局域网适配器
    public async create_room(name: string, ip: string, ip_area: string): Promise<boolean> {
        const resp = this.lib.create_adapter(name, Buffer.from(this.public_key), Buffer.from(this.private_key), ip, ip_area, Configs.wgPort);
        if (resp.code != 0) {
            Logger.info(`创建wireguard房间失败: ${resp.code}, ${resp.msg}`);
            return false;
        };
        Logger.info(`创建适配器：${name}`)
        return true;
    }

    // 删除vlan局域网适配器
    public async del_room(name: string): Promise<boolean> {
        const f = this.lib.del_adapter(name).code == 0;
        Logger.info(`关闭适配器： ${name} ${f ? "成功" : "失败"}`);
        return f;
    }

    public async add_peer(room: string, name: string, host: string, port: number, pub_key: string, vlan_ip: string[], vlan_ip_count: number): Promise<boolean> {
        let target: string;
        if (net.isIP(host)) {
            target = host;
        } else {
            const ips = await dns.resolve(host);
            if (ips.length == 0) return false;
            target = ips[0];
        }
        const resp = this.lib.add_peer(room, name, target, port, Buffer.from(pub_key, "base64"), vlan_ip, vlan_ip_count);
        if (resp.code != 0) {
            Logger.info(resp.msg);
            return false;
        };
        Logger.debug(`房间${room}添加成员：${name}，vlan：${vlan_ip}，endpoint: ${target}:${port}`);
        return true;
    }

    public async del_peer(room: string, name: string): Promise<boolean> {
        return this.lib.del_peer(room, name).code == 0;
    }

    public async run_adapter(name: string): Promise<boolean> {
        const resp = this.lib.run_adapter(name);
        if (resp.code != 0) {
            Logger.info(`启动wireguard适配器失败: ${resp.code}, ${resp.msg}`);
            return false;
        }
        Logger.debug(`启动适配器：${name}`);
        return true;
    }

    // 暂停适配器
    public async pause_adapter(name: string): Promise<boolean> {
        const resp = this.lib.pause_adapter(name);
        if (resp.code != 0) {
            Logger.info(`停止wireguard适配器失败: ${resp.code}, ${resp.msg}`);
            return false;
        }
        Logger.debug(`停止适配器：${name}`);
        return true;
    }

    public async get_adapter_config(name: string): Promise<string> {
        const buffer = Buffer.alloc(1024);
        const resp = this.lib.get_adapter_config(name, buffer, 1024);
        if (resp.code === 0) return buffer.toString();
        return "";
    }

    // 释放dll
    public dispose() {
        this.lib.unload();
    }
}

export const WgHandler: Wg = new Wg();
