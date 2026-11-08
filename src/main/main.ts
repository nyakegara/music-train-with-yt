import { app, BrowserWindow, clipboard, ipcMain, Menu, session, shell, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAllowedExternalUrl, youtubeWatchUrl } from './externalLinks.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const packagedYouTubeReferer = 'https://com.musictrain.desktop/';
const packagedRendererUrl = pathToFileURL(path.join(here, '../index.html')).href;
const developmentOrigin = new URL(process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173').origin;
function isTrustedAppFrame(event: IpcMainInvokeEvent) {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) return false;
  if (app.isPackaged) return frame.url === packagedRendererUrl;
  try { return new URL(frame.url).origin === developmentOrigin; }
  catch { return false; }
}
function createWindow() {
  const window = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 900,
    minHeight: 700,
    frame: false,
    backgroundColor: '#10100f',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (app.isPackaged) void window.loadFile(path.join(here,'../index.html'));
  else void window.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173');
}
app.whenReady().then(()=>{
  app.setAppUserModelId('com.musictrain.desktop');
  Menu.setApplicationMenu(null);
  ipcMain.handle('app:version',(event)=>isTrustedAppFrame(event)?app.getVersion():'');
  ipcMain.handle('app:copy-youtube-url',(event,videoId:unknown)=>{
    if(!isTrustedAppFrame(event))return false;
    if(typeof videoId!=='string')return false;
    const url=youtubeWatchUrl(videoId);
    if(!url)return false;
    clipboard.writeText(url);
    return true;
  });
  ipcMain.handle('app:window-minimize',(event)=>{
    if(!isTrustedAppFrame(event))return false;
    const window=BrowserWindow.fromWebContents(event.sender);
    if(!window)return false;
    window.minimize();
    return true;
  });
  ipcMain.handle('app:window-toggle-maximize',(event)=>{
    if(!isTrustedAppFrame(event))return false;
    const window=BrowserWindow.fromWebContents(event.sender);
    if(!window)return false;
    if(window.isMaximized())window.unmaximize();
    else window.maximize();
    return window.isMaximized();
  });
  ipcMain.handle('app:window-is-maximized',(event)=>isTrustedAppFrame(event)?BrowserWindow.fromWebContents(event.sender)?.isMaximized()??false:false);
  ipcMain.handle('app:window-close',(event)=>{
    if(!isTrustedAppFrame(event))return false;
    const window=BrowserWindow.fromWebContents(event.sender);
    if(!window)return false;
    window.close();
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

