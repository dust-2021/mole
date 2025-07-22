import {wsRequest, wsHandleFunc, Connection} from '../../ws/conn'
import {wsResp} from "../../publicType";
import {ElMessage} from "element-plus";

// 订阅频道，handle是频道消息处理而非订阅结果处理
export async function subscribe(server: string, channel: string, handle?: wsHandleFunc) {
    await wsRequest(server, 'channel.subscribe', [channel], (r: wsResp) =>{
        if (r.statusCode !== 0) {
            ElMessage({
                type: 'error',
                message: `订阅频道：${channel}失败：${r.data}`
            })
        } else {
            const conn = Connection.getInstance(server);
            conn.methodHandler('publish.' + channel, handle);
        }
    });
}

// 订阅频道
export async function unsubscribe(server: string, channel: string) {
    await wsRequest(server, 'channel.unsubscribe', [channel], (r: wsResp) =>{
        if (r.statusCode !== 0) {
            ElMessage({
                type: 'error',
                message: `取消订阅频道：${channel}失败：${r.data}`
            })
        } else {
            const conn = Connection.getInstance(server);
            conn.methodHandler('channel.' + channel);
        }
    });
}