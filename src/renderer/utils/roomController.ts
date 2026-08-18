import { RWLock } from '../../shared/asynchronous';
import { Connection } from './conn';
import { wsResp, wireguardFunc, server, udpFunc, log } from './publicType';
import { ref, Ref, shallowRef, triggerRef } from 'vue';
import { Services } from './stores';

class RoomController {
    private AllRoom: Map<string, Room> = new Map();

    // 创建房间时，必须已获取vlanIP，创建房间自动添加中继服务器
    public async createRoom(conn: Connection, id: string, svr: string, vlan: number, link: string): Promise<Room | null> {
        const s = Services().get(svr);
        if (!s || !s.wgInfo) return null;
        if (!await wireguardFunc.createRoom(id,
            `${s.wgInfo.vlanIp[0]}.${s.wgInfo.vlanIp[1]}.${vlan >> 8}.${vlan & 0xff}`,
            `${s.wgInfo.vlanIp[0]}.${s.wgInfo.vlanIp[1]}.0.0`) ||
            // 添加中继服务器peer
            !await wireguardFunc.addPeer(id, s.wgInfo.publicKey, s.host, s.wgInfo.listenPort, s.wgInfo.publicKey,
                [`${s.wgInfo.vlanIp[0]}.${s.wgInfo.vlanIp[1]}.0.1/16`], 1) ||
            !await wireguardFunc.runAdapter(id)) {
            await wireguardFunc.delRoom(id);
            return null;
        };
        const room = new Room(conn, id, s, link);
        this.AllRoom.set(id, room);
        return room;
    }

    public async getRoom(id: string): Promise<Room | undefined> {
        return this.AllRoom.get(id)
    }

    public async deleteRoom(id: string) {
        this.AllRoom.delete(id);
        await wireguardFunc.delRoom(id);
    }

    // 清理所有房间（连接断开时调用）
    public async clear() {
        for (const [id, _] of this.AllRoom) {
            await wireguardFunc.delRoom(id);
        }
        this.AllRoom.clear();
    }
}

export interface member {
    id: number,
    uuid: string,
    name: string,
    owner: boolean,
    vlan: number, // vlan ip的后两段
    publicKey: string,
    udpPort: number,
    wgIp: string, // 连接成功后，获取到的真实公网地址
    wgPort: number,
    // undifined: 非直连, 0: 直连中, 1: 已直连, 2: 直连失败
    directFlag?: 0 | 1 | 2
}

interface message {
    fromUuid: string,
    fromUsername: string,
    text: string,
    timestamp: number
}

export class Room {

    private lock: RWLock = new RWLock();
    public readonly conn: Connection;
    public readonly roomId: string;
    public link: string;
    public readonly selfUuid: string;

    // vue组件可访问的响应式数据
    public forbidden: Ref<boolean> = ref(true);
    public members: Ref<Map<string, member>> = shallowRef(new Map<string, member>());
    public messages: Ref<message[]> = ref([]);

    public onClose: (() => void) | null = null;

    // 服务器wg信息
    private readonly host: string = "";
    private readonly port: number = 0;
    private msgCallback: ((msg: message) => void) | null = null;
    public readonly vlanPrefix: string = "";

    public constructor(conn: Connection, id: string, svr: server, link: string) {
        if (!svr.wgInfo || !svr.token) throw new Error("error svr");
        this.conn = conn;
        this.roomId = id;
        this.host = svr.host;
        this.port = svr.wgInfo?.listenPort;
        this.link = link;
        this.vlanPrefix = `${svr.wgInfo.vlanIp[0]}.${svr.wgInfo.vlanIp[1]}`;
        this.selfUuid = svr.token.userUuid;
    }

    public async addMsg(msgs: message[]) {
        this.checkInMsg(msgs);
    }

    public async setMsgCallback(callback: (msg: message) => void) {
        this.msgCallback = callback;
    }

    private async checkInMsg(msgs: message[]) {
        for (const msg of msgs) {
            this.messages.value.push(msg);
            if (this.msgCallback) {
                this.msgCallback(msg);
            }
        }
        const k = this.messages.value.length;
        if (k >= 1000) {
            this.messages.value = this.messages.value.slice(k - 500, k);
        }
    }

