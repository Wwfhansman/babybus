import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      readTextFile: (filePath: string) => Promise<string>
      invokeBackend: (route: string, payload: unknown) => Promise<unknown>
      listNovels: () => Promise<NovelDTO[]>
      saveNovel: (novel: NovelDTO) => Promise<{ ok: boolean; path: string }>
      updateNovel: (novel: NovelDTO) => Promise<{ ok: boolean; path: string }>
      deleteNovel: (id: string) => Promise<{ ok: boolean }>
      saveCharacterImage: (payload: { novelId: string; name: string; data: ArrayBuffer | Uint8Array; ext?: string }) => Promise<{ ok: boolean; path: string }>
      loadImageDataUrl: (path: string) => Promise<string>
      deleteCharacterImage: (payload: { novelId: string; imagePath?: string }) => Promise<{ ok: boolean }>
    }
  }

  interface SectionDTO { id: string; title: string }
  interface ChapterDTO { id: string; title: string; sections: SectionDTO[]; content?: string }
  interface CharacterDTO { name: string; imagePath?: string }
  interface NovelDTO { id: string; title: string; chapters: ChapterDTO[]; characters?: CharacterDTO[] }
}
