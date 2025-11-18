
import koffi = require('koffi');

// c的简单类型定义
export const c_type = {
    // char16字符串
    LPCWSTR: koffi.pointer(koffi.types.wchar),
    // char字符串
    LPCSTR: koffi.pointer(koffi.types.char),
    UNKNOWN_POINTER: koffi.pointer(koffi.types.void),
    response: koffi.struct('response', {'code': koffi.types.uint16, 'msg': koffi.pointer(koffi.types.char)})
}

// ffi调用统一返回结构体类型
type Response = {code : number, 'msg': string};


// wireguard日志回调函数类型定义，0-info，1-warning，2-error
export const WireGuardLoggerCallback = koffi.proto('WireGuardLoggerCallback', koffi.types.void, [koffi.types.uint, koffi.types.int64, c_type.LPCWSTR]);

export interface wgApi {
    // 设置dll日志回调函数
    set_logger: (cb: (level: number, dt: number, info: string) => void) => Response,
    // 
    create_room: (name: string, public_key: Buffer, private_key: Buffer, listen_port: number) => Response,
}