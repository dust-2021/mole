import {app, ipcMain, Menu, Tray, nativeImage} from 'electron';
import {mainWindow, appWindow, setQuitting} from "./app/window";
import {initialize} from "./ipcApi";
import {Configs} from './public';
import { WgHandler } from './extern/wireguard/wireguard';
import path from 'path';

let tray: Tray | null = null;

initialize(ipcMain);
// Menu.setApplicationMenu(null);

app.whenReady().then(() => {
    mainWindow();

    // 创建系统托盘
    try {
        const iconPath = app.isPackaged
            ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'assets', 'mole.ico')
            : path.join(__dirname, '..', '..', 'src', 'assets', 'mole.ico');
        const trayIcon = nativeImage.createFromPath(iconPath);
        tray = new Tray(trayIcon.resize({width: 16, height: 16}));
        tray.setToolTip('Mole');

        const contextMenu = Menu.buildFromTemplate([
            {
                label: '显示窗口',
                click: () => {
                    appWindow.show();
                    appWindow.focus();
                }
            },
            {
                label: '退出',
                click: () => {
                    setQuitting();
                }
            }
        ]);
        tray.setContextMenu(contextMenu);

        // 双击托盘图标显示窗口
        tray.on('double-click', () => {
            appWindow.show();
            appWindow.focus();
        });
    } catch (e) {
        console.error('创建系统托盘失败:', e);
    }
});

// 点击 dock 图标时重新显示窗口 (macOS)
app.on('activate', () => {
    if (appWindow) {
        appWindow.show();
        appWindow.focus();
    }
});

app.on('window-all-closed', (): void => {
    // 不退出应用，留在系统托盘
});

app.on('before-quit', (): void => {
    // 保存设置
    Configs.save();
    // 释放dll库
    WgHandler.dispose();
    // 清理托盘图标
    if (tray) {
        tray.destroy();
        tray = null;
    }
})
