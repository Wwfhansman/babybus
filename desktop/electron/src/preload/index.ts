import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer（占位，后续可扩展）
const api = {
  readTextFile: (filePath: string) => ipcRenderer.invoke('fs:readTextFile', filePath),
  invokeBackend: (route: string, payload: unknown, sessionToken?: string) =>
    ipcRenderer.invoke('backend:invoke', { route, payload, sessionToken }),
  listNovels: () => ipcRenderer.invoke('novel:list'),
  saveNovel: (novel: unknown) => ipcRenderer.invoke('novel:save', novel),
  updateNovel: (novel: unknown) => ipcRenderer.invoke('novel:update', novel),
  deleteNovel: (id: string) => ipcRenderer.invoke('novel:delete', id),
  saveCharacterImage: (payload: { novelId: string; name: string; data: ArrayBuffer | Uint8Array; ext?: string }) => ipcRenderer.invoke('novel:saveCharacterImage', payload),
  loadImageDataUrl: (path: string) => ipcRenderer.invoke('file:toDataURL', path),
  deleteCharacterImage: (payload: { novelId: string; imagePath?: string }) => ipcRenderer.invoke('novel:deleteCharacterImage', payload)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
