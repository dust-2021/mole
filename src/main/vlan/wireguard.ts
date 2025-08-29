import crypto from "crypto";

/*
* windows 本地虚拟局域网管理，基于wireguard完成跨NAT的局域网组建
* */
export class Wg {
    public readonly privateKey: string = crypto.randomBytes(16).toString("base64");
    public readonly publicKey: string = crypto.createPublicKey(this.privateKey).toString();

    public selfVlanIP: string = "";

    public check(): boolean {
        return true;
    }


    public add(target: string): void {

    }

}