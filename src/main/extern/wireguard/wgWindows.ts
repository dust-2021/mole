import { app } from "electron";
import { BaseDir, Logger } from "../../public";
// import koffi = require("koffi");
import * as koffi from 'koffi';
import path from "path";
import * as CType from "./ctype";
import iconv from 'iconv-lite';

let srcDir: string;
if (!app.isPackaged) {
    srcDir = path.join(BaseDir, '../lib/src');
} else {
    srcDir = process.resourcesPath;
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

async function logger(level: number, msg: string, code: number) {
    let level_s = "info";
    switch (level) {
        case 1:
            level_s = "warning";
        case 2:
            level_s = "error";
            if (code === 0) break;
            
            const info = Buffer.alloc(256);
            const length = FormatMessageA(0x00001000 | 0x00000200,
                null,
                code,
                0,
                info,
                256,
                null
            );
            if (length == 0) break;
            msg += ", err info: " + iconv.decode(info.subarray(0, length), 'gbk').replace(/[\r\n]+$/, '');
    }
    Logger.log(level_s, " [dll] | " + msg);
}

function logger_callback(level: number, msg: string, code: number) {
    logger(level, msg, code).then();
}

export const win_logger = koffi.register(logger_callback, koffi.pointer(CType.WireGuardLoggerCallback));

// 定义 WireGuard API 函数，枚举类型全部使用枚举成员的原始int值代替
export const WireGuardAPI: CType.wgApi = {
    set_logger: wg.func("set_logger", koffi.types.void, [koffi.pointer(CType.WireGuardLoggerCallback)]),
    create_adapter: wg.func("create_adapter", CType.c_type.response, [CType.c_type.LPCWSTR,
    koffi.pointer(koffi.types.uchar), koffi.pointer(koffi.types.uchar),
    CType.c_type.LPCSTR, CType.c_type.LPCSTR, koffi.types.uint16
    ]),
    del_adapter: wg.func("del_adapter", CType.c_type.response, [CType.c_type.LPCWSTR]),
    add_peer: wg.func("add_peer", CType.c_type.response, [CType.c_type.LPCWSTR, CType.c_type.LPCWSTR, CType.c_type.LPCSTR, koffi.types.uint16,
    koffi.pointer(koffi.types.uchar), koffi.pointer(CType.c_type.LPCSTR), koffi.types.int
    ]),
    del_peer: wg.func("del_peer", CType.c_type.response, [CType.c_type.LPCWSTR, CType.c_type.LPCWSTR]),
    add_trans_ips: wg.func("add_trans_ips", koffi.types.void, [koffi.pointer(CType.c_type.LPCSTR), koffi.types.size_t]),
    del_trans_ips: wg.func("del_trans_ips", koffi.types.void, [koffi.pointer(CType.c_type.LPCSTR), koffi.types.size_t]),
    run_adapter: wg.func("run_adapter", CType.c_type.response, [CType.c_type.LPCWSTR]),
    pause_adapter: wg.func("pause_adapter", CType.c_type.response, [CType.c_type.LPCWSTR]),
    get_adapter_config: wg.func("get_adapter_config", CType.c_type.response, [CType.c_type.LPCWSTR, koffi.pointer(koffi.types.char), koffi.types.int]),
    clear_all: wg.func("clear_all", koffi.types.void, []),
    unload: wg.unload,
};

