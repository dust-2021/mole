import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('electron', {
    invoke: (channel: string, ...args: [any]) => {
        return ipcRenderer.invoke(channel, ...args);
    },
    send: (channel: string, ...args: [any]) => ipcRenderer.send(channel, ...args),
    on: (channel: string, func: (...args: any[]) => void) =>
        ipcRenderer.on(channel, (event, ...args) => func(...args)),
    remove: (channel: string, func: (...args: any[]) => void) =>
        ipcRenderer.removeListener(channel, (event, ...args) => func(...args)),
    once: (channel: string, func: (...args: any[]) => void) => ipcRenderer.once(channel, (event, ...args) => func(...args)),
});