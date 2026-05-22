import {fetch} from "../../request";


export async function getDynimicConfigs(serverName: string): Promise<{code: number, data: Record<string, any>}> {
    const resp = await fetch(serverName, "get", `sapi/config/getDynimicConfigs`, true);
    if (resp.code !== 0) {
        return { code: resp.code, data: {} };
    }
    return { code: resp.code, data: resp.data };
}

// 设置用户公共注册
export async function setPublicRegister(serverName: string, to: boolean): Promise<boolean> {
    const resp = await fetch(serverName, "get", `sapi/config/setPublicRegister?enable=${to}`, true);
    return resp.code === 0;
}