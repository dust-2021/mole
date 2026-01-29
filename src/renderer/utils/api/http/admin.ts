import {fetch} from "../../request";

// 设置用户公共注册
export async function setPublicRegister(serverName: string, to: boolean): Promise<boolean> {
    const resp = await fetch(serverName, "get", `sapi/config/setPublicRegister?enable=${to}`, true);
    return resp.code === 0;
}