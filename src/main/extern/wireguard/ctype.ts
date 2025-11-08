
import koffi = require('koffi');

// c的简单类型定义
export const c_type = {
    // char16字符串
    LPCWSTR: koffi.pointer(koffi.types.wchar),
    // char字符串
    LPCSTR: koffi.pointer(koffi.types.char),
    response: koffi.struct('response', {'code': koffi.types.uint16, 'msg': koffi.pointer(koffi.types.char)})
}



// wireguard日志回调函数类型定义
export const WireGuardLoggerCallback = koffi.proto('WireGuardLoggerCallback', koffi.types.void, [koffi.types.uint, koffi.types.int64, c_type.LPCWSTR]);

export interface wgApi {

}