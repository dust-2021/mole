import {app, BrowserWindow, ipcMain} from "electron";
import {BaseDir} from "../public";
import path from "path";

export function mainWindow() {
    const mainWindow = new BrowserWindow({
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
    if (!app.isPackaged) {
        mainWindow.loadURL('http://localhost:3000');
        // mainWindow.webContents.openDevTools(); // 打开开发者工具
    } else {
        (mainWindow.loadFile(path.join(BaseDir, 'renderer/index.html'))).then();
    }
}
