import { Token } from '../../token'
import { fetch } from "../../request";

/* 获取服务器token
* */
export async function login(serverName: string, name: string, password: string): Promise<{ code: number, data: Token | null }> {

    const data = new Map<string, any>([["username", name], ["password", password]]);
    const resp = await fetch(serverName, "post", "api/login", false, data);
    if (resp.code !== 0) {
        return { code: resp.code, data: null };
    }
    return { code: 0, data: new Token(resp.data) };
}

export async function logout(serverName: string): Promise<boolean> {
    const resp = await fetch(serverName, "get", "sapi/logout", true)
    return resp.code === 0;

}

export async function createUsers(serverName: string, count: number): Promise<{ username: string, password: string }[]> {
    const resp = await fetch(serverName, "get", `sapi/system/user/createPieces?count=${count}`, true);
    if (resp.code !== 0) {
        return [];
    }
    return resp.data as { username: string, password: string }[];
}

export async function registerUser(serverName: string, username: string, password: string, phone: string, email: string): Promise<number> {
    const data = new Map<string, any>([
        ["username", username],
        ["password", password],
        ["phone", phone],
        ["email", email]
    ]);
    const resp = await fetch(serverName, "post", "api/register", false, data);
    return resp.code;
}
