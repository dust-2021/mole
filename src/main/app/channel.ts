import {
    Api,
    Services,
    ipcHttpReq,
    HttpResp,
    Windows,
    wsSender,
    Logger
} from "../public/public";
import Event = Electron.IpcMainInvokeEvent;

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