    // 无锁修改链接状态标识符
    private async modifyConnFlagLocked(uid: string, to: 0 | 1 | 2) {
        if (!this.members.value.has(uid)) return;
        this.members.value.get(uid)!.directFlag = to;
        triggerRef(this.members);
    }

    // 检查wg直连，失败后回退
    private async checkDirectConn(uuid: string, name: string, ip: string, port: number, timeout_s: number) {
        // endpoint 校验：peer 已回退为中继（wgIp 为空 或 endpoint 指向中继服务器）时，
        // 数据走的是中继路径而非直连，跳过 UDP 直连验证，避免误判"直连成功"
        const m = this.members.value.get(uuid);
        if (!m || m.wgIp === "" || m.wgPort === 0 ||
            (m.wgIp === this.host && m.wgPort === this.port)) {
            return;
        }
        // wg直连后立刻进行udp连接尝试
        await udpFunc.connect(ip, port, timeout_s, async (f: boolean) => {

            if (!this.members.value.has(uuid)) return;
            await this.modifyConnFlagLocked(uuid, f ? 1 : 2);
            await this.checkInMsg([{ fromUuid: "", text: f ? `直连'${name}'成功` : `直连'${name}'失败`, timestamp: Date.now(), fromUsername: "" }]);
            // 直连失败，回退为中转：删除直连 peer，让流量走中继服务器 peer(/16) 中转。
            // 注意：不能把该 peer 的 endpoint 改成中继服务器——wg 是端到端加密，
            // 成员公钥加密的包服务器无法解密，会被丢弃导致中转失效
            if (!f) {
                const m = this.members.value.get(uuid);
                if (!m) return;
                m.wgIp = "";
                m.wgPort = 0;
                await wireguardFunc.delPeer(this.roomId, uuid);
            }
        });
    }

    private async addMember(m: member) {
        // 禁止重复添加，防止ws和wg管理混乱
        if (this.members.value.has(m.uuid)) return;
        this.members.value.set(m.uuid, m);
        triggerRef(this.members);
        if (m.uuid === this.selfUuid) return;
        // 具有真实公网地址进行直连尝试，失败退回转发模式
        const vlan = this.vlanPrefix + `.${m.vlan >> 8}.${m.vlan & 0xff}`;
        await wireguardFunc.addTransIps([vlan]);
        if (m.wgIp !== "" && m.wgPort !== 0) {
            await this.modifyConnFlagLocked(m.uuid, 0);
            const ok = await wireguardFunc.addPeer(this.roomId, m.uuid, m.wgIp, m.wgPort, m.publicKey,
                [vlan], 1);
            // endpoint 校验：addPeer 成功（endpoint 已生效）才进行直连验证；
            // 直连测试后台并行进行，不阻塞"加入房间"消息
            if (ok) {
                this.checkDirectConn(m.uuid, m.name, vlan, m.udpPort, 10)
                    .catch(e => log("error", String(e)));
            }
        };
        this.checkInMsg([{ fromUuid: "", text: `${m.name}加入房间`, timestamp: Date.now(), fromUsername: "" }]);
    }

    public async addMembers(m: member[]) {
        if (m.length === 0) return;
        // 并行加入成员：前一个成员的直连测试(最长10s)不再阻塞后续成员
        // 单个成员失败不影响其他成员加入
        await Promise.all(m.map(mem => this.addMember(mem).catch(e => log("error", String(e)))));
    }

    public async delMember(userUUid: string, force: boolean = false) {
        const mem = this.members.value.get(userUUid);
        if (!mem) return;
        this.checkInMsg([{ fromUuid: "", text: force ? `${mem.name}被踢出房间` : `${mem.name}离开房间`, timestamp: Date.now(), fromUsername: "" }]);
        this.members.value.delete(userUUid);
        triggerRef(this.members);
        // if (!await wireguardFunc.pauseAdapter(this.roomId)) return;
        await wireguardFunc.delPeer(this.roomId, userUUid);
        await wireguardFunc.delTransIps([`${this.vlanPrefix}.${mem.vlan >> 8}.${mem.vlan & 0xff}`]);
        // await wireguardFunc.runAdapter(this.roomId);
    }

