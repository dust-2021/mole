import {wsRequest, wsHandleFunc} from '../../ws/conn'
import {ElMessage} from "element-plus";
import {Services, MacAddress} from "../../stores";

export async function serverTime(t: number, handle?: wsHandleFunc) {

}

//
export async function auth(server: string, handle?: wsHandleFunc) {
    const svr = Services().get(server);
    let args = [svr.token];
    if (MacAddress !== '') {
        args.push(MacAddress);
    }
    await wsRequest(server, 'base.auth', args, handle);
}