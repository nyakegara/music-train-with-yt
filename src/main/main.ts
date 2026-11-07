import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
function createWindow() {
  const window = new BrowserWindow({ width:1420,height:900,minWidth:900,minHeight:700,backgroundColor:'#10100f',webPreferences:{preload:path.join(here,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true} });
  if (app.isPackaged) void window.loadFile(path.join(here,'../renderer/index.html'));
  else void window.loadURL('http://127.0.0.1:5173');
}
ipcMain.handle('app:version',()=>app.getVersion());
app.whenReady().then(()=>{
  app.setAppUserModelId('com.musictrain.desktop');
  session.defaultSession.webRequest.onBeforeSendHeaders({urls:['https://www.youtube.com/*','https://youtube.com/*']},(details,callback)=>{
    details.requestHeaders.Referer='https://com.musictrain.desktop/';
    callback({requestHeaders:details.requestHeaders});
  });
  createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

