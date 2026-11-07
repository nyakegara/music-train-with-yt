import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
function createWindow() {
  const window = new BrowserWindow({ width:1420,height:900,minWidth:900,minHeight:700,backgroundColor:'#10100f',webPreferences:{preload:path.join(here,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true} });
  if (app.isPackaged) void window.loadFile(path.join(here,'../renderer/index.html'));
  else void window.loadURL('http://127.0.0.1:5173');
}
ipcMain.handle('app:version',()=>app.getVersion());
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

