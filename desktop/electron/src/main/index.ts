import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { readFile, writeFile, mkdir, readdir, rm } from 'fs/promises'

// Novels storage directory on user's Desktop per requirement
const getNovelsDir = () => join(app.getPath('desktop'), 'babybus', 'data', 'novels')
const getNovelAssetsDir = (id: string) => join(app.getPath('desktop'), 'babybus', 'data', 'novels_assets', String(id))
const toSlug = (title: string) =>
  (title || 'untitled')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'untitled'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    // Load the Vite dev server in development
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // Load the local index.html in production
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl+R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // IPC handlers
  ipcMain.handle('fs:readTextFile', async (_e, filePath: string) => {
    const buf = await readFile(filePath, 'utf-8')
    return buf
  })

  ipcMain.handle(
    'backend:invoke',
    async (_e, { route, payload }: { route: string; payload: any }) => {
      const base = process.env.BABYBUS_BACKEND_URL || 'http://127.0.0.1:5000'
  
      // Normalize and map renderer routes to Flask endpoints
      const normalize = (r: string) => (r || '').trim().replace(/^\/+/, '')
      const r = normalize(route)
  
      let path = '/' + r
      let method: 'GET' | 'POST' = 'POST'
      let body: any = payload ?? {}
  
      if (r === 'novel/parse') {
        path = '/api/process-novel'
        method = 'POST'
        body = { novel_text: String(payload?.text || '') }
      } else if (r === 'storyboard/recognize') {
        // Pure storyboard recognition: only process novel text
        path = '/api/process-novel'
        method = 'POST'
        body = { novel_text: String(payload?.text || '') }
      } else if (r.startsWith('api/health')) {
        path = '/api/health'
        method = 'GET'
        body = undefined
      } else if (/^api\/results\//.test(r)) {
        path = '/' + r
        method = 'GET'
        body = undefined
      } else if (r.startsWith('api/')) {
        // Pass-through to Flask API
        path = '/' + r
        method = 'POST'
      } else {
        // Default: treat as POST to provided route
        path = '/' + r
        method = 'POST'
      }
  
      const url = `${base}${path}`
  
      try {
        const res = await (globalThis as any).fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined
        })
        const ct = res.headers.get('content-type') || ''
        const data = ct.includes('application/json') ? await res.json() : await res.text()
        return { ok: res.ok, status: res.status, data }
      } catch (e: any) {
        return { ok: false, error: String(e) }
      }
    }
  )

  // Ensure novels directory exists
  mkdir(getNovelsDir(), { recursive: true }).catch(() => {})

  // List saved novels
  ipcMain.handle('novel:list', async () => {
    const dir = getNovelsDir()
    await mkdir(dir, { recursive: true })
    const files = await readdir(dir)
    const novels: any[] = []
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.json')) continue
      try {
        const raw = await readFile(join(dir, f), 'utf-8')
        const n = JSON.parse(raw)
        if (n && n.id && n.title && Array.isArray(n.chapters)) novels.push(n)
      } catch {
        // ignore parse errors
      }
    }
    // newest first by id timestamp if applicable
    novels.sort((a, b) => String(b.id).localeCompare(String(a.id)))
    return novels
  })

  // Save a novel (JSON blob)
  ipcMain.handle('novel:save', async (_e, novel: any) => {
    const dir = getNovelsDir()
    await mkdir(dir, { recursive: true })
    const slug = toSlug(novel?.title || 'untitled')
    const id = String(novel?.id || Date.now())
    const filePath = join(dir, `${id}__${slug}.json`)
    await writeFile(filePath, JSON.stringify(novel ?? {}, null, 2), 'utf-8')
    return { ok: true, path: filePath }
  })

  // Update a novel (write new file and cleanup old id files)
  ipcMain.handle('novel:update', async (_e, novel: any) => {
    const dir = getNovelsDir()
    await mkdir(dir, { recursive: true })
    const slug = toSlug(novel?.title || 'untitled')
    const id = String(novel?.id)
    const newPath = join(dir, `${id}__${slug}.json`)
    await writeFile(newPath, JSON.stringify(novel ?? {}, null, 2), 'utf-8')
    // Cleanup other files of same id with different slug
    const files = await readdir(dir)
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.json')) continue
      if (f.startsWith(id + '__') && join(dir, f) !== newPath) {
        try { await rm(join(dir, f), { force: true }) } catch {}
      }
    }
    return { ok: true, path: newPath }
  })

  // Delete a novel and its assets folder
  ipcMain.handle('novel:delete', async (_e, id: string) => {
    const dir = getNovelsDir()
    const files = await readdir(dir)
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.json')) continue
      if (f.startsWith(String(id) + '__')) {
        try { await rm(join(dir, f), { force: true }) } catch {}
      }
    }
    // remove assets (characters etc.)
    const assetsDir = getNovelAssetsDir(String(id))
    await rm(assetsDir, { recursive: true, force: true }).catch(() => {})
    return { ok: true }
  })

  // Save character reference image and return stored path
  ipcMain.handle('novel:saveCharacterImage', async (_e, payload: { novelId: string; name: string; data: ArrayBuffer | Uint8Array; ext?: string }) => {
    const { novelId, name, data, ext } = payload || ({} as any)
    const base = getNovelAssetsDir(String(novelId))
    const dir = join(base, 'characters')
    await mkdir(dir, { recursive: true })
    const safeExt = String(ext || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'png'
    const slug = toSlug(name || 'character')
    const filePath = join(dir, `${slug}-${Date.now()}.${safeExt}`)
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
    await writeFile(filePath, buf as unknown as Uint8Array)
    return { ok: true, path: filePath }
  })

  // Load local image as Data URL for safe rendering
  ipcMain.handle('file:toDataURL', async (_e, absPath: string) => {
    try {
      const data = await readFile(absPath)
      const ext = (absPath.split('.').pop() || '').toLowerCase()
      let mime = 'application/octet-stream'
      if (ext === 'png') mime = 'image/png'
      else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg'
      else if (ext === 'gif') mime = 'image/gif'
      else if (ext === 'webp') mime = 'image/webp'
      const base64 = data.toString('base64')
      return `data:${mime};base64,${base64}`
    } catch (e) {
      return ''
    }
  })

  // Delete character reference image file
  ipcMain.handle('novel:deleteCharacterImage', async (_e, payload: { novelId: string; imagePath?: string; name?: string }) => {
    const { novelId, imagePath } = payload || ({} as any)
    if (!novelId) return { ok: false }
    if (imagePath) {
      try { await rm(imagePath, { force: true }) } catch {}
    }
    return { ok: true }
  })
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
