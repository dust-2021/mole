import {Token} from '../../token'
import {fetch} from "../../request";

/* 获取服务器token
* */
export async function login(serverName: string, name: string, password: string): Promise<{code: number, data: Token | null}> {

    const data = new Map<string, any>([["username", name], ["password", password]]);
    const resp = await fetch(serverName, "post", "api/login", false, data);
    if (resp.code !== 0) {
        return {code: resp.code, data: null};
    }
    return {code: 0, data: new Token(resp.data)};
}

export async function logout(serverName: string): Promise<boolean> {
    const resp = await fetch(serverName, "get", "sapi/logout", true)
    return resp.code === 0;

}
