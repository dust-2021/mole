import { RWLock } from '../../shared/asynchronous';
import { Connection } from './conn';
import { wsResp, wireguardFunc, server, udpFunc, log } from './publicType';
import { ref, Ref, shallowRef, triggerRef } from 'vue';
import { Services } from './stores';

class RoomController {
    private AllRoom: Map<string, Room> = new Map();
    private lock: RWLock = new RWLock();

    // 创建房间时，必须已获取vlanIP，创建房间自动添加中继服务器
    public async createRoom(conn: Connection, id: string, svr: string, vlan: number, link: string): Promise<Room | null> {
        const s = Services().get(svr);
        if (!s || !s.wgInfo) return null;
        const r = await this.lock.acquireWrite();
        try {
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
        } catch (error) { return null; } finally { r(); }
    }

    public async getRoom(id: string): Promise<Room | undefined> {
        const r = await this.lock.acquireRead();
        try {
            return this.AllRoom.get(id)
        } catch (error) { } finally { r() };
    }

    public async deleteRoom(id: string) {
        const r = await this.lock.acquireWrite();
        try {
            this.AllRoom.delete(id);
            await wireguardFunc.delRoom(id);
        } catch (error) { } finally { r() };
    }
}

export interface member {
    id: number,
    uuid: string,
    name: string,
    owner: boolean,
    vlan: number,
    publicKey: string,
    udpPort: number,
    wgIp: string,
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
        const r = await this.lock.acquireWrite();
        try {
            this.addMsgLocked(msgs);
        } finally {
            r();
        }
    }

    public async setMsgCallback(callback: (msg: message) => void) {
        const r = await this.lock.acquireWrite();
        try {
            this.msgCallback = callback;
        } finally {
            r();
        }
    }

    private async addMsgLocked(msgs: message[]) {
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
        // wg直连后立刻进行udp连接尝试
        await udpFunc.connect(ip, port, timeout_s, async (f: boolean) => {
            const r = await this.lock.acquireWrite();
            try {
                if(!this.members.value.has(uuid)) return;
                await this.modifyConnFlagLocked(uuid, f ? 1 : 2);
                await this.addMsgLocked([{ fromUuid: "", text: f ? `直连'${name}'成功` : `直连'${name}'失败`, timestamp: Date.now(), fromUsername: "" }]);
                // 直连失败，回退为中转
                if (!f) {
                    this.members.value.get(uuid)!.wgIp = "";
                    this.members.value.get(uuid)!.wgPort = 0;
                    // await wireguardFunc.updatePeerEndpoint(this.roomId, uuid, this.host, this.port);
                    await wireguardFunc.delPeer(this.roomId, uuid);
                }
            } finally { r(); }
        });
    }

    private async addMemberLocked(m: member) {
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
            await wireguardFunc.addPeer(this.roomId, m.uuid, m.wgIp, m.wgPort, m.publicKey,
                [vlan], 1);
            await this.checkDirectConn(m.uuid, m.name, vlan, m.udpPort, 10);
        };
        this.addMsgLocked([{ fromUuid: "", text: `${m.name}加入房间`, timestamp: Date.now(), fromUsername: "" }]);
    }

    public async addMembers(m: member[]) {
        if (m.length === 0) return;
        const r = await this.lock.acquireWrite();
        try {
            for (const mem of m) {
                await this.addMemberLocked(mem);
            }
        } catch (error) { } finally {
            r();
        }
    }

    public async delMember(userUUid: string, force: boolean = false) {
        const r = await this.lock.acquireWrite();
        try {
            const mem = this.members.value.get(userUUid);
            if (!mem) return;
            this.addMsgLocked([{ fromUuid: "", text: force ? `{${mem.name}被踢出房间}`: `${mem.name}离开房间`, timestamp: Date.now(), fromUsername: "" }]);
            this.members.value.delete(userUUid);
            triggerRef(this.members);
            // if (!await wireguardFunc.pauseAdapter(this.roomId)) return;
            await wireguardFunc.delPeer(this.roomId, userUUid);
            await wireguardFunc.delTransIps([`${this.vlanPrefix}.${mem.vlan >> 8}.${mem.vlan & 0xff}`]);
            // await wireguardFunc.runAdapter(this.roomId);
        } catch (error) { } finally { r() }
    }

    public async changeOwner(oldUuid: string, newUuid: string) {
        const r = await this.lock.acquireWrite();
        try {
            const oldMem = this.members.value.get(oldUuid);
            if (oldMem) oldMem.owner = false;
            const newMem = this.members.value.get(newUuid);
            if (newMem) {
                newMem.owner = true;
                this.addMsgLocked([{ fromUuid: "", text: `房主移交至${newMem.name}`, timestamp: Date.now(), fromUsername: "" }])
            }
            triggerRef(this.members);
        } catch (error) { } finally { r() }
    }

    public async changeForbidden(to: boolean) {
        const r = await this.lock.acquireWrite();
        try {
            if (this.forbidden.value === to) return;
            this.forbidden.value = to;
            this.addMsgLocked([{ fromUuid: "", fromUsername: "", text: to ? "房间关闭进入" : "房间开启进入", timestamp: Date.now() }])
        } catch (error) { } finally { r() };
    }

    /**
     * 获取到成员真实公网地址后，wg添加一个点对点peer并进行直连尝试
     * @param peer_uuid 
     * @param ip 
     * @param port 
     * @returns 
     */
    public async updateEndpoint(peer_uuid: string, ip: string, port: number) {
        const r = await this.lock.acquireWrite();
        try {
            let peer = this.members.value.get(peer_uuid);
            if (!peer) return;
            peer.wgIp = ip;
            peer.wgPort = port;
            await wireguardFunc.addPeer(this.roomId, peer.uuid, ip, port, peer.publicKey, [`${this.vlanPrefix}.${peer.vlan >> 8}.${peer.vlan & 0xff}/32`], 1);
            await this.checkDirectConn(peer_uuid, peer.name, this.vlanPrefix + `.${peer.vlan >> 8}.${peer.vlan & 0xff}`, peer.udpPort, 10);
        } catch (error) { } finally { r() }
    }

    public async printWg() {
        const r = await this.lock.acquireWrite();
        try{
            this.addMsgLocked([{fromUuid: this.selfUuid, fromUsername: "", text: await wireguardFunc.getAdapterConfig(this.roomId), timestamp: Date.now()}]);
        } finally {r()};
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


