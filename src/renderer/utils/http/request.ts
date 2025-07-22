import {HttpResp} from "../publicType"
import {Services} from '../stores'
import axios, {AxiosHeaders, AxiosResponse} from "axios";
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
    let resp: AxiosResponse | null = null;
    switch (method) {
        case "get":
            const queryString = (data === undefined || data === null) ? "" : queryFormatter(data);
            resp = await axios.get(`${host}/${url}${queryString}`, {
                headers: headers,
                validateStatus: (status) => true
            })

            break;
        case "post":
            let query: string = "";
            if (data !== undefined && data !== null) {
                const obj = Object.fromEntries(data);
                query = JSON.stringify(obj);
            }
            resp = await axios.post(`${host}/${url}`, query, {
                headers: headers,
                validateStatus: (status) => true
            })
            break;
        default:
            throw new Error("Unknown method");
    }
    if (resp.status !== 200) {
        ElMessage({
            type: "error",
            message: `请求失败 ${resp.status}, Status: ${resp.statusText}`
        })
        throw Error(resp.statusText);
    }
    return resp.data;
}


