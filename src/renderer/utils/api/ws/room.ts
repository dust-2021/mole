import {wsRequest, wsHandleFunc} from '../../ws/conn'

export async function roomIn(server: string, roomId: string, password?: string, handle?: wsHandleFunc) {
    await wsRequest(server, 'room.in', [roomId, password].filter(e => e !== undefined), handle);
}

export async function roomOut(server: string, roomId: string, handle?: wsHandleFunc) {
    await wsRequest(server, 'room.out', [roomId], handle);
}

export async function roomClose(server: string, roomId: string, handle?: wsHandleFunc) {
    await wsRequest(server, 'room.close', [roomId], handle);
}

export async function roomMessage(server: string, roomId: string, msg: string, handle?: wsHandleFunc) {
    await wsRequest(server, 'room.message', [roomId, msg], handle);
}

export async function roomForbidden(server: string, roomId: string, handle?: wsHandleFunc) {
    await wsRequest(server, 'room.forbidden', [roomId], handle);
}

export async function roomMates(server: string, roomId: string, handle?: wsHandleFunc) {
    await wsRequest(server, 'room.roommate', [roomId], handle);
}

export async function roomCreate(server: string, conf: {
                                     title: string, description: string, maxMember: number,
                                     ipBlackList: string[], userIdBlackList: number[], deviceBlackList: string[], autoClose: boolean
                                 },
                                 handle?: wsHandleFunc) {
    await wsRequest(server, 'room.create', [conf], handle);
}
