import {HttpResp, log, server} from "./publicType"
import {Services} from './stores'
import axios, {AxiosError, AxiosHeaders, AxiosRequestConfig, AxiosResponse} from "axios";
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
export async function fetch(serverName: string, method: string, url: string, withToken: boolean, data?: Map<string, any>): Promise<HttpResp> {
    const svr = Services().get(serverName);
    if (!svr) return { code: -1, message: `未找到服务器：${serverName}` };
    const host = `${svr.certify? 'https://': 'http://'}${svr.host}:${svr.port}`;
    const headers = new AxiosHeaders();
    headers.set("Accept", "application/json");
    if (withToken && svr.token) {
        headers.set("Token", svr.token?.token);
    }
    let body: AxiosRequestConfig = {
        headers: headers, validateStatus: (status) => true, method: method.toUpperCase(),
    }
    let resp: AxiosResponse | null = null;
    switch (method) {
        case "get":
            const queryString = (data === undefined || data === null) ? "" : queryFormatter(data);
            body.url = `${host}/${url}${queryString}`;
            break;
        case "post":
            let query: string = "";
            if (data !== undefined && data !== null) {
                const obj = Object.fromEntries(data);
                query = JSON.stringify(obj);
            }
            body.url = `${host}/${url}`;
            body.data = query;
            break;
        default:
            throw new Error("Unknown method");
    }
    try {
        resp = await axios.request(body);
        if (!resp) return {code: -1, message: ''};
        // token失效时重新获取
        if (resp.status === 403 || resp.status === 401) {
            resp = await refreshTokenDo(svr, host, body);
        }
        const result = resp.data as HttpResp;
        log(result.code === 0 ? 'info' : 'error', `${serverName} | ${url} | ${method} | ${result.code === 0 ? 'success' : result.message}`);
        return resp.data;
    } catch (e) {
        log('error', `request failed: ${method} | ${url}` + e.toString());
        return {
            code: -1, message: ''
        }
    }
}

// 刷新token并再次发起请求
async function refreshTokenDo(svr: server, host: string, body: AxiosRequestConfig): Promise<AxiosResponse> {
        const r = await axios.post(`${host}/api/login`, JSON.stringify({
            username: svr.defaultUser?.username,
            password: svr.defaultUser?.password
        }));
        if (r.status !== 200 || r.data.code !== 0) {
            throw new AxiosError("refresh token failed");
        }
        svr.token = new Token(r.data.data);
        if (body.headers) {
            body.headers["Token"] = svr.token?.token;
        }
        return await axios.request(body);
}


