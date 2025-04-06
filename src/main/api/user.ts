import {fetch} from './base';

import {HttpResp, server} from "@/main/public/public";

// 登录接口
export async function login(server: server, name: string, password: string): Promise<HttpResp> {

    const data = new Map<string, any>([["username", name], ["password", password]]);
    return fetch(server, "post", "api/login", false, data)
}

export async function logout(server: server): Promise<HttpResp> {
    return fetch(server, "post", "sapi/logout", true)
}

export async function register(server: server, name: string, password: string): Promise<HttpResp> {
    const data = new Map<string, any>([["username", name], ["password", password]]);
    return fetch(server, "post", "api/register", false, data)
}