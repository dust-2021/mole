import {fetch} from "./base";

import {HttpResp, server} from "@/main/public/public";

export async function serverTime(svr: server): Promise<HttpResp> {
    return await fetch(svr, 'get', 'api/server/time', false);
}

export async function roomList(svr: server): Promise<HttpResp> {
    return await fetch(svr, 'get', '/ws/room/list', true);
}