import {fetch} from "../../request";

export async function serverTime(serverName: string): Promise<number | null> {
    const resp = await fetch(serverName, 'get', 'api/server/time', false);
    if (resp.code !== 0) {
        return null;
    }
    return resp.data;
}

export interface roomInfo {
    roomId: string,
    roomTitle: string,
    description: string,
    ownerId: number,
    ownerName: string,
    memberCount: number,
    memberMax: number,
    withPassword: boolean,
    forbidden: boolean
}

// 获取房间列表信息，失败则返回null
export async function roomList(serverName: string, page: number = 1, size: number = 10): Promise<{code: number, data :{
    total: number,
    rooms: roomInfo[]
}}> {
    const data = new Map<string, any>([['page', page], ['size', size]]);
    const resp = await fetch(serverName, 'get', 'ws/room/list', true, data);
    if (resp.code !== 0) {
        return {code: resp.code, data: {total: 0, rooms: []}};
    }
    return {code: 0, data: resp.data};
}


export async function wgInfo(serverName: string): Promise<{code: number, data: {publicKey: string, listenPort: number,
    vlanIp: [number, number]
}}> {
    const resp = await fetch(serverName, 'get', 'sapi/info/wginfo', true);
    if (resp.code !== 0) {
        return {code: resp.code, data: {publicKey: "", listenPort: 0, vlanIp: [0, 0]}};
    }
    return {code: 0, data: resp.data}; 
}