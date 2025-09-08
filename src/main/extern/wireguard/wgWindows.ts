import {environment, BaseDir, Logger} from "../../public";
import koffi = require("koffi");
import path from "path";
import * as CType from "./ctype";
import iconv from 'iconv-lite';

let srcDir: string;
if (environment === "dev") {
    srcDir = path.join(BaseDir, '../lib/wireguard/amd64');
} else {
    srcDir = path.join(process.resourcesPath, 'resources', 'wireguard')
}

srcDir = path.join(srcDir, 'wireguard.dll');
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
    WireGuardGetRunningDriverVersion: wg.func('WireGuardGetRunningDriverVersion', koffi.types.int, []),
    WireGuardCreateAdapter: wg.func('WireGuardCreateAdapter', CType.c_type.WIREGUARD_ADAPTER_HANDLE, [CType.c_type.LPCWSTR, CType.c_type.LPCWSTR, CType.c_type.GUID]),
    WireGuardOpenAdapter: wg.func('WireGuardOpenAdapter', CType.c_type.WIREGUARD_ADAPTER_HANDLE, [CType.c_type.LPCWSTR]),
    WireGuardCloseAdapter: wg.func('WireGuardCloseAdapter', koffi.types.void, [CType.c_type.WIREGUARD_ADAPTER_HANDLE]),
    WireGuardDeleteDriver: wg.func('WireGuardDeleteDriver', koffi.types.void, []),
    WireGuardSetLogger: wg.func('WireGuardSetLogger', koffi.types.void, [koffi.pointer(CType.WireGuardLoggerCallback)]),
    WireGuardSetAdapterLogging: wg.func('WireGuardSetAdapterLogging', koffi.types.bool, [koffi.types.int]),
    WireGuardSetAdapterState: wg.func('WireGuardSetAdapterState', koffi.types.bool, [CType.c_type.WIREGUARD_ADAPTER_HANDLE, koffi.types.int]),
    WireGuardGetAdapterState: wg.func('WireGuardGetAdapterState', koffi.types.bool, [CType.c_type.WIREGUARD_ADAPTER_HANDLE, koffi.pointer(koffi.types.int)]),
    WireGuardSetConfiguration: wg.func('WireGuardSetConfiguration', koffi.types.void, [CType.c_type.WIREGUARD_ADAPTER_HANDLE, 
        koffi.pointer(CType.WIREGUARD_INTERFACE), koffi.types.int]),
};
