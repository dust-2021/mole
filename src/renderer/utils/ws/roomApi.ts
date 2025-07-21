import {Connection, wsHandleFunc} from './conn'
import {wsReq, wsResp} from '../publicType'

export async function wsRequest(serverName: string, method: string, args?: any[]) {
    const conn = Connection.getInstance(serverName);
    const req: wsReq = {id: '', method: method, params: args}
}