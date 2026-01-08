import {wsRequest, wsHandleFunc} from '../../conn'
import {Services, MacAddress} from "../../stores";

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

//
export async function auth(server: string, handle?: wsHandleFunc) {
    const svr = Services().get(server);
    let args = [svr?.token?.token];
    if (MacAddress !== '') {
        args.push(MacAddress);
    }
    await wsRequest(server, 'base.auth', args, handle);
}