import {
    Api,
    WsApi,
    Services,
    ipcHttpReq,
    HttpResp,
    ipcWsReq,
    wsRespBody,
    Windows,
    wsSender,
    Logger
} from "../public/public";
import {v4 as uuid} from 'uuid';
import Event = Electron.IpcMainInvokeEvent;
import {Connection} from "../ws/connection";

// 向服务器发送请求
export async function request(event: Event, req: ipcHttpReq): Promise<HttpResp> {
    const win = Windows.get('main');
    try {
        const f = Api.get(req.apiName);
        if (!f) {
            win?.webContents.send('msg', "API Not Found", 'error');
            return {success: false, statusCode: 0, msg: "API Not Found"};
        }
        const svr = Services.get(req.serverName);
        if (!svr) {
            win?.webContents.send('msg', "server Not Found", 'error');
            return {success: false, statusCode: 0, msg: "server Not Found"};
        }
        const args: any[] = req.args ? req.args : [];
        const resp = await f(svr, ...args)
        if (!resp.success) {
            const msg = `${req.serverName}-${req.apiName} failed code: ${resp.statusCode}`;
            win?.webContents.send('msg', msg, 'error');
            Logger.warn(msg)
        }
        return resp;
    } catch (error: any) {
        win?.webContents.send('msg', "api call error:" + error.message, 'error');
        Logger.error("api call error:" + error.message);
        return {success: false, statusCode: 0, msg: "api call error:" + error.message};
    }
}

// ipc中间调用ws接口，返回该次ws发送到服务器的唯一ID
export async function wsRequest(event: Event, req: ipcWsReq): Promise<void> {
    try {
        const conn = Connection.getInstance(req.serverName);
        const f = WsApi.get(req.apiName);
        const reqBody = {id: req.uuid, method: req.apiName, params: req.args ? req.args : []};
        // 未找到接口规范函数则直接发送ws请求
        if (!f) {
            await conn.send(reqBody);
            return ;
        }
        await f(reqBody);
    }
    catch (error: any) {
        const win = Windows.get('main');
        win?.webContents.send('msg', "wsRequest error:" + error.message, 'error');
    }
}


