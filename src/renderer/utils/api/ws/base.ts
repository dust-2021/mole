import {wsRequest, wsHandleFunc} from '../../conn'
import {Services} from "../../stores";

export async function ping(server: string, handle?: wsHandleFunc) {
    const svr = Services().get(server);
    if (!svr) return;
    await wsRequest(server, 'base.ping', [Date.now()], handle);
}

export async function serverTime(server: string, handle?: wsHandleFunc) {
    const svr = Services().get(server);
    if (!svr) return;
    await wsRequest(server, 'base.serverTime', [], handle);
}

// 重置连接倒计时
export async function resetLifetime(server: string, handle?: wsHandleFunc) {
    const svr = Services().get(server);
    if (!svr) return;
    await wsRequest(server, 'base.resetLifetime', [], handle);
}