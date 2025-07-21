import { wsListener, wsRespBody, WsHandler,Windows } from "../public/public";

async function roomIn(serverName: string, resp: wsRespBody) {
    const win = Windows.get("main");
    win?.webContents?.send(`${serverName}.room.in.${resp.id}`, resp)
}

async function roomOut(serverName: string, resp: wsRespBody) {
    const win = Windows.get("main");
    win?.webContents?.send(`${serverName}.room.out.${resp.id}`, resp)
}

async function roomOwner(serverName: string, resp: wsRespBody) {
    const win = Windows.get("main");
    win?.webContents?.send(`${serverName}.room.exchangeOwner.${resp.id}`, resp)
}

async function roomClose(serverName: string, resp: wsRespBody) {
    const win = Windows.get("main");
    win?.webContents?.send(`${serverName}.room.close.${resp.id}`, resp)
}

async function roomMessage(serverName: string, resp: wsRespBody) {
    const win = Windows.get("main");
    win?.webContents?.send(`${serverName}.room.message.${resp.id}`, resp)
}

async function roomForbidden(serverName: string, resp: wsRespBody) {
    const win = Windows.get("main");
    win?.webContents?.send(`${serverName}.room.forbidden.${resp.id}`, resp)
}

export function registerApis() {
    WsHandler.set('publish.room.in', roomIn);
    WsHandler.set('publish.room.out', roomOut);
    WsHandler.set('publish.room.close', roomClose);
    WsHandler.set('publish.room.exchangeOwner', roomOwner);
    WsHandler.set('publish.room.message', roomMessage);
    WsHandler.set('publish.room.forbidden', roomForbidden);
}