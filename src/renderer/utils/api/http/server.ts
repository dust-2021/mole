import {fetch} from "../../http/request";
import {ElMessage} from "element-plus";

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
export async function roomList(serverName: string, page: number = 1, size: number = 10): Promise<{
    total: number,
    rooms: roomInfo[]
} | null> {
    const data = new Map<string, any>([['page', page], ['size', size]]);
    const resp = await fetch(serverName, 'get', 'ws/room/list', true, data);
    if (resp.code !== 0) {
        return null;
    }
    return resp.data;
}