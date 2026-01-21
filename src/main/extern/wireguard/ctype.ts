import { Logger } from '../../public';
import koffi = require('koffi');

// c的简单类型定义
export const c_type = {
    // char16字符串
    LPCWSTR: koffi.pointer(koffi.types.wchar_t),
    // char字符串
    LPCSTR: koffi.pointer(koffi.types.char),
    UNKNOWN_POINTER: koffi.pointer(koffi.types.void),
    response: koffi.struct('response', { 'code': koffi.types.int, 'msg': koffi.pointer(koffi.types.wchar_t) })
}

// ffi调用统一返回结构体类型
type Response = { code: number, msg: string };

function logger_callback(level: number, msg: string) {
    let level_s = "info";
    switch (level) {
        case 1:
            level_s = "warning";
        case 2:
            level_s = "error";
    }
    Logger.log(level_s, '[wireguard] | ' + msg);
}

// wireguard日志回调函数类型定义，0-info，1-warning，2-error
export const WireGuardLoggerCallback = koffi.proto('WireGuardLoggerCallback', koffi.types.void,
    [koffi.types.uint, c_type.LPCSTR]);
export const WireGuardLoggerCallback_R = koffi.register(logger_callback, koffi.pointer(WireGuardLoggerCallback));

export interface wgApi {
    set_env: (env: string) => void,
    // 设置dll日志回调函数
    set_logger: (cb: koffi.IKoffiRegisteredCallback) => void,
    // 
    create_adapter: (name: string, public_key: Buffer, private_key: Buffer, adaper_ip: string, listen_port: number) => Response,
    del_adapter: (name: string) => Response,
    add_peer: (adapter_name: string, peer_name: string, ip: string, port: number, public_key: Buffer,
        transport_ip: string[], count: number
    ) => Response,
    del_peer: (adapter_name: string, peer_name: string) => Response,
    // 启动适配器
    run_adapter: (name: string) => Response,
    // 停止适配器
    pause_adapter: (name: string) => Response,
    get_adapter_config: (name: string) => Response,
    unload: () => void,
}