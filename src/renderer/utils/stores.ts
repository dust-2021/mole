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
            pop(key: string): server {
                let svr: server = this.originData.get(key);
                this.originData.delete(key);
                return svr;
            },
            // 直接读取文件数据
            load(): void {
                window['electron'].invoke("loadLocal", 'Services').then((data: string) => {
                    if (data === '' || data === undefined) {
                        return
                    }
                    const elements: [key: string, value: server][] = JSON.parse(data);
                    for (const key in elements) {
                        this.originData.set(key, elements[key]);
                    }
                    this.originData = new Map<string, server>(elements);
                });
            },
            // 保存数据到本地文件
            save(): void {
                window['electron'].invoke("saveLocal", 'Services', JSON.stringify(Array.from(this.originData))).then();
            }
        }
    })

export const Configs = defineStore('Configs', {
    state: () => ({

    }),
    actions: {
        update(): void {

        }
    }
})
// 设备mac地址
export let MacAddress: string = '';

export function initStore() {
    const svr = Services();
    svr.load();
    window['electron'].invoke('macAddress').then((address: string) => {
        MacAddress = address;
    })
}

export function saveStore() {
    const svr = Services();
    svr.save();
}