import { platform } from "process";
import { Configs, Logger, BaseDir, environment } from "../../public";
import {c_type, wgApi} from "./ctype"
import koffi = require('koffi');
import path = require("path");
import { generateKeyPair } from 'crypto';
import { WireGuardAPI } from "./wgWindows";

function generateEd25519KeyPairNode(): Promise<{ publicKey: string; privateKey: string }> {
  return new Promise((resolve, reject) => {
    generateKeyPair('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    }, (err, publicKey, privateKey) => {
      if (err) reject(err);
      else resolve({ publicKey, privateKey });
    });
  });
}

class Wg {
    private lib : wgApi;
    public public_key: string = "";
    private private_key: string = "";
    constructor() {
        if( platform == 'win32') {
            this.lib = WireGuardAPI;
        } else {
            throw Error("platform error: not support for " + platform);
        }
        generateEd25519KeyPairNode().then((res) => {this.public_key = res.publicKey; this.private_key = res.privateKey;});
        if( environment == "dev") {
            Logger.info("wireguard keys: ", this.public_key, ";", this.private_key);
        }
    }
}

export const WgHandler: Wg = new Wg();
