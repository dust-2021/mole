import { platform } from "process";
import { Configs, Logger, environment } from "../../public";
import {c_type, wgApi, WireGuardLoggerCallback_R} from "./ctype"
import path = require("path");
import { WireGuardAPI as winApi} from "./wgWindows";
import nacl from 'tweetnacl';
import koffi = require('koffi');

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

    public create_room(name: string): boolean {
        const resp = this.lib.create_room(name, Buffer.from(this.public_key), Buffer.from(this.private_key), Configs.natPort);
        if(resp.code != 0) {
            Logger.info(`创建wireguard房间失败: ${resp.code}, ${resp.msg}`);
            return false;
        };
        return true;
    }

    public del_room(name: string): boolean {
        return this.lib.del_room(name).code == 0;
    }

    public add_peer(room: string, name: string, ip: string, port: number, pub_key: string, vlan_ip: string, vlan_mask: number): boolean {
        const resp = this.lib.add_peer(room, name, ip, port, Buffer.from(pub_key, "base64"), vlan_ip, vlan_mask);
        if(resp.code != 0){
            Logger.info(resp.msg);
            return false;
        }
        return true;
    }

    public del_peer(room: string, name: string) : boolean{
        return this.lib.del_peer(room, name).code == 0;
    }

    public dispose() {
        this.lib.unload();
    }
}

export const WgHandler: Wg = new Wg();
