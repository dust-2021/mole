import {defineStore} from 'pinia';
import {server} from "./ipcTypes";

function createElectronStore<T>(id: string) {
    return defineStore(id, {
        state: () => ({
            originData: new Map<string, T>(),
            initialed: false,
        }),
        getters: {
            get: state => {
                return (key: string): T | undefined => {
                    return state.originData.get(key) as T
                };
            },
            has: state => {
                return (key: string): boolean => {
                    return state.originData.has(key)
                };
            },
            all: state => {
                return Array.from(state.originData.entries()) as [string, T][]
            },

        },
        actions: {
            async delete(key: string) {
                await window['electron'].invoke(id, 'delete', key);
                this.originData.delete(key);

            },
            async set(key: string, value: T) {
                await window['electron'].invoke(id, 'set', key, value);
                this.originData.set(key, value);
            },
            async pop(key: string): Promise<T> {
                let svr: T = await window['electron'].invoke(id, 'pop', key)
                this.originData.delete(key);
                return svr;
            },
            // 同步electron中的原数据，只需要执行一次，后续执行无效
            async init(): Promise<void> {
                if (this.initialed) {
                    return
                }
                this.initialed = true;
                const data: [string, T][] = await window['electron'].invoke(id, 'all');
                for (let item of data) {
                    this.originData.set(item[0], item[1]);
                }
            }
        }
    })
}

/*pinia包装的对等electron服务器数据，原始数据存在于electron主进程中，
增删改同步到源数据，持久化由electron负责，这个数据只是为了响应式
* */
export const Services = createElectronStore<server>('Services');
export const Public = createElectronStore<any>('Public');
export const Configs = createElectronStore<any>('Configs');

export async function initStore() {
    const svr = Services();
    const pub = Public();
    const config = Configs();
    await svr.init();
    await pub.init();
    await config.init();
}