    public async changeOwner(oldUuid: string, newUuid: string) {
        const oldMem = this.members.value.get(oldUuid);
        if (oldMem) oldMem.owner = false;
        const newMem = this.members.value.get(newUuid);
        if (newMem) {
            newMem.owner = true;
            this.checkInMsg([{ fromUuid: "", text: `房主移交至${newMem.name}`, timestamp: Date.now(), fromUsername: "" }])
        }
        triggerRef(this.members);
    }

    public async changeForbidden(to: boolean) {
        if (this.forbidden.value === to) return;
        this.forbidden.value = to;
        this.checkInMsg([{ fromUuid: "", fromUsername: "", text: to ? "房间关闭进入" : "房间开启进入", timestamp: Date.now() }])
    }

    /**
     * 获取到成员真实公网地址后，wg添加一个点对点peer并进行直连尝试
     * @param peer_uuid 
     * @param ip 
     * @param port 
     * @returns 
     */
    public async updateEndpoint(peer_uuid: string, ip: string, port: number) {
        let peer = this.members.value.get(peer_uuid);
        if (!peer) return;
        peer.wgIp = ip;
        peer.wgPort = port;
        const ok = await wireguardFunc.addPeer(this.roomId, peer.uuid, ip, port, peer.publicKey, [`${this.vlanPrefix}.${peer.vlan >> 8}.${peer.vlan & 0xff}/32`], 1);
        // endpoint 校验：addPeer 成功（endpoint 已更新为直连地址）才进行直连验证
        if (ok) {
            await this.checkDirectConn(peer_uuid, peer.name, this.vlanPrefix + `.${peer.vlan >> 8}.${peer.vlan & 0xff}`, peer.udpPort, 10);
        }
    }

    public async printWg() {
        this.checkInMsg([{ fromUuid: this.selfUuid, fromUsername: "", text: await wireguardFunc.getAdapterConfig(this.roomId), timestamp: Date.now() }]);
    }
}

export const roomer = new RoomController();

async function handle(t: string, r: wsResp) {
    let room = await roomer.getRoom(r.id);
    if (!room) {
        // 防止房间建立完成前接收到消息
        await new Promise(resove => setTimeout(resove, 1000));
        room = await roomer.getRoom(r.id);
        if (!room) return;
    };
    switch (t) {
        case "in":
            const data_in: member = r.data;
            await room.addMembers([data_in]);
            break;
        case "out":
            await room.delMember(r.data as string);
            break;
        case "kick":
            const kickedUuid = r.data as string;
            await room.delMember(kickedUuid, true);
            if (kickedUuid === room.selfUuid && room.onClose) {
                room.onClose();
            }
            break;
        case "exchangeOwner":
            const data_ex: { old: string, new: string } = r.data;
            await room.changeOwner(data_ex.old, data_ex.new);
            break;
        case "forbidden":
            await room.changeForbidden(r.data as boolean);
            break;
        case "close":
            if (room.onClose) room.onClose();
            break;
        case "message":
            const data: { senderId: number, senderName: string, senderUuid: string, data: string, timestamp: number } = r.data;
            await room.addMsg([{ fromUuid: data.senderUuid, text: data.data, timestamp: data.timestamp, fromUsername: data.senderName }]);
            break;
        case "updatePeerEndpoint":
            const data_update: { uuid: string, ip: string, port: number } = r.data;
            await room.updateEndpoint(data_update.uuid, data_update.ip, data_update.port);
    }
}

Connection.publicHandleByMethod.set("publish.room.notice.in", (r: wsResp) => handle("in", r));
Connection.publicHandleByMethod.set("publish.room.notice.out", (r: wsResp) => handle("out", r));
Connection.publicHandleByMethod.set("publish.room.notice.kick", (r: wsResp) => handle("kick", r));
Connection.publicHandleByMethod.set("publish.room.notice.exchangeOwner", (r: wsResp) => handle("exchangeOwner", r));
Connection.publicHandleByMethod.set("publish.room.notice.forbidden", (r: wsResp) => handle("forbidden", r));
Connection.publicHandleByMethod.set("publish.room.notice.close", (r: wsResp) => handle("close", r));
Connection.publicHandleByMethod.set("publish.room.notice.updatePeerEndpoint", (r: wsResp) => handle("updatePeerEndpoint", r));
Connection.publicHandleByMethod.set("publish.room.message", (r: wsResp) => handle("message", r));


