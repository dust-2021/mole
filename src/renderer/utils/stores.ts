import {defineStore} from 'pinia';
import {server} from "./publicType";

export const Services =  defineStore('Services', {
        state: () => ({
            originData: new Map<string, server>(),
        }),
        getters: {
            get: state => {
                return (key: string): server | undefined => {
                    return state.originData.get(key)
                };
            },
            has: state => {
                return (key: string): boolean => {
                    return state.originData.has(key)
                };
            },
            all: state => {
                return Array.from(state.originData.entries())
            },

        },
        actions: {
            delete(key: string) {
                this.originData.delete(key);

            },
            set(key: string, value: server) {
                this.originData.set(key, value);
            },
            pop(key: string): server | undefined {
                const svr = this.originData.get(key);
                this.originData.delete(key);
                return svr;
            },
            // 直接读取文件数据
            load(): Promise<void> {
                return window['electron'].invoke("loadLocal", 'Services').then((data: string) => {
                    if (data === '' || data === undefined) {
                        return
                    }
                    const elements: [key: string, value: server][] = JSON.parse(data);
                    this.originData = new Map<string, server>(elements);
                });
            },
            // 保存数据到本地文件
            save(): void {
                window['electron'].invoke("saveLocal", 'Services', JSON.stringify(Array.from(this.originData))).then();
            }
        }
    })

// 大厅消息类型
export interface HallMsg {
    senderUuid: string
    senderName: string
    text: string
    timestamp: number
}

// 大厅聊天状态（Pinia 持久化，页面切换不丢失）
export const HallStore = defineStore('HallStore', {
    state: () => ({
        // 每个服务器的大厅状态
        states: {} as Record<string, {
            messages: HallMsg[]
            subscribed: boolean
        }>,
        MAX_MSG: 100,
    }),
    getters: {
        getState: (state) => {
            return (serverName: string) => {
                if (!state.states[serverName]) {
                    state.states[serverName] = {
                        messages: [],
                        subscribed: false,
                    }
                }
                return state.states[serverName]
            }
        },
        isSubscribed: (state) => {
            return (serverName: string) => state.states[serverName]?.subscribed ?? false
        },
    },
    actions: {
        addMsg(serverName: string, msg: HallMsg) {
            const s = this.getState(serverName)
            s.messages.push(msg)
            // 超过max + 100条消息时，裁剪掉最早的消息，避免每次都裁剪，影响性能
            if (s.messages.length > this.MAX_MSG + 100) {
                s.messages = s.messages.slice(s.messages.length - this.MAX_MSG)
            }
        },
        setSubscribed(serverName: string, val: boolean) {
            const s = this.getState(serverName)
            s.subscribed = val
        },
    },
})

// 设备mac地址
export let MacAddress: string = '';

export function initStore(): Promise<void> {
    const svr = Services();
    window['electron'].invoke('macAddress').then((address: string) => {
        MacAddress = address;
    })
    return svr.load();
}

export function saveStore() {
    const svr = Services();
    svr.save();
}