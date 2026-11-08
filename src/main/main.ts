import { app, BrowserWindow, clipboard, ipcMain, session, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAllowedExternalUrl, youtubeWatchUrl } from './externalLinks.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const packagedYouTubeReferer = 'https://com.musictrain.desktop/';
function createWindow() {
  const window = new BrowserWindow({ width:1420,height:900,minWidth:900,minHeight:700,backgroundColor:'#10100f',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true} });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (app.isPackaged) void window.loadFile(path.join(here,'../index.html'));
  else void window.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173');
}
app.whenReady().then(()=>{
  app.setAppUserModelId('com.musictrain.desktop');
  ipcMain.handle('app:version',()=>app.getVersion());
  ipcMain.handle('app:copy-youtube-url',(_event,videoId:unknown)=>{
    if(typeof videoId!=='string')return false;
    const url=youtubeWatchUrl(videoId);
    if(!url)return false;
    clipboard.writeText(url);
    return true;
  });
  const youtubeReferer = app.isPackaged ? packagedYouTubeReferer : `${process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'}/`;
  session.defaultSession.webRequest.onBeforeSendHeaders({urls:['https://www.youtube.com/*','https://youtube.com/*']},(details,callback)=>{
    details.requestHeaders.Referer=youtubeReferer;
    callback({requestHeaders:details.requestHeaders});
  });
  createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

