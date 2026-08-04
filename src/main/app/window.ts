import {app, BrowserWindow, ipcMain} from "electron";
import {BaseDir} from "../public";
import path from "path";

export let appWindow: BrowserWindow ;
let isQuitting = false;

// 供外部调用，标记为退出状态后关闭窗口
export function setQuitting() {
    isQuitting = true;
    app.quit();
}

export function mainWindow() {

    appWindow = new BrowserWindow({
        width: 1080,
        height: 648,
        resizable: false,
        // backgroundColor: '#00000000',
        frame: false,
        webPreferences: {
            devTools: !app.isPackaged,
            preload: path.join(BaseDir, 'main/preload.js'),
            webSecurity: app.isPackaged,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            spellcheck: false
        }
    });

    // 窗口关闭时隐藏到托盘而不是退出
    appWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            appWindow.hide();
        }
    });

    ipcMain.on('main-close', () => {
        appWindow.close();
    })
    ipcMain.on('main-min', () => {
        appWindow.minimize();
    })
    ipcMain.on('main-max', () => {
        if (appWindow.isMaximized()) {
            appWindow.unmaximize();
        } else {
            appWindow.maximize();
        }
    })

    // 加载 Vite 开发服务器或构建后的文件
    if (!app.isPackaged) {
        appWindow.loadURL('http://localhost:3000');
        // appWindow.webContents.openDevTools(); // 打开开发者工具
    } else {
        (appWindow.loadFile(path.join(BaseDir, 'renderer/index.html'))).then();
    }
}
