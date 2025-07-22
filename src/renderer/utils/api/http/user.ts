import {HttpResp} from "../../publicType";
import {fetch} from "../../http/request";
import {ElMessage} from "element-plus";
import {Services}   from "../../stores";

export async function login(serverName: string, name: string, password: string): Promise<void> {

    const data = new Map<string, any>([["username", name], ["password", password]]);
    const resp = await fetch(serverName, "post", "api/login", false, data);
    if (resp.code !== 0) {
        ElMessage({
            type: "error",
            message: `登陆失败：${resp.message}`
        })
        throw Error(resp.message)
    }
    const svr = Services().get(serverName);
    if (svr) {
        svr.token = resp.data;
    }
}

export async function logout(serverName: string): Promise<void> {
    const resp = await fetch(serverName, "get", "sapi/logout", true)
    if (resp.code !== 0) {
        ElMessage({
            type: "error",
            message: `登陆失败：${resp.message}`
        })
        throw Error(resp.message)
    }
    const svr = Services().get(serverName);
    if (svr) {
        delete svr.token;
    }
}
