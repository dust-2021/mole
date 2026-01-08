import { Logger } from '../../public';
import koffi = require('koffi');

// c的简单类型定义
export const c_type = {
    // char16字符串
    LPCWSTR: koffi.pointer(koffi.types.wchar_t),
    // char字符串
    LPCSTR: koffi.pointer(koffi.types.char),
    UNKNOWN_POINTER: koffi.pointer(koffi.types.void),
    response: koffi.struct('response', { 'code': koffi.types.uint16, 'msg': koffi.pointer(koffi.types.wchar_t) })
}
export enum ffi_error_code {
    ffi_success = 0,
    ffi_wireguard_dll_unload = 1,
    ffi_adapter_create_err = 2,
    ffi_adapter_run_err = 3,
    ffi_add_peer_err = 4,
};
// ffi调用统一返回结构体类型
type Response = { code: ffi_error_code, msg: string };

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
    create_adapter: (name: string, public_key: Buffer, private_key: Buffer, listen_port: number) => Response,
    del_adapter: (name: string) => Response,
    add_peer: (adapter_name: string, peer_name: string, ip: string, port: number, public_key: Buffer,
        transport_ip: string, mask: number
    ) => Response,
    del_peer: (adapter_name: string, peer_name: string) => Response,
    // 启动适配器
    run_adapter: (name: string) => Response,
    // 停止适配器
    pause_adapter: (name: string) => Response,
    unload: () => void,
}