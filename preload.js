const { contextBridge, ipcRenderer } = require("electron");

const on = (channel, cb) => ipcRenderer.on(channel, (_e, data) => cb(data));

contextBridge.exposeInMainWorld("store", {
    getApps: () => ipcRenderer.invoke("apps:list"),
    install: id => ipcRenderer.invoke("apps:install", id),
    open: id => ipcRenderer.invoke("apps:open", id),
    onInstallProgress: cb => on("apps:progress", cb),
    version: () => ipcRenderer.invoke("app:version"),
    restartForUpdate: () => ipcRenderer.send("update:restart"),
    onUpdateReady: cb => on("update:ready", cb),
    onFocus: cb => on("window:focus", cb)
});
