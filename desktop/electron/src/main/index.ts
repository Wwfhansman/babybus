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
    async (_e, { route, payload }: { route: string; payload: unknown }) => {
      try {
        // 后端服务器地址
        const BACKEND_URL = 'http://139.224.101.91:5000'
        
        // 根据路由映射到具体的API端点
        let apiEndpoint = ''
        let requestData = payload
        
        if (route === 'storyboard/recognize') {
          // 识别分镜：调用处理小说文本的API
          apiEndpoint = '/api/process-novel'
          requestData = {
            novel_text: (payload as any)?.text || ''
          }
        } else {
          // 其他路由的占位处理
          return { route, ok: false, error: 'Unknown route' }
        }
        
        // 发送HTTP请求到后端
        const response = await fetch(`${BACKEND_URL}${apiEndpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData)
        })
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        
        const result = await response.json()
        
        // 处理返回结果，转换为前端期望的格式
        if (route === 'storyboard/recognize') {
          console.log('=== 主进程处理 storyboard/recognize ===')
          console.log('后端原始响应:', JSON.stringify(result, null, 2))
          
          // 从后端LLM结果中提取分镜信息
          const llmResult = result.llm_result
          console.log('LLM结果:', JSON.stringify(llmResult, null, 2))
          
          let sections = []
          // 在外层作用域定义scenesDetail变量
          let scenesDetail = []
          
          if (llmResult) {
            // 获取各种数据数组
            const scenes = llmResult.scenes || []
            scenesDetail = llmResult.scenes_detail || []
            const dialogue = llmResult.dialogue || []
            
            console.log('scenes:', scenes)
            console.log('scenes_detail:', scenesDetail)
            console.log('dialogue:', dialogue)
            
            // 确定分镜数量（以最长的数组为准）
            const maxLength = Math.max(scenes.length, scenesDetail.length, dialogue.length)
            console.log('分镜数量:', maxLength)
            
            // 组合完整的分镜信息
            for (let i = 0; i < maxLength; i++) {
              const sceneTitle = scenes[i] || `场景 ${i + 1}`
              const sceneDetail = scenesDetail[i] || ''
              const sceneDialogue = dialogue[i] || ''
              
              // 清理详细描述（去除"图片X："前缀）
              const cleanDetail = sceneDetail.replace(/^图片\d+：/, '').trim()
              
              // 清理对话（去除"对白X："前缀）
              const cleanDialogue = sceneDialogue.replace(/^对白\d+：/, '').trim()
              
              const section = {
                id: `scene-${i + 1}`,
                title: sceneTitle.trim(),
                detail: cleanDetail,
                dialogue: cleanDialogue,
                // 为了向后兼容，保留原有的description字段
                description: cleanDetail
              }
              
              console.log(`分镜 ${i + 1}:`, section)
              sections.push(section)
            }
          }
          
          console.log('最终生成的sections:', sections)
          
          const finalResult = {
            ok: true,
            sections: sections,
            process_id: result.process_id,
            scenes_count: sections.length,
            character_consistency: llmResult?.character_consistency || {},
            environment_consistency: llmResult?.environment_consistency || {},
            scenes_detail: scenesDetail,
            raw_result: result
          }
          
          console.log('返回给前端的最终结果:', JSON.stringify(finalResult, null, 2))
          
          return finalResult
        }
        
        return { ok: true, result }
        
      } catch (error) {
        console.error('Backend API call failed:', error)
        return { 
          ok: false, 
          error: error instanceof Error ? error.message : 'Unknown error',
          route 
        }
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
    await writeFile(filePath, buf)
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
