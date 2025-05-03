import {fetch} from "./base";

import {Api, HttpResp, server} from "../public/public";

 async function serverTime(svr: server): Promise<HttpResp> {
    return await fetch(svr, 'get', 'api/server/time', false);
}

 async function roomList(svr: server): Promise<HttpResp> {
    return await fetch(svr, 'get', 'ws/room/list', true);
}

export function registerApis() {
    Api.set("serverTime", serverTime);
    Api.set("roomList", roomList);
}