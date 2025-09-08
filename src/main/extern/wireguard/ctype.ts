import { AsyncMap, RWLock } from '../../../shared/asynchronous';
import koffi = require('koffi');

// c的简单类型定义
export const c_type = {
    // char16字符串
    LPCWSTR: koffi.pointer(koffi.types.wchar),
    // char字符串
    LPCSTR: koffi.pointer(koffi.types.char),
    GUID: koffi.pointer(koffi.types.wchar),
    NET_LUID: koffi.pointer(koffi.types.wchar),
    // char数组格式IP4
    IN_ADDR: koffi.array(koffi.types.char, 4),
    // char数组格式IP6
    IN6_ADDR: koffi.array(koffi.types.char, 16),
    UNKNOWN_POINTER: koffi.pointer(koffi.types.void),
    // 网卡句柄，不透明类型的指针
    WIREGUARD_ADAPTER_HANDLE: koffi.pointer('WIREGUARD_ADAPTER_HANDLE', koffi.opaque()),
}

// 适配器类型
export enum tunnelType {
    wireguard = 'WireGuard',
    wireguardNative = 'WireGuard Native',
    wireguardUserspace = "WireGuard Userspace",
    wireguardNT = 'WireGuard NT'
}

// ip类型
export enum IPFamily {
    AF_INET = 2,
    AF_INET6 = 10
}

// 适配器日志状态
export enum WIREGUARD_ADAPTER_LOG_STATE {

    WIREGUARD_ADAPTER_LOG_OFF = 0, // No logs are generated from the driver
    WIREGUARD_ADAPTER_LOG_ON = 1, // Logs are generated from the driver.
    WIREGUARD_ADAPTER_LOG_ON_WITH_PREFIX = 2 // Logs are generated from the driver, adapter index-prefixed.
}

// 适配器状态
export enum WIREGUARD_ADAPTER_STATE {
    WIREGUARD_ADAPTER_STATE_DOWN = 0,
    WIREGUARD_ADAPTER_STATE_UP = 1
}

// 适配器状态
export enum WIREGUARD_INTERFACE_FLAG {
    WIREGUARD_INTERFACE_HAS_PUBLIC_KEY = (1 << 0), /**< The PublicKey field is set */
    WIREGUARD_INTERFACE_HAS_PRIVATE_KEY = (1 << 1), /**< The PrivateKey field is set */
    WIREGUARD_INTERFACE_HAS_LISTEN_PORT = (1 << 2), /**< The ListenPort field is set */
    WIREGUARD_INTERFACE_REPLACE_PEERS = (1 << 3)    /**< Remove all peers before adding new ones */
}

// 适配器内成员状态
export enum WIREGUARD_PEER_FLAG {
    WIREGUARD_PEER_HAS_PUBLIC_KEY = 1 << 0, /**< The PublicKey field is set */
    WIREGUARD_PEER_HAS_PRESHARED_KEY = 1 << 1, /**< The PresharedKey field is set */
    WIREGUARD_PEER_HAS_PERSISTENT_KEEPALIVE = 1 << 2, /**< The PersistentKeepAlive field is set */
    WIREGUARD_PEER_HAS_ENDPOINT = 1 << 3, /**< The Endpoint field is set */
    WIREGUARD_PEER_REPLACE_ALLOWED_IPS = 1 << 5, /**< Remove all allowed IPs before adding new ones */
    WIREGUARD_PEER_REMOVE = 1 << 6, /**< Remove specified peer */
    WIREGUARD_PEER_UPDATE_ONLY = 1 << 7               /**< Do not add a new peer */
}


// IP地址结构体
export const WIREGUARD_ALLOWED_IP = koffi.struct('WIREGUARD_ALLOWED_IP', {
    // ip地址类型
    AddressFamily: koffi.types.uint16,
    // 掩码
    Cidr: koffi.types.int8,
    // IP地址
    Address: koffi.union('Address', {
        V4: c_type.IN_ADDR, V6: c_type.IN6_ADDR,
    })
})

export interface WIREGUARD_ALLOWED_IP_js {
    Address: {
        V4?: number,
        V6?: number,
    },
    AddressFamily: number,
    Cidr: number,
}

// 格式化Ip
export function formatterIp4(address: string): WIREGUARD_ALLOWED_IP_js {
    let mask = 16;
    const item = address.split('/');
    if (item.length !== 0) {
        mask = parseInt(item[1]);
        if (mask > 32 || mask < 0) {
            throw new Error('invalid mask');
        }
    }
    const ips = item[0].split('.');
    if (ips.length !== 4) {
        throw new Error('invalid ip address');
    }
    let ipNumber = 0;
    for (let index = ips.length - 1; index >= 0; index--) {
        const element = parseInt(ips[index]);
        if (element < 0 || element > 255) {
            throw new Error('wrong ip address');
        }
        ipNumber |= (element << (index * 8));
    }
    const ip: WIREGUARD_ALLOWED_IP_js = {
        Address: {
            V4: ipNumber
        },
        AddressFamily: IPFamily.AF_INET,
        Cidr: mask
    }
    return ip;
}

