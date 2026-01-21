import {environment, BaseDir, Logger} from "../../public";
import koffi = require("koffi");
import path from "path";
import * as CType from "./ctype";
import iconv from 'iconv-lite';

let srcDir: string;
if (environment === "dev") {
    srcDir = path.join(BaseDir, '../lib/src');
} else {
    srcDir = path.join(process.resourcesPath, 'resources', 'wireguard')
}

srcDir = path.join(srcDir, 'wireguard_handle.dll');
const wg = koffi.load(srcDir);

const win32 = koffi.load('kernel32.dll');

const GetLastError = win32.func('GetLastError', 'uint32', []);

const FormatMessageA = win32.func('FormatMessageA', 'uint32', [
    'uint32',   // dwFlags
    CType.c_type.UNKNOWN_POINTER,  // lpSource
    'uint32',   // dwMessageId
    'uint32',   // dwLanguageId
    CType.c_type.LPCWSTR,      // lpBuffer
    'uint32',   // nSize
    CType.c_type.UNKNOWN_POINTER  // Arguments
]);

export function checkDLLError(): string {
    const code = GetLastError();
    if (code === 0) {
        return "";
    }
    const msg = Buffer.alloc(256);
    const length = FormatMessageA(0x00001000 | 0x00000200,
        null,
        code,
        0,
        msg,
        256,
        null
    );
    if (length === 0) {
        Logger.warn('获取dll错误信息失败');
        return "";
    }
    let message = iconv.decode(msg.subarray(0, length), 'gbk');
    message = message.replace(/[\r\n]+$/, '');
    return message;
}

// 定义 WireGuard API 函数，枚举类型全部使用枚举成员的原始int值代替
export const WireGuardAPI: CType.wgApi = {
    set_env: wg.func("set_env", koffi.types.void, [koffi.pointer(koffi.types.char)]),
    set_logger: wg.func("set_logger", koffi.types.void, [koffi.pointer(CType.WireGuardLoggerCallback)]),
    create_adapter: wg.func("create_adapter", CType.c_type.response, [CType.c_type.LPCWSTR, koffi.pointer(koffi.types.uchar), koffi.pointer(koffi.types.uchar),
        CType.c_type.LPCSTR, koffi.types.uint16
    ]),
    del_adapter: wg.func("del_adapter", CType.c_type.response, [CType.c_type.LPCWSTR]),
    add_peer: wg.func("add_peer", CType.c_type.response, [CType.c_type.LPCWSTR, CType.c_type.LPCWSTR, CType.c_type.LPCSTR, koffi.types.uint16,
        koffi.pointer(koffi.types.uchar), koffi.pointer(CType.c_type.LPCSTR), koffi.types.int
    ]),
    del_peer: wg.func("del_peer", CType.c_type.response, [CType.c_type.LPCWSTR, CType.c_type.LPCWSTR]),
    run_adapter: wg.func("run_adapter", CType.c_type.response, [CType.c_type.LPCWSTR]),
    pause_adapter: wg.func("pause_adapter", CType.c_type.response, [CType.c_type.LPCWSTR]),
    get_adapter_config: wg.func("get_adapter_config", CType.c_type.response, [CType.c_type.LPCWSTR]),
    unload: wg.unload,
};

