import { platform } from "process";
import { Configs, Logger, environment } from "../../public";
import {wgApi, WireGuardLoggerCallback_R} from "./ctype"
import path = require("path");
import { WireGuardAPI as winApi} from "./wgWindows";
import nacl from 'tweetnacl';
import dns from 'dns/promises';

function generateEd25519KeyPairNode() {
  const pair = nacl.sign.keyPair();
  const pri = pair.secretKey.slice(0, 32);
  const pub = pair.publicKey;
  return {publicKey: new Uint8Array(pub), privateKey: new Uint8Array(pri)}
}

class Wg {
    private lib : wgApi;
    public public_key: Uint8Array;
    private private_key: Uint8Array;
    constructor() {
        if( platform == 'win32') {
            this.lib = winApi;
        } else {
            throw Error("platform error: not support for " + platform);
        }
        const data = generateEd25519KeyPairNode();
        this.private_key = data.privateKey;
        this.public_key = data.publicKey;
        this.lib.set_env(environment);
        this.lib.set_logger(WireGuardLoggerCallback_R);
    }

    // 创建vlan局域网适配器
    public async create_room(name: string): Promise<boolean> {
        const resp = this.lib.create_adapter(name, Buffer.from(this.public_key), Buffer.from(this.private_key), Configs.natPort);
        if(resp.code != 0) {
            Logger.info(`创建wireguard房间失败: ${resp.code}, ${resp.msg}`);
            return false;
        };
        return true;
    }

    // 删除vlan局域网适配器
    public async del_room(name: string): Promise<boolean> {
        return this.lib.del_adapter(name).code == 0;
    }

    public async add_peer(room: string, name: string, host: string, port: number, pub_key: string, vlan_ip: string, vlan_mask: number): Promise<boolean> {
        const ips = await dns.resolve4(host);
        if(ips.length == 0)  return false;
        const resp = this.lib.add_peer(room, name, ips[0], port, Buffer.from(pub_key, "base64"), vlan_ip, vlan_mask);
        if(resp.code != 0){
            Logger.info(resp.msg);
            return false;
        }
        return true;
    }

    public async del_peer(room: string, name: string) : Promise<boolean>{
        return this.lib.del_peer(room, name).code == 0;
    }

    // 启动适配器，开启流量转发并占用nat端口
    public async run_adapter(name: string): Promise<boolean> {
        const resp = this.lib.run_adapter(name);
        if(resp.code != 0) {
            Logger.info(`启动wireguard适配器失败: ${resp.code}, ${resp.msg}`);
            return false;
        }
        return true;
    }

    // 暂停适配器，释放端口
    public async pause_adapter(name: string): Promise<boolean> {
        const resp = this.lib.pause_adapter(name);
        if(resp.code != 0) {
            Logger.info(`停止wireguard适配器失败: ${resp.code}, ${resp.msg}`);
            return false;
        }
        return true;
    }

    // 释放dll
    public dispose() {
        this.lib.unload();
    }
}

export const WgHandler: Wg = new Wg();
