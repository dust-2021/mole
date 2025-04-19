import {HttpResp, Services, server} from "../public/public"
import axios, {AxiosHeaders, AxiosResponse} from "axios";

// 参数格式化为请求路由参数
function queryFormatter(data: Map<string, any>): string {
    let queryString = Array.from(data)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
    queryString = queryString === "" ? `?${queryString}` : "";
    return queryString;
}

/* 向服务器发送请求
* 成功：{"code": 0, "data": any}  失败：{"code": int, "message": str}
* */
export async function fetch(svr: server, method: string, url: string, withToken: boolean, data?: Map<string, any>): Promise<HttpResp> {
    const host = `${svr.host}:${svr.port}`;
    const headers = new AxiosHeaders();
    headers.set("Accept", "application/json");
    if (withToken && svr.token) {
        headers.set("Token", svr.token);
    }
    let resp: AxiosResponse | null = null;
    const res: HttpResp = {success: false, statusCode: 0};
    switch (method) {
        case "get":
            const queryString = data === undefined || data === null ? "" : queryFormatter(data);
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
            res.msg = "Unknown type " + method;
            return res;
    }
    if (resp === null) {
        return res;
    }
    // 网络请求结果
    res.success = resp.status === 200;
    if (!res.success) {
        res.msg = resp.statusText;
        res.statusCode = resp.status;
        return res;
    }
    // 接口请求结果
    res.statusCode = resp.data.code;
    if (res.statusCode === 0) {
        res.data = resp.data.data;
    } else {
        res.msg = resp.data.message;
    }
    return res;
}


