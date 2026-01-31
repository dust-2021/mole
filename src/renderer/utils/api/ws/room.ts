import {wsRequest, wsHandleFunc} from '../../conn';
import {getConfig, wireguardFunc} from '../../publicType';

export async function roomIn(server: string, roomId: string, password?: string, handle?: wsHandleFunc) {
	let param = [roomId, await wireguardFunc.getPublicKey(), await getConfig("udpPort"), password];
	if (password) param.push(password);
	console.log(param);
    await wsRequest(server, 'room.in', param, handle);
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

export async function roomForbidden(server: string, roomId: string, to: boolean, handle?: wsHandleFunc) {
    await wsRequest(server, 'room.forbidden', [roomId, to], handle);
}

/**
 * 获取当前成员信息，成功data为 {
	Name      string `json:"name"`
	Uuid      string `json:"uuid"`
	Id        int    `json:"id"`
	Addr      string `json:"addr"`
	Owner     bool   `json:"owner"`
	Vlan      int    `json:"vlan"`
	PublicKey string `json:"publicKey"`
	WgIp      string `json:"wgIp"`    // 成员真实IP
	WgPort    int    `json:"wgPort"`  // 成员真实端口
	UdpPort   int    `json:"udpPort"` // 成员本地udp端口
}[]
 * @param server 
 * @param roomId 
 * @param handle 
 */
export async function roomMates(server: string, roomId: string, handle?: wsHandleFunc) {
    await wsRequest(server, 'room.roommate', [roomId], handle);
}

/**
 * 创建房间，成功返回data为 {
 * roomId：string， mates： {
	Name      string `json:"name"`
	Uuid      string `json:"uuid"`
	Id        int    `json:"id"`
	Addr      string `json:"addr"`
	Owner     bool   `json:"owner"`
	Vlan      int    `json:"vlan"`
	PublicKey string `json:"publicKey"`
	WgIp      string `json:"wgIp"`    // 成员真实IP
	WgPort    int    `json:"wgPort"`  // 成员真实端口
	UdpPort   int    `json:"udpPort"` // 成员本地udp端口
}[]
 * }
 * @param server 
 * @param conf 
 * @param handle 
 */
export async function roomCreate(server: string, conf: {
                                     title: string, description: string, maxMember: number,
                                     ipBlackList: string[], userIdBlackList: number[], deviceBlackList: string[], autoClose: boolean
                                 },
                                 handle?: wsHandleFunc) {
    await wsRequest(server, 'room.create', [conf, await wireguardFunc.getPublicKey(), await getConfig("udpPort")], handle);
}
