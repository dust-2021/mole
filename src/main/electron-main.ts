import {app, ipcMain, Menu} from 'electron';
import {mainWindow} from "./app/window";
import {initialize} from "./ipcApi";
import {Configs} from './public';
import { WgHandler } from './extern/wireguard/wireguard';

initialize(ipcMain);
// Menu.setApplicationMenu(null);

app.whenReady().then(mainWindow);

app.on('window-all-closed', (): void => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('before-quit', (): void => {
    // 保存设置
    Configs.save();
    // 释放dll库
    WgHandler.dispose();
})
