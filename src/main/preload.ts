import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('musicTrain',{version:()=>ipcRenderer.invoke('app:version')});
