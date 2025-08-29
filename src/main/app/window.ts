import {app, BrowserWindow, ipcMain} from "electron";
import {BaseDir, environment} from "../public/public";
import path from "path";

export function mainWindow() {
    const mainWindow = new BrowserWindow({
        width: 1080,
        height: 648,
        resizable: false,
        // backgroundColor: '#00000000',
        frame: false,
        webPreferences: {
            preload: path.join(BaseDir, 'main/preload.js'),
            webSecurity: environment !== 'dev',
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    ipcMain.on('main-close', () => {
        mainWindow.close();
    })
    ipcMain.on('main-min', () => {
        mainWindow.minimize();
    })
    ipcMain.on('main-max', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    })

    // 加载 Vite 开发服务器或构建后的文件
    if (environment === "dev") {
        mainWindow.loadURL('http://localhost:3000');
        // mainWindow.webContents.openDevTools(); // 打开开发者工具
    } else {
        (mainWindow.loadFile(path.join(BaseDir, 'renderer/index.html'))).then();
    }
}
