import {HttpResp, log, server} from "../publicType"
import {Services} from '../stores'
import axios, {AxiosError, AxiosHeaders, AxiosRequestConfig, AxiosResponse} from "axios";
import {ElMessage} from "element-plus";

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
    const host = `${svr.host}:${svr.port}`;
    const headers = new AxiosHeaders();
    headers.set("Accept", "application/json");
    if (withToken && svr.token) {
        headers.set("Token", svr.token);
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
        // token失效时重新获取
        if (resp.status === 403 || resp.status === 401) {
            resp = await refreshTokenDo(svr, host, body);
        }
        const result = resp.data as HttpResp;
        log(result.code === 0 ? 'info' : 'error', `${serverName} | ${url} | ${method} | ${result.code === 0 ? 'success' : result.message}`);
        return resp.data;
    } catch (e) {
        log('error', e.toString());
        return {
            code: -1, message: `请求失败 ${e}`
        }
    }
}

// 刷新token并再次发起请求
async function refreshTokenDo(svr: server, host: string, body: AxiosRequestConfig): Promise<AxiosResponse> {
        const r = await axios.post(`${host}/api/login`, JSON.stringify({
            username: svr.defaultUser.username,
            password: svr.defaultUser.password
        }));
        if (r.status !== 200 || r.data.code !== 0) {
            throw new AxiosError("refresh token failed");
        }
        svr.token = r.data.data;
        body.headers["Token"] = svr.token;
        return await axios.request(body);
}


