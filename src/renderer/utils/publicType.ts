import { ElMessage } from "element-plus";
import { Token } from "./token";

export type HttpResp = {
    code: number,
    data?: any,
    message?: string
}

export type wsReq = {
    id: string,
    method: string,
    params: any[],
    signature?: string,
}

export type wsResp = {
    id: string;
    method: string;
    statusCode: number;
    data: any; // statusCode不为0时，data是string类型的错误信息
};

// 发送ipc信号
export async function ipcSend(msg: string) {
    await window['electron'].send(msg);
}

export async function ipcInvoke(key: string, ...args: any[]): Promise<any> {
    return await window['electron'].invoke(key, ...args);
}

export function log(level: string, message?: string) {
    window['electron'].invoke('log', level, message).then();
}

// ipc事件监听
export function ipcOn(channel: string, func: (...args: any[]) => void) {
    window['electron'].on(channel, func);
}

// 取消ipc事件监听，必须传入开启监听时的函数引用
export function ipcRemove(channel: string, func: (...args: any[]) => void) {
    window['electron'].remove(channel, func);
}

export function ipcOnce(channel: string, func: (...args: any[]) => void) {
    window['electron'].once(channel, func);
}

// 账号信息
export type user = {
    username: string,
    userUuid: string,
    password: string,
    perm?: string[],
}

// 服务器信息
export type server = {
    host: string;
    port: number;
    // 是否为https
    certify: boolean;
    users: user[];
    defaultUser?: user;
    token?: Token;
    wgInfo?: {publicKey: string, listenPort: number,
    vlanIp: [number, number]
}
}

// nat打洞相关接口
export const natFunc = {
    open: async () => { return await ipcInvoke('nat', 'open'); },
    close: async () => { return await ipcInvoke('nat', 'close'); },
    // nat打洞，cb参数为可选的连接结果回调函数
    connect: async (ip: string, port: number, cb?: (flag: boolean) => void) => {
        if (cb) {
            ipcOnce(`nat-connect-${ip}:${port}`, (flag: boolean) => {
                cb(flag);
            });
        }
        return await ipcInvoke('nat', 'connect', ip, port);
    },
    disconnect: async (ip: string, port: number) => { return await ipcInvoke('nat', 'disconnect', ip, port); },
    onLose: (address: string, func: () => void) => {
        ipcOnce(`nat-lose-${address}`, func);
    },
    removeLose: (address: string, func: () => void) => {
        ipcRemove(`nat-lose-${address}`, func);
    }
}

ipcOn('msg', (type_: 'info' | 'success' | 'error' | 'warning', msg: string) => {
    ElMessage({
        type: type_,
        message: msg
    })
})

export const wireguardFunc = {
    // 创建wireguard房间，ip是本机vlan地址，ip_area是vlan网段
    createRoom: async (roomName: string, ip: string, ip_area: string): Promise<boolean> => { return await ipcInvoke("wireguard-createRoom", roomName, ip, ip_area); },
    // 删除wireguard房间
    delRoom: async (roomName: string): Promise<boolean> => { return await ipcInvoke("wireguard-delRoom", roomName); },
    // 启动wireguard适配器
    runAdapter: async (roomName: string): Promise<boolean> => { return await ipcInvoke("wireguard-runAdapter", roomName); },
    // 暂停wireguard适配器
    pauseAdapter: async (roomName: string): Promise<boolean> => { return await ipcInvoke("wireguard-pauseAdapter", roomName); },

    addPeer: async (roomName: string, peerName: string, ip: string, port: number,
        pub_key: string, vlan_ip: string[], vlan_ip_count: number
    ): Promise<boolean> => { return await ipcInvoke("wireguard-addPeer", roomName, peerName, ip, port, pub_key, vlan_ip, vlan_ip_count); },
    // 删除peer
    delPeer: async (roomName: string, peerName: string): Promise<boolean> => { return await ipcInvoke("wireguard-delPeer", roomName, peerName); },
    // 获取base64编码格式公钥
    getPublicKey: async (): Promise<string> => { return await ipcInvoke("wireguard-publicKey") }
}

// =========== Error Code ===========

const errMapping: Map<number, string> = new Map([
    [-1, "请求失败"],
    [1, "未知错误"],
    [10001, "报文格式错误"],
    [10002, "数据内容错误"],
    [10003, "超时"],
    [10004, "未找到"],
    [10005, "请求过多"],
    [10006, "已存在"],

    [10101, "无效的Token"],
    [10102, "错误的Token"],
    [10103, "黑名单Token"],
    [10104, "权限不足"],
    [10105, "IP限制"],
    [10106, "路由限制"],
    [10107, "用户限制"],

    [10201, "WebSocket解析失败"],
    [10202, "WebSocket重复认证"]
]);

export function getErrMsg(code: number): string {
    return errMapping.get(code) || `未知错误，错误码：${code}`;
}
