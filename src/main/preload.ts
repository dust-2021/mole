import {contextBridge, ipcMain, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('electron', {
    invoke: (channel: string, ...args: [any]) => {return ipcRenderer.invoke(channel, ...args);},
    send: (channel: string, ...args: [any]) => ipcRenderer.send(channel, ...args),
    on: (channel: string, func: (...args: any[]) => void) =>
        ipcRenderer.on(channel, (event, ...args) => func(...args)),
});