import {fetch} from './base';

import {HttpResp, server} from "@/main/public/public";

// 登录接口
export async function login(server: server, name: string, password: string): Promise<HttpResp> {

    const data = new Map<string, any>([["username", name], ["password", password]]);
    const resp = await fetch(server, "post", "api/login", false, data);
    if (resp.success && resp.statusCode === 0) {
        server.token = String(resp.data);
    }
    return resp;
}

export async function logout(server: server): Promise<HttpResp> {
    const resp = await fetch(server, "get", "sapi/logout", true)
    if (resp.success && resp.statusCode === 0) {
        server.token = undefined;
    }
    return resp;
}

export async function register(server: server, name: string, password: string): Promise<HttpResp> {
    const data = new Map<string, any>([["username", name], ["password", password]]);
    return  fetch(server, "post", "api/register", false, data)
}