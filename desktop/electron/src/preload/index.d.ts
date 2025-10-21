import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      readTextFile: (filePath: string) => Promise<string>
      invokeBackend: (route: string, payload: unknown) => Promise<unknown>
    }
  }
}
