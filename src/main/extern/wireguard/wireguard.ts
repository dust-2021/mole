import { WireGuardAPI as win64, checkDLLError } from "./wgWindows";
import { platform } from "process";
import { AsyncMap } from "../../../shared/asynchronous";
import * as CType from './ctype';
import { Configs, Logger } from "../../public";
import koffi = require('koffi');
import crypto from 'crypto';

// wireguard库的日志回调，ts是1601年至今的100ns间隔数
function loggerCallback(level: CType.WIREGUARD_LOGGER_LEVEL, ts: number, msg: string): void {
    let levels: string = 'info';
    switch (level) {
        case CType.WIREGUARD_LOGGER_LEVEL.WIREGUARD_LOG_INFO:
            levels = 'info';
            break
        case CType.WIREGUARD_LOGGER_LEVEL.WIREGUARD_LOG_WARN:
            levels = 'warning';
            break;
        case CType.WIREGUARD_LOGGER_LEVEL.WIREGUARD_LOG_ERR:
            levels = 'error';
            break;
    }
    Logger.log({ level: levels, message: `[wireguard] | ${msg}` });
};

class Wg {
    private baseApi: CType.wgApi;
    private privateKey: Buffer;
    private publicKey: Buffer;
    private config: CType.adapterConfigManager;

    public constructor() {
        this.privateKey = crypto.randomBytes(32);
        this.publicKey = crypto.createHash('sha256').update(this.privateKey).digest();
        this.config = new CType.adapterConfigManager();
        this.config.setPort(Configs.natPort);
        this.config.setKey(this.publicKey, this.privateKey);
        if (platform === "win32") {
            this.baseApi = win64;
        } else {
            throw new Error("wireguard doesn't support platform: " + platform);
        }
        let cb = koffi.register(loggerCallback, koffi.pointer(CType.WireGuardLoggerCallback));
        this.baseApi.WireGuardSetLogger(cb);
    }

    private async getDllError(): Promise<string> {
        switch (platform) {
            case "win32":
                return checkDLLError();
            default:
                return "";
        }
    }

    // 检查wireguard动态库
    public async check() {
        const version = this.baseApi.WireGuardGetRunningDriverVersion();
        if (version === 0) {
            const msg = await this.getDllError();
            Logger.error(`检查wireguard驱动失败：${msg}`);
            return;
        }
        Logger.info(`wireguard驱动版本号：${version}`);
    }

    // 创建虚拟局域网房间
    public async createRoom(name: string, tunType: CType.tunnelType = CType.tunnelType.wireguardNT): Promise<boolean> {
        const handle = this.baseApi.WireGuardCreateAdapter(name, tunType, null);
        if (!handle) {
            const err = await this.getDllError();
            Logger.error(`创建适配器失败：${err}`);
            return false;
        };
        const conf = await this.config.generateDeclare();
        const result = this.baseApi.WireGuardSetConfiguration(handle, conf.interface, conf.size);
        if (!result) {
            const msg = await this.getDllError();
            Logger.error(`创建虚拟局域网失败：${msg}`);
            this.baseApi.WireGuardCloseAdapter(handle);
            return false;
        }
        return true;
    }


}

export const WgHandler: Wg = new Wg();
