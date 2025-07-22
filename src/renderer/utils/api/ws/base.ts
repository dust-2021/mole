import {wsRequest, wsHandleFunc} from '../../ws/conn'
import {ElMessage} from "element-plus";
import {Services, Public} from "../../stores";

// 订阅频道
export async function auth(server: string, handle?: wsHandleFunc) {
    const svr = Services().get(server);
    if (!svr.token) {
        ElMessage({
            type: 'error',
            message: `登录获取token`
        })
        return
    }
    let args = [svr.token];
    const pub = Public();
    if (pub.get('mac')) {
        args.push(pub.get('mac'));
    }
    await wsRequest(server, 'base.auth', args, handle);
}