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
            delete(key: string) {
                window['electron'].invoke(id, 'delete', key).then(() => {
                    this.originData.delete(key);
                })

            },
            set(key: string, value: T) {
                window['electron'].invoke(id, 'set', key, value).then(() => {
                    this.originData.set(key, value);
                });

            },
            pop(key: string): T {
                let svr: T = null;
                window['electron'].invoke(id, 'pop', key).then((data: T) => {
                    svr = data;
                })
                this.originData.delete(key);
                return svr
            },
            // 同步electron中的原数据
            init(): void {
                if (this.initialed) {
                    return
                }
                this.initialed = true;
                window['electron'].invoke(id, 'all').then((data: [string, T][]) => {
                    for (let item of data) {
                        this.originData.set(item[0], item[1]);
                    }
                });

            }
        }
    })
}

/*pinia包装的对等electron服务器数据，原始数据存在于electron主进程中，
增删改同步到源数据，持久化由electron负责，这个数据只是为了响应式
* */
export const Services = createElectronStore<server>('Services');
export const Public = createElectronStore<any>('Public');