// 局域网成员结构体
export const WIREGUARD_PEER = koffi.struct('WIREGUARD_PEER', {
    /**< Bitwise combination of flags */
    Flags: koffi.types.uint,
    /**< Reserved; must be zero */
    Reserved: koffi.types.int,
    /**< Public key, the peer's primary identifier */
    PublicKey: koffi.array(koffi.types.char, 32),
    /**< Preshared key for additional layer of post-quantum resistance */
    PresharedKey: koffi.array(koffi.types.char, 32),
    /**< Seconds interval, or 0 to disable */
    PersistentKeepalive: koffi.types.int,
    /**< Endpoint, with IP address and UDP port number*/
    Endpoint: c_type.IN_ADDR,
    /**< Number of bytes transmitted */
    TxBytes: koffi.types.int64,
    /**< Number of bytes received */
    RxBytes: koffi.types.int64,
    /**< Time of the last handshake, in 100ns intervals since 1601-01-01 UTC */
    LastHandshake: koffi.types.int64,
    /**< Number of allowed IP structs following this struct */
    AllowedIPsCount: koffi.types.int,
})

// wireguard日志回调函数类型定义
export const WireGuardLoggerCallback = koffi.proto('WireGuardLoggerCallback', koffi.types.void, [koffi.types.uint, koffi.types.int64, c_type.LPCWSTR]);

// wireguard日志等级，对应dll中日志回调枚举类型
export enum WIREGUARD_LOGGER_LEVEL {
    WIREGUARD_LOG_INFO = 0,
    WIREGUARD_LOG_WARN = 1,
    WIREGUARD_LOG_ERR = 2
}

export interface WIREGUARD_PEER_js {
    Flag: number, Reserved: number, PublicKey: Buffer, PresharedKey: Buffer, PersistentKeepalive?: number,
    Endpoint: string, TxBytes: number, RxBytes: number, LastHandshake?: number, AllowedIPsCount: number
}

// 虚拟网卡配置结构体
export const WIREGUARD_INTERFACE = koffi.struct('WIREGUARD_INTERFACE', {
    /**< Bitwise combination of flags */
    Flags: koffi.types.uint,
    /**< Port for UDP listen socket, or 0 to choose randomly */
    ListenPort: koffi.types.int,
    /**< Private key of interface */
    PrivateKey: koffi.array(koffi.types.uint8, 32),
    /**< Corresponding public key of private key */
    PublicKey: koffi.array(koffi.types.uint8, 32),
    /**< Number of peer structs following this struct */
    PeersCount: koffi.types.int
})

export interface WIREGUARD_INTERFACE_js {
    Flags: number, ListenPort: number, PrivateKey: Uint8Array, PublicKey: Uint8Array, PeersCount: number
}

// 适配器配置类型
export class adapterConfig {
    private interface: WIREGUARD_INTERFACE_js;
    private peers: AsyncMap<{ peer: WIREGUARD_PEER_js, allowedIP: WIREGUARD_ALLOWED_IP_js[] }>;
    private lock: RWLock = new RWLock();

    public constructor() {
        this.interface = {
            Flags: 0, ListenPort: 0, PrivateKey: new Uint8Array(), PublicKey: new Uint8Array(), PeersCount: 0
        };
        this.peers = new AsyncMap();
    };

    // 生成配置的C结构体声明
    public async generateDeclare(config: { [key: string]: WIREGUARD_INTERFACE_js | WIREGUARD_PEER_js | WIREGUARD_ALLOWED_IP_js }): Promise<koffi.IKoffiCType> {
        const release = await this.lock.acquireWrite();
        try {
            let koffiType = { Interface: WIREGUARD_INTERFACE } as { [key: string]: koffi.IKoffiCType };
            config['Interface'] = this.interface;
            this.peers.withRLock(() => {

            })
            return koffi.struct('Config', koffiType)
        } finally {
            release();
        }
    }
}


export interface wgApi {
    // 创建虚拟网络适配器，返回适配器句柄的匿名指针
    WireGuardCreateAdapter: (name: string, tunnelType: tunnelType, guid: any) => any;
    // 打开适配器，返回句柄指针或者空指针
    WireGuardOpenAdapter: (name: string) => any;
    // 关闭适配器，handle-适配器指针
    WireGuardCloseAdapter: (handle: any) => void;
    // 获取luid
    WireGuardGetAdapterLUID?: (handle: any, luid: Buffer) => void;
    // 获取驱动服务版本，0-异常
    WireGuardGetRunningDriverVersion: () => number;
    WireGuardDeleteDriver: () => boolean;
    // 设置全局日志回调
    WireGuardSetLogger: (callback: any) => void,
    // 设置适配器日志状态
    WireGuardSetAdapterLogging: (handle: any, logState: WIREGUARD_ADAPTER_LOG_STATE) => boolean;
    // 设置适配器状态
    WireGuardSetAdapterState: (handle: any, state: WIREGUARD_ADAPTER_STATE) => boolean;
    // 获取适配器状态
    WireGuardGetAdapterState: (handle: any, state: Buffer) => boolean;
    // 设置适配器，handle-适配器句柄指针，config-符合c结构体的对象指针，size-config的大小
    WireGuardSetConfiguration: (handle: any, config: WIREGUARD_INTERFACE_js, size: number) => boolean;

}