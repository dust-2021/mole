import {HttpResp, log, server, request} from "./publicType"
import {Services} from './stores'
import {Token} from "./token";

// 参数格式化为请求路由参数
function queryFormatter(data: Map<string, any>): string {
    let queryString = Array.from(data)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
    queryString = queryString !== "" ? `?${queryString}` : "";
    return queryString;
}

/* 向服务器发送请求
* 成功：{"code": 0, "data": any}  失败：{"code": int, "message": str}
*
* */
export async function fetch(serverName: string, method: "get" | "post", url: string, data?: Map<string, any>): Promise<HttpResp> {
    const svr = Services().get(serverName);
    if (!svr) return { code: -1, message: `未找到服务器：${serverName}` };
    const host = `${svr.certify? 'https://': 'http://'}${svr.host}:${svr.port}`;
    
    let trueUrl = "";
    let postData: any = undefined;
    switch (method) {
        case "get":
            const queryString = (data === undefined || data === null) ? "" : queryFormatter(data);
            trueUrl = `${host}/${url}${queryString}`;
            break;
        case "post":
            let query: string = "";
            if (data !== undefined && data !== null) {
                const obj = Object.fromEntries(data);
                query = JSON.stringify(obj);
            }
            trueUrl = `${host}/${url}`;
            postData = query;
            break;
        default:
            throw new Error("Unknown method");
    }
    try {
        let resp = await request(trueUrl, method, {"Token": svr.token?.token ?? ""}, postData);
        if (!resp) return {code: -1, message: ''};
        // token失效时重新获取
        if (resp.code === 403 || resp.code === 401) {
            await refreshToken(svr, host);
            // 重新发起请求
            resp = await request(trueUrl, method, {"Token": svr.token?.token ?? ""}, postData);
        }
        log(resp.code === 0 ? 'info' : 'error', `${serverName} | ${url} | ${method} | ${resp.code === 0 ? 'success' : resp.message}`);
        return resp;
    } catch (e: any) {
        log('error', `request failed: ${method} | ${url}` + e.toString());
        return {
            code: -1, message: ''
        }
    }
}

// 刷新token并再次发起请求
async function refreshToken(svr: server, host: string): Promise<void> {
        const r = await request(`${host}/api/login`, "post", {}, JSON.stringify({
            username: svr.defaultUser?.username,
            password: svr.defaultUser?.password
        }));
        if (r.code !== 0) {
            throw new Error("refresh token failed");
        }
        svr.token = new Token(r.data);
}


