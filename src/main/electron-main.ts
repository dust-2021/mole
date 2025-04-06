import {app, ipcMain, Menu} from 'electron';
import {mainWindow} from "./app/window";
import {initialize} from "./init";
import {Services, Public} from './public/public'

initialize(ipcMain);

// Menu.setApplicationMenu(null);

app.whenReady().then(mainWindow);

app.on('window-all-closed', (): void => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('before-quit', (): void => {
    Services.save();
    Public.save();
})
