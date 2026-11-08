import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('musicTrain', {
  version: () => ipcRenderer.invoke('app:version'),
  copyYouTubeUrl: (videoId: string) => ipcRenderer.invoke('app:copy-youtube-url', videoId),
  minimize: () => ipcRenderer.invoke('app:window-minimize'),
  toggleMaximize: () => ipcRenderer.invoke('app:window-toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('app:window-is-maximized'),
  close: () => ipcRenderer.invoke('app:window-close'),
});
