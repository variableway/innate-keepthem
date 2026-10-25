// Preload bridge: the only door between the sandboxed renderer and native
// capabilities. Exposed as window.vytdlShell; every method returns the same
// {success, data?, error?} envelope the HTTP API uses.

import { contextBridge, ipcRenderer } from "electron";

const api = {
  platform: process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux",

  versions: () => ipcRenderer.invoke("vytdl:get-versions"),

  revealFolder: (path: string) => ipcRenderer.invoke("vytdl:reveal-folder", path),
  openFolder: (path: string) => ipcRenderer.invoke("vytdl:open-folder", path),
  pickFolder: () => ipcRenderer.invoke("vytdl:pick-folder"),
  clipboardWriteText: (text: string) => ipcRenderer.invoke("vytdl:clipboard-write", text),
};

contextBridge.exposeInMainWorld("vytdlShell", api);
