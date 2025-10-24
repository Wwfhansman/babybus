import React, { useMemo, useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

// 简易数据结构与占位数据
export type Section = { 
  id: string; 
  title: string;
  detail?: string;
  dialogue?: string;
  description?: string;
}
// 将章节类型扩展为包含正文内容
export type Chapter = { 
  id: string; 
  title: string; 
  sections: Section[]; 
  content?: string;
  processId?: string;
  scenesCount?: number;
  characterConsistency?: Record<string, string>;
  environmentConsistency?: Record<string, string>;
  scenesDetail?: string[];
}
export type Character = { name: string; imagePath?: string }
export type Novel = { id: string; title: string; chapters: Chapter[]; characters?: Character[] }

// 漫画生成相关类型定义
export type ComicGenerationStatus = 'idle' | 'connecting' | 'generating' | 'completed' | 'error'
export type ComicImage = {
  id: string;
  url: string;
  sceneIndex: number;
  description?: string;
}
export type ComicGenerationState = {
  status: ComicGenerationStatus;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  images: ComicImage[];
  error?: string;
  message?: string;
}

// 移除样例小说：从本地读取

// 章节拆分（改进版：支持中文数字、序章/尾声/番外、CHAPTER）
function splitChaptersFromText(text: string): Chapter[] {
  const lines = text.split(/\r?\n/)
  const chapters: Chapter[] = []
  let buf: string[] = []

  const isHeading = (s: string): boolean => {
    const t = s.trim()
    if (!t) return false
    const patterns = [
      /^第[一二三四五六七八九十百千零两\d]+[章节卷回]/i,
      /^(序章|楔子|引子|前言|序言|尾声|终章|番外)(\s|：|:|$)/,
      /^\s*(CHAPTER|Chapter)\s+\d+/,
      /^\s*第\s*\d+\s*(章|回|节)/
    ]
    return patterns.some((re) => re.test(t))
  }

  let current: Chapter | null = null
  const pushCurrent = () => {
    if (!current) return
    current.content = buf.join('\n').trim()
    chapters.push(current)
    buf = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (isHeading(trimmed)) {
      // 新章节
      pushCurrent()
      current = { id: `ch-${chapters.length + 1}`, title: trimmed || `章节 ${chapters.length + 1}`, sections: [] }
    } else {
      // 正文
      buf.push(line)
    }
  }

  // 收尾
  pushCurrent()

  // 为空则回退为单章
  if (!chapters.length) {
    return [{ id: 'ch-1', title: '第一章', content: text.trim(), sections: [] }]
  }

  // 基于正文粗略生成分镜片段（最多 12 条）
  chapters.forEach((ch) => {
    // 不再自动生成sections，保持为空数组
    ch.sections = []
  })

  return chapters
}

const AddNovelDialog: React.FC<{ onClose(): void; onSubmit(n: Novel): void }> = ({ onClose, onSubmit }) => {
  const [tab, setTab] = useState<'text' | 'file'>('text')
  const [text, setText] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)

  const canSubmitText = text.trim().length > 0 && text.trim().length <= 5000

  const handleFile = async (file: File | null) => {
    setFileError(null)
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setFileError('仅支持 TXT 文件导入')
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const content = String(reader.result || '')
      try {
        await window.api.invokeBackend('novel/parse', { text: content })
      } catch {}
      const chapters = splitChaptersFromText(content)
      const novel: Novel = { id: 'novel-' + Date.now(), title: file.name.replace(/\.txt$/i, ''), chapters }
      onSubmit(novel)
      onClose()
    }
    reader.readAsText(file, 'utf-8')
  }

  const submitText = async () => {
    try {
      await window.api.invokeBackend('novel/parse', { text })
    } catch {}
    const chapters = splitChaptersFromText(text)
    const novel: Novel = { id: 'novel-' + Date.now(), title: '新小说（单章节）', chapters }
    onSubmit(novel)
    onClose()
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-tabs">
          <button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}>文本输入（≤5000）</button>
          <button className={tab === 'file' ? 'active' : ''} onClick={() => setTab('file')}>导入 TXT 文件</button>
        </div>
        {tab === 'text' ? (
          <div className="dialog-content">
            <textarea placeholder="输入不超过 5000 字，将自动创建单章节" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="dialog-actions">
              <span>{text.length}/5000</span>
              <button disabled={!canSubmitText} onClick={submitText}>创建</button>
            </div>
          </div>
        ) : (
          <div className="dialog-content">
            <input type="file" accept=".txt" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
            {fileError && <div className="error-tip">{fileError}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// 新增：小说设置弹框
const NovelSettingsDialog: React.FC<{
  novel: Novel
  onClose(): void
  onUpdate(n: Novel): void
  onDelete(id: string): void
}> = ({ novel, onClose, onUpdate, onDelete }) => {
  const [title, setTitle] = useState(novel.title)
  const [characters, setCharacters] = useState<Character[]>(novel.characters || [])
  const [newCharName, setNewCharName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const urls = await Promise.all((characters || []).map(async (c) => {
        if (c.imagePath) {
          try { return await (window as any).api.loadImageDataUrl(c.imagePath) } catch { return '' }
        }
        return ''
      }))
      if (!cancelled) setPreviewUrls(urls)
    })()
    return () => { cancelled = true }
  }, [characters])

  const handleSave = async () => {
    const updated: Novel = { ...novel, title, characters }
    try {
      // 调用更新接口：主进程会处理重命名与旧文件清理
      await (window as any).api.updateNovel(updated)
      onUpdate(updated)
      onClose()
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = async () => {
    if (!confirm('确定删除该小说？此操作不可撤销！')) return
    try {
      await (window as any).api.deleteNovel(novel.id)
      onDelete(novel.id)
      onClose()
    } catch (e) {
      console.error(e)
    }
  }

  const addCharacter = async (file: File | null) => {
    if (!newCharName.trim()) return
    if (!file) return
    setUploading(true)
    try {
      const buf = await file.arrayBuffer()
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const res = await (window as any).api.saveCharacterImage({ novelId: novel.id, name: newCharName.trim(), data: buf, ext })
      const entry: Character = { name: newCharName.trim(), imagePath: String(res?.path || '') }
      setCharacters((prev) => [...prev, entry])
      setNewCharName('')
    } finally {
      setUploading(false)
    }
  }

  const removeCharacter = async (idx: number) => {
    const target = characters[idx]
    try {
      if (target?.imagePath) {
        await (window as any).api.deleteCharacterImage({ novelId: novel.id, imagePath: target.imagePath })
      }
    } catch (e) {
      console.warn('删除人物图片失败', e)
    }
    setCharacters((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="novel-settings-overlay" onClick={onClose}>
      <div className="novel-settings" onClick={(e) => e.stopPropagation()}>
        <header>
          <h4>小说设置</h4>
          <button className="close" onClick={onClose}>×</button>
        </header>
        <div className="body">
          <label className="field">
            <span>小说名称</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入新的小说名称" />
          </label>

          <div className="field">
            <span>人物参考图</span>
            <div className="characters">
              {(characters || []).map((c, idx) => (
                <div key={idx} className="character-item">
                  <div className="preview">
-                    {c.imagePath ? (<img src={(c.imagePath.startsWith('file://') ? c.imagePath : ('file://' + c.imagePath))} alt={c.name} />) : (<div className="placeholder">无图</div>)}
+                    {c.imagePath ? (<img src={(c.imagePath.startsWith('file://') ? c.imagePath : ('file://' + c.imagePath))} alt={c.name} />) : (<div className="placeholder">无图</div>)}
                  </div>
                  <div className="meta">
                    <input value={c.name} onChange={(e) => {
                      const v = e.target.value
                      setCharacters((prev) => prev.map((item, i) => i === idx ? { ...item, name: v } : item))
                    }} />
                  </div>
                  <button className="danger" onClick={() => removeCharacter(idx)}>删除</button>
                </div>
              ))}
              <div className="character-add">
                <input value={newCharName} onChange={(e) => setNewCharName(e.target.value)} placeholder="角色名" />
                <input type="file" accept="image/*" disabled={!newCharName.trim() || uploading} onChange={(e) => addCharacter(e.target.files?.[0] || null)} />
              </div>
            </div>
          </div>
        </div>
        <footer>
          <button className="danger" onClick={handleDelete}>删除小说</button>
          <div className="spacer" />
          <button className="primary" onClick={handleSave} disabled={!title.trim()}>保存</button>
        </footer>
      </div>
    </div>
  )
}

const CreatePage: React.FC = () => {
  const [novels, setNovels] = useState<Novel[]>([])
  const [selectedNovelId, setSelectedNovelId] = useState<string | null>(null)
  const selectedNovel = useMemo(() => novels.find((n) => n.id === selectedNovelId) || null, [novels, selectedNovelId])
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  const selectedChapter = useMemo(() => selectedNovel?.chapters.find((c) => c.id === selectedChapterId) || null, [selectedNovel, selectedChapterId])
  const [showAdd, setShowAdd] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [browseLevel, setBrowseLevel] = useState<'home' | 'novel'>('home')
  const [browseNovelId, setBrowseNovelId] = useState<string | null>(null)
  const [chapterPageIdx, setChapterPageIdx] = useState(0)
  const PER_PAGE = 50
  const browseNovel = useMemo(() => novels.find(n => n.id === browseNovelId) || null, [novels, browseNovelId])
  const [recognizing, setRecognizing] = useState(false)
  const [settingsForId, setSettingsForId] = useState<string | null>(null)

  // 角色设定和环境设定的本地状态管理
  const [localCharacters, setLocalCharacters] = useState<Record<string, string>>({})
  const [localEnvironments, setLocalEnvironments] = useState<Record<string, string>>({})

  // 漫画生成状态管理
  const [comicGeneration, setComicGeneration] = useState<ComicGenerationState>({
    status: 'idle',
    progress: { current: 0, total: 0, percentage: 0 },
    images: [],
    error: undefined,
    message: undefined
  })
  const socketRef = useRef<Socket | null>(null)

  // 当选择章节变化时，同步本地状态
  useEffect(() => {
    if (selectedChapter) {
      setLocalCharacters(selectedChapter.characterConsistency || {})
      setLocalEnvironments(selectedChapter.environmentConsistency || {})
    } else {
      setLocalCharacters({})
      setLocalEnvironments({})
    }
  }, [selectedChapter])

  // 角色管理函数
  const addCharacter = () => {
    const newKey = `角色${Object.keys(localCharacters).length + 1}`
    setLocalCharacters(prev => ({ ...prev, [newKey]: '' }))
  }

  const updateCharacterName = (oldName: string, newName: string) => {
    if (oldName === newName) return
    setLocalCharacters(prev => {
      const newCharacters = { ...prev }
      if (newName && !newCharacters[newName]) {
        newCharacters[newName] = newCharacters[oldName] || ''
        delete newCharacters[oldName]
      }
      return newCharacters
    })
  }

  const updateCharacterDesc = (name: string, desc: string) => {
    setLocalCharacters(prev => ({ ...prev, [name]: desc }))
  }

  const removeCharacter = (name: string) => {
    console.log('删除角色:', name) // 添加调试日志
    setLocalCharacters(prev => {
      const newCharacters = { ...prev }
      delete newCharacters[name]
      console.log('删除后的角色列表:', newCharacters) // 添加调试日志
      return newCharacters
    })
    // 立即保存到章节数据
    setTimeout(() => saveSettings(), 0)
  }

  // 环境管理函数
  const addEnvironment = () => {
    const newKey = `环境${Object.keys(localEnvironments).length + 1}`
    setLocalEnvironments(prev => ({ ...prev, [newKey]: '' }))
  }

  const updateEnvironmentName = (oldName: string, newName: string) => {
    if (oldName === newName) return
    setLocalEnvironments(prev => {
      const newEnvironments = { ...prev }
      if (newName && !newEnvironments[newName]) {
        newEnvironments[newName] = newEnvironments[oldName] || ''
        delete newEnvironments[oldName]
      }
      return newEnvironments
    })
  }

  const updateEnvironmentDesc = (name: string, desc: string) => {
    setLocalEnvironments(prev => ({ ...prev, [name]: desc }))
  }

  const removeEnvironment = (name: string) => {
    console.log('删除环境:', name) // 添加调试日志
    setLocalEnvironments(prev => {
      const newEnvironments = { ...prev }
      delete newEnvironments[name]
      console.log('删除后的环境列表:', newEnvironments) // 添加调试日志
      return newEnvironments
    })
    // 立即保存到章节数据
    setTimeout(() => saveSettings(), 0)
  }

  // 保存设定到章节数据
  const saveSettings = () => {
    if (!selectedChapter || !selectedNovelId) return
    
    setNovels(prev => prev.map(n => n.id === selectedNovelId ? ({
      ...n,
      chapters: n.chapters.map(ch => ch.id === selectedChapter.id ? ({
        ...ch,
        characterConsistency: localCharacters,
        environmentConsistency: localEnvironments
      }) : ch)
    }) : n))
  }

  // WebSocket连接管理
  useEffect(() => {
    // 初始化WebSocket连接
    const initSocket = () => {
      if (socketRef.current) return // 已经连接

      try {
        const socket = io('http://139.224.101.91:5000', {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5,
          forceNew: true
        })

        socket.on('connect', () => {
          console.log('WebSocket连接成功')
          setComicGeneration(prev => ({
            ...prev,
            status: 'idle'
          }))
        })

        socket.on('connect_error', (error) => {
          console.error('WebSocket连接错误:', error)
          setComicGeneration(prev => ({
            ...prev,
            status: 'error',
            error: `连接服务器失败: ${error.message || '请检查服务器是否正常运行'}`
          }))
        })

        socket.on('disconnect', (reason) => {
          console.log('WebSocket断开连接:', reason)
          if (comicGeneration.status === 'generating') {
            setComicGeneration(prev => ({
              ...prev,
              status: 'error',
              error: '连接意外断开，请重试'
            }))
          }
        })

        socket.on('reconnect', (attemptNumber) => {
          console.log('WebSocket重连成功，尝试次数:', attemptNumber)
          setComicGeneration(prev => ({
            ...prev,
            status: 'idle',
            error: undefined
          }))
        })

        socket.on('reconnect_error', (error) => {
          console.error('WebSocket重连失败:', error)
        })

        socket.on('generation_status', (data) => {
          console.log('生成状态更新:', data)
          setComicGeneration(prev => ({
            ...prev,
            status: 'generating',
            message: data.message
          }))
        })

        socket.on('generation_progress', (data) => {
          console.log('生成进度更新:', data)
          setComicGeneration(prev => ({
            ...prev,
            progress: {
              current: data.step,
              total: data.total,
              percentage: Math.round((data.step / data.total) * 100)
            },
            message: data.message
          }))
        })

        socket.on('comics_generation_complete', (data) => {
          console.log('漫画生成完成:', data)
          const images: ComicImage[] = data.comic_results?.map((result: any, index: number) => ({
            id: `comic-${index}`,
            url: result.image_url || result.url,
            sceneIndex: index,
            description: result.description || result.prompt
          })) || []

          setComicGeneration(prev => ({
            ...prev,
            status: 'completed',
            images,
            message: data.message
          }))
        })

        socket.on('generation_error', (data) => {
          console.error('漫画生成错误:', data)
          setComicGeneration(prev => ({
            ...prev,
            status: 'error',
            error: data.error,
            message: undefined
          }))
        })

        socketRef.current = socket
      } catch (error) {
        console.error('WebSocket连接失败:', error)
        setComicGeneration(prev => ({
          ...prev,
          status: 'error',
          error: '无法连接到服务器'
        }))
      }
    }

    initSocket()

    // 清理函数
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [])

  // 重试生成功能
  const retryGeneration = () => {
    setComicGeneration(prev => ({
      ...prev,
      status: 'idle',
      error: undefined,
      message: undefined
    }))
    // 重新尝试生成
    setTimeout(() => generateComics(), 100)
  }

  // 重置生成状态
  const resetGeneration = () => {
    setComicGeneration({
      status: 'idle',
      progress: { current: 0, total: 0, percentage: 0 },
      images: [],
      message: undefined,
      error: undefined
    })
  }

  // 取消生成功能
  const cancelGeneration = () => {
<<<<<<< HEAD
    if (socketRef.current && (comicGeneration.status === 'generating' || comicGeneration.status === 'connecting')) {
      socketRef.current.emit('cancel_generation')
=======
    console.log('取消漫画生成...');
    
    // 清除超时定时器
    if ((window as any).generationTimeout) {
      clearTimeout((window as any).generationTimeout);
      delete (window as any).generationTimeout;
      console.log('已清除生成超时定时器');
    }

    if (socketRef.current && (comicGeneration.status === 'generating' || comicGeneration.status === 'connecting')) {
      console.log('发送取消请求到服务器');
      socketRef.current.emit('cancel_generation', { 
        process_id: selectedNovel?.id 
      });
      
>>>>>>> 61fac845b79edacab33f62b90c5b7868d4e03ab4
      setComicGeneration(prev => ({
        ...prev,
        status: 'idle',
        progress: { current: 0, total: 0, percentage: 0 },
        message: undefined,
        error: undefined
<<<<<<< HEAD
      }))
=======
      }));
      
      console.log('漫画生成已取消');
>>>>>>> 61fac845b79edacab33f62b90c5b7868d4e03ab4
    }
  }

  // 导出漫画功能
  const exportComics = async () => {
    if (comicGeneration.images.length === 0) {
      alert('没有可导出的图片')
      return
    }

    try {
      // 创建一个包含所有图片的ZIP文件
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      
      // 添加每张图片到ZIP
      for (let i = 0; i < comicGeneration.images.length; i++) {
        const image = comicGeneration.images[i]
        try {
          const response = await fetch(image.url)
          const blob = await response.blob()
          zip.file(`scene-${image.sceneIndex + 1}.jpg`, blob)
        } catch (error) {
          console.error(`下载图片 ${i + 1} 失败:`, error)
        }
      }

      // 生成ZIP文件并下载
      const content = await zip.generateAsync({ type: 'blob' })
      const url = window.URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `${selectedChapter?.title || '漫画'}-${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      alert('导出成功！')
    } catch (error) {
      console.error('导出失败:', error)
      alert('导出失败，请重试')
    }
  }

  // 漫画生成函数
  const generateComics = async () => {
    if (!selectedChapter || !selectedNovelId || !socketRef.current) {
      alert('请先选择章节并确保连接正常')
      return
    }

    // 检查是否有必要的设定
    if (Object.keys(localCharacters).length === 0 && Object.keys(localEnvironments).length === 0) {
      if (!confirm('当前没有设置角色和环境，是否继续生成漫画？')) {
        return
      }
    }

    try {
<<<<<<< HEAD
=======
      console.log('开始漫画生成流程...')
>>>>>>> 61fac845b79edacab33f62b90c5b7868d4e03ab4
      setComicGeneration(prev => ({
        ...prev,
        status: 'connecting',
        progress: { current: 0, total: 0, percentage: 0 },
        images: [],
        error: undefined,
        message: '正在连接服务器...'
      }))

<<<<<<< HEAD
=======
      // 确保WebSocket连接
      if (!socketRef.current.connected) {
        console.log('WebSocket未连接，尝试建立连接...')
        setComicGeneration(prev => ({
          ...prev,
          message: '正在建立连接...'
        }))
        
        // 等待连接建立，增加超时处理
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error('WebSocket连接超时')
            reject(new Error('连接超时，请检查网络或服务器状态'))
          }, 30000) // 增加到30秒

          if (socketRef.current?.connected) {
            console.log('WebSocket已连接')
            clearTimeout(timeout)
            resolve(void 0)
          } else {
            socketRef.current?.on('connect', () => {
              console.log('WebSocket连接成功')
              clearTimeout(timeout)
              resolve(void 0)
            })
            socketRef.current?.on('connect_error', (error) => {
              console.error('WebSocket连接错误:', error)
              clearTimeout(timeout)
              reject(error)
            })
          }
        })
      }

      console.log('准备发送漫画生成请求...')
      setComicGeneration(prev => ({
        ...prev,
        message: '正在发送生成请求...',
        progress: { current: 1, total: 10, percentage: 10 }
      }))

>>>>>>> 61fac845b79edacab33f62b90c5b7868d4e03ab4
      // 准备发送的数据
      const generationData = {
        process_id: selectedChapter.processId,
        chapter_id: selectedChapter.id,
        chapter_content: selectedChapter.content,
        character_consistency: localCharacters,
        environment_consistency: localEnvironments,
        scenes_detail: selectedChapter.scenesDetail || []
      }

      console.log('发送漫画生成请求:', generationData)

<<<<<<< HEAD
      // 通过WebSocket发送生成请求
      socketRef.current.emit('generate_comics', generationData)

=======
      // 设置生成超时（30分钟）
      const generationTimeout = setTimeout(() => {
        console.error('漫画生成超时')
        setComicGeneration(prev => ({
          ...prev,
          status: 'error',
          error: '生成超时，请重试或联系管理员'
        }))
      }, 30 * 60 * 1000) // 30分钟

      // 通过WebSocket发送生成请求
      socketRef.current.emit('generate_comics', generationData)

      // 保存超时ID以便取消时清除
      ;(window as any).generationTimeout = generationTimeout

>>>>>>> 61fac845b79edacab33f62b90c5b7868d4e03ab4
    } catch (error) {
        console.error('漫画生成请求失败:', error)
        setComicGeneration(prev => ({
          ...prev,
          status: 'error',
          error: error instanceof Error ? error.message : '生成请求失败，请重试'
        }))
    }
  }

  // 初始化：从本地读取小说列表
  useEffect(() => {
    (async () => {
      try {
        const list = await window.api.listNovels()
        setNovels(list as unknown as Novel[])
        // 初次进入不自动选择小说与章节，保持为空等待手动选择
      } catch {}
    })()
  }, [])

  async function recognizeStoryboard() {
    if (!selectedChapter || !selectedNovelId) return
    const text = selectedChapter.content || ''
    if (!text) return
    
    setRecognizing(true)
    try {
      console.log('开始识别分镜，发送文本到后端...')
      console.log('发送的文本内容:', text.substring(0, 100) + '...')
      
      const res: any = await window.api.invokeBackend('storyboard/recognize', { 
        chapterId: selectedChapter.id, 
        text 
      })
      
      console.log('后端完整响应:', JSON.stringify(res, null, 2))
      
      if (res.ok && res.sections && Array.isArray(res.sections)) {
        console.log('解析到的分镜数据:', res.sections)
        
        // 使用后端返回的分镜数据
        const sections: Section[] = res.sections.map((item: any, idx: number) => {
          console.log(`分镜 ${idx + 1}:`, item)
          return {
            id: item.id || `s-${idx + 1}`,
            title: item.title || `镜头 ${idx + 1}`,
            detail: item.detail || '',
            dialogue: item.dialogue || '',
            description: item.description || item.detail || ''
          }
        })
        
        console.log('最终分镜数据:', sections)
        
        setNovels(prev => prev.map(n => n.id === selectedNovelId ? ({
          ...n,
          chapters: n.chapters.map(ch => ch.id === selectedChapter.id ? ({ 
            ...ch, 
            sections: sections,
            // 保存后端处理结果的ID，用于后续生成漫画
            processId: res.process_id,
            // 保存角色设定、环境设定等信息
            scenesCount: res.scenes_count,
            characterConsistency: res.character_consistency,
            environmentConsistency: res.environment_consistency,
            scenesDetail: res.scenes_detail
          }) : ch)
        }) : n))
        
      } else {
        // 后端调用失败，使用降级方案
        console.warn('后端处理失败，使用降级方案:', res.error || '未知错误')
        console.log('完整响应对象:', res)
        
        const fallbackSections = text
          .split(/[。！？!?\n]+/)
          .map(s => s.trim())
          .filter(Boolean)
          .slice(0, 12)
          .map((t, i) => ({ 
            id: `s-${i + 1}`, 
            title: t.slice(0, 24) || `镜头 ${i + 1}` 
          }))
        
        console.log('降级方案分镜:', fallbackSections)
        
        setNovels(prev => prev.map(n => n.id === selectedNovelId ? ({
          ...n,
          chapters: n.chapters.map(ch => ch.id === selectedChapter.id ? ({ 
            ...ch, 
            sections: fallbackSections 
          }) : ch)
        }) : n))
      }
      
    } catch (e) {
      console.error('识别分镜时发生错误:', e)
      // 发生异常时的降级方案
      const fallbackSections = text
        .split(/[。！？!?\n]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 12)
        .map((t, i) => ({ 
          id: `s-${i + 1}`, 
          title: t.slice(0, 24) || `镜头 ${i + 1}` 
        }))
      
      setNovels(prev => prev.map(n => n.id === selectedNovelId ? ({
        ...n,
        chapters: n.chapters.map(ch => ch.id === selectedChapter.id ? ({ 
          ...ch, 
          sections: fallbackSections 
        }) : ch)
      }) : n))
      
    } finally {
      setRecognizing(false)
    }
  }

  return (
    <div className="create-layout">
      {/* 左：小说抽屉（点击展开保持） */}
      <div className={`novel-drawer fade-in ${drawerOpen ? 'open' : ''}`}>
        <button className="novel-drawer-handle" onClick={() => setDrawerOpen(true)} aria-label="展开小说抽屉">
          <svg viewBox="0 0 24 24">
            {/* 书页图标（右上折角） */}
            <path className="fill" d="M7 4h7l4 4v12H7z"/>
            <path d="M14 4v4h4"/>
            {/* 右箭头 */}
            <path d="M9 8l5 4-5 4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="drawer-content panel" onClick={(e) => { e.stopPropagation(); if (!drawerOpen) setDrawerOpen(true); }}>
          <header className="panel-header">
            <div className="breadcrumb">
              <span className="crumb home" onClick={() => { setBrowseLevel('home'); setBrowseNovelId(null); }}>首页</span>
              {browseLevel === 'novel' && (
                <>
                  <span className="sep"> —— </span>
                  <span className="crumb current">{browseNovel?.title || ''}</span>
                </>
              )}
            </div>
            <div className="actions">
              <button className="primary" onClick={() => setShowAdd(true)}>+ 上传新小说</button>
            </div>
          </header>

          {browseLevel === 'home' ? (
            <div className="novel-home">
              {novels.map((n) => (
                <div key={n.id} className={`novel ${selectedNovelId === n.id ? 'selected' : ''}`}>
                  <div
                    className="novel-title"
                    onClick={() => {
                      setSelectedNovelId(n.id)
                      setBrowseNovelId(n.id)
                      setBrowseLevel('novel')
                      setChapterPageIdx(0)
                    }}
                  >
                    {n.title}
                    <button className="icon settings" title="设置" onClick={(e) => { e.stopPropagation(); setSettingsForId(n.id); }}>
                      ⚙️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="novel-chapters">
              <div className="page-tabs">
                <label className="page-label" htmlFor="page-select">章节范围</label>
                <select
                  id="page-select"
                  className="page-select"
                  value={chapterPageIdx}
                  onChange={(e) => setChapterPageIdx(Number(e.target.value))}
                >
                  {Array.from({ length: Math.max(1, Math.ceil((browseNovel?.chapters.length || 0) / PER_PAGE)) }).map((_, i) => {
                    const start = i * PER_PAGE + 1
                    const end = Math.min((i + 1) * PER_PAGE, browseNovel?.chapters.length || 0)
                    return (
                      <option key={i} value={i}>{start}-{end}</option>
                    )
                  })}
                </select>
                <div className="spacer" />
                <button
                  className="pager prev"
                  aria-label="上一页"
                  disabled={chapterPageIdx <= 0}
                  onClick={() => setChapterPageIdx(Math.max(0, chapterPageIdx - 1))}
                >
                  上一页
                </button>
                <button
                  className="pager next"
                  aria-label="下一页"
                  disabled={chapterPageIdx >= Math.max(1, Math.ceil((browseNovel?.chapters.length || 0) / PER_PAGE)) - 1}
                  onClick={() => setChapterPageIdx(Math.min(Math.max(1, Math.ceil((browseNovel?.chapters.length || 0) / PER_PAGE)) - 1, chapterPageIdx + 1))}
                >
                  下一页
                </button>
              </div>
              <ul className="chapters">
                {(browseNovel?.chapters || []).slice(chapterPageIdx * PER_PAGE, chapterPageIdx * PER_PAGE + PER_PAGE).map((ch) => (
                  <li
                    key={ch.id}
                    className={selectedChapterId === ch.id ? 'active' : ''}
                    onClick={() => {
                      setSelectedNovelId(browseNovel?.id || null)
                      setSelectedChapterId(ch.id)
                      setDrawerOpen(false)
                    }}
                  >
                    {ch.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* 新增：章节内容区（点击外部收回抽屉） */}
      <section className="panel chapter-panel fade-in" onClick={() => drawerOpen && setDrawerOpen(false)}>
        <header>
          <h3>章节内容区</h3>
        </header>
        <div className="chapter-body">
          {selectedChapter?.content ? (
            <pre className="chapter-content">{selectedChapter.content}</pre>
          ) : (
            <div className="empty">请选择章节以查看正文</div>
          )}
          <div className="actions">
            <button className="primary" disabled={!selectedChapter?.content || recognizing} onClick={recognizeStoryboard}>
              {recognizing ? (
                <span className="loading-text">
                  <span className="spinner">⏳</span>
                  正在识别分镜...
                </span>
              ) : '识别分镜'}
            </button>
            {recognizing && (
              <div className="loading-tip">
                正在将章节内容发送到后端进行AI分析，请稍候...
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 中：设定编辑区（点击外部收回抽屉） */}
      <section className="panel settings-panel fade-in" onClick={() => drawerOpen && setDrawerOpen(false)}>
        <header>
          <h3>设定编辑区</h3>
        </header>
        <div className="settings-body">
          {selectedChapter ? (
            <div className="storyboard">
              <h4>分镜设定 - {selectedChapter.title}</h4>
              {recognizing ? (
                <div className="processing-status">
                  <div className="status-indicator">
                    <span className="spinner">🔄</span>
                    <span>正在处理章节内容...</span>
                  </div>
                  <div className="status-details">
                    后端AI正在分析文本并生成分镜数据，请稍候
                  </div>
                </div>
              ) : selectedChapter.sections.length > 0 ? (
                <div className="storyboard-content">
                  {/* 处理结果概览 */}
                  <div className="result-overview">
                    <div className="overview-item">
                      <strong>处理ID:</strong> {selectedChapter.processId || '未知'}
                    </div>
                    <div className="overview-item">
                      <strong>场景数量:</strong> {selectedChapter.scenesCount || selectedChapter.sections.length}
                    </div>
                  </div>

                  {/* 角色设定 */}
                  <div className="consistency-section">
                    <h5>角色设定</h5>
                    <div className="consistency-list">
                      {Object.keys(localCharacters).length > 0 ? (
                        Object.entries(localCharacters).map(([name, desc]) => (
                          <div key={name} className="consistency-item editable">
                            <input 
                              type="text" 
                              value={name}
                              placeholder="角色名称"
                              className="character-name-input"
                              onChange={(e) => updateCharacterName(name, e.target.value)}
                              onBlur={saveSettings}
                            />
                            <textarea 
                              value={desc}
                              placeholder="角色描述"
                              className="character-desc-textarea"
                              rows={2}
                              onChange={(e) => updateCharacterDesc(name, e.target.value)}
                              onBlur={saveSettings}
                            />
                            <button 
                              className="remove-item-btn"
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                console.log('点击删除按钮，角色名:', name)
                                removeCharacter(name)
                              }}
                              title="删除角色"
                            >
                              ×
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">暂无角色设定</div>
                      )}
                      <button className="add-item-btn" onClick={addCharacter}>+ 添加角色</button>
                    </div>
                  </div>

                  {/* 环境设定 */}
                  <div className="consistency-section">
                    <h5>环境设定</h5>
                    <div className="consistency-list">
                      {Object.keys(localEnvironments).length > 0 ? (
                        Object.entries(localEnvironments).map(([env, desc]) => (
                          <div key={env} className="consistency-item editable">
                            <input 
                              type="text" 
                              value={env}
                              placeholder="环境名称"
                              className="environment-name-input"
                              onChange={(e) => updateEnvironmentName(env, e.target.value)}
                              onBlur={saveSettings}
                            />
                            <textarea 
                              value={desc}
                              placeholder="环境描述"
                              className="environment-desc-textarea"
                              rows={2}
                              onChange={(e) => updateEnvironmentDesc(env, e.target.value)}
                              onBlur={saveSettings}
                            />
                            <button 
                              className="remove-item-btn"
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                console.log('点击删除按钮，环境名:', env)
                                removeEnvironment(env)
                              }}
                              title="删除环境"
                            >
                              ×
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state">暂无环境设定</div>
                      )}
                      <button className="add-item-btn" onClick={addEnvironment}>+ 添加环境</button>
                    </div>
                  </div>

                  {/* 分镜详情 */}
                  <div className="sections-list">
                    <div className="sections-header">
                      <h5>分镜详情</h5>
                      <span>共 {selectedChapter.sections.length} 个分镜</span>
                    </div>
                    <ul>
                      {selectedChapter.sections.map((s, index) => (
                        <li key={s.id} className="section-item">
                          <div className="section-header">
                            <span className="section-number">{index + 1}</span>
                            <input 
                              defaultValue={s.title} 
                              placeholder={`分镜 ${index + 1}`}
                              className="section-title"
                            />
                          </div>
                          <div className="section-content">
                            {s.detail && (
                              <div className="section-detail">
                                <label>详细描述：</label>
                                <textarea 
                                  defaultValue={s.detail}
                                  placeholder="分镜详细描述"
                                  className="section-textarea"
                                  rows={3}
                                />
                              </div>
                            )}
                            {s.dialogue && (
                              <div className="section-dialogue">
                                <label>对话内容：</label>
                                <textarea 
                                  defaultValue={s.dialogue}
                                  placeholder="角色对话"
                                  className="section-textarea"
                                  rows={2}
                                />
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="no-sections">
                  <p>暂无分镜数据</p>
                  <p className="hint">请点击"识别分镜"按钮生成分镜设定</p>
                </div>
              )}
            </div>
          ) : (
            <div className="empty">请选择章节以查看分镜数据</div>
          )}
        </div>
      </section>

      {/* 右：漫画生成输出区（点击外部收回抽屉） */}
      <section className="panel output-panel fade-in" onClick={() => drawerOpen && setDrawerOpen(false)}>
        <header>
          <h3>漫画生成输出区</h3>
          <div className="actions">
            <button 
                onClick={generateComics}
                disabled={!selectedChapter || comicGeneration.status === 'generating' || comicGeneration.status === 'connecting'}
                className={comicGeneration.status === 'generating' || comicGeneration.status === 'connecting' ? 'loading' : ''}
              >
                {comicGeneration.status === 'connecting' && '连接中...'}
                {comicGeneration.status === 'generating' && '生成中...'}
                {(comicGeneration.status === 'idle' || comicGeneration.status === 'completed' || comicGeneration.status === 'error') && '生成漫画'}
              </button>
              {(comicGeneration.status === 'generating' || comicGeneration.status === 'connecting') && (
                <button className="cancel-btn" onClick={cancelGeneration}>取消生成</button>
              )}
            <button disabled={comicGeneration.images.length === 0} onClick={exportComics}>导出</button>
          </div>
        </header>
        <div className="output-body">
          {/* 状态显示区域 */}
          {comicGeneration.status === 'idle' && (
            <div className="status-display">
              <div className="status-icon">🎨</div>
              <h4>准备生成漫画</h4>
              <p>请确保已设置角色和环境，然后点击"生成漫画"按钮</p>
              {selectedChapter && (
                <div className="generation-info">
                  <p><strong>当前章节：</strong>{selectedChapter.title}</p>
                  <p><strong>角色设定：</strong>{Object.keys(localCharacters).length} 个</p>
                  <p><strong>环境设定：</strong>{Object.keys(localEnvironments).length} 个</p>
                </div>
              )}
            </div>
          )}

          {comicGeneration.status === 'connecting' && (
            <div className="status-display">
              <div className="status-icon loading">🔄</div>
              <h4>连接服务器中...</h4>
              <p>{comicGeneration.message || '正在建立连接'}</p>
            </div>
          )}

          {comicGeneration.status === 'generating' && (
            <div className="status-display">
              <div className="status-icon loading">⚡</div>
              <h4>正在生成漫画</h4>
              <p>{comicGeneration.message}</p>
<<<<<<< HEAD
              {comicGeneration.progress.total > 0 && (
                <div className="progress-container">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${comicGeneration.progress.percentage}%` }}
                    ></div>
                  </div>
                  <div className="progress-text">
                    {comicGeneration.progress.current} / {comicGeneration.progress.total} ({comicGeneration.progress.percentage}%)
                  </div>
                </div>
              )}
              {/* 显示已生成的图片 */}
              {comicGeneration.images.length > 0 && (
                <div className="preview-images">
                  <h5>已生成的图片：</h5>
=======
              
              {/* 增强的进度显示 */}
              {comicGeneration.progress.total > 0 && (
                <div className="progress-container enhanced">
                  <div className="progress-info">
                    <div className="progress-stats">
                      <span className="current-step">步骤 {comicGeneration.progress.current}</span>
                      <span className="total-steps">共 {comicGeneration.progress.total} 步</span>
                      <span className="percentage">{comicGeneration.progress.percentage}%</span>
                    </div>
                  </div>
                  
                  <div className="progress-bar enhanced">
                    <div 
                      className="progress-fill animated" 
                      style={{ width: `${comicGeneration.progress.percentage}%` }}
                    ></div>
                  </div>
                  
                  <div className="progress-details">
                    <div className="time-estimate">
                      <span>⏱️ 预计剩余时间: 计算中...</span>
                    </div>
                    <div className="generation-tips">
                      <p>💡 AI正在为您精心绘制每一帧画面</p>
                      <p>🎨 生成过程可能需要几分钟，请耐心等待</p>
                      <p>🔄 如果长时间无响应，可以点击"取消生成"后重试</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 显示已生成的图片 */}
              {comicGeneration.images.length > 0 && (
                <div className="preview-images">
                  <h5>已生成的图片 ({comicGeneration.images.length} 张)：</h5>
>>>>>>> 61fac845b79edacab33f62b90c5b7868d4e03ab4
                  <div className="image-grid">
                    {comicGeneration.images.map((image) => (
                      <div key={image.id} className="image-item">
                        <img src={image.url} alt={`场景 ${image.sceneIndex + 1}`} />
                        <div className="image-info">场景 {image.sceneIndex + 1}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {comicGeneration.status === 'completed' && (
            <div className="status-display">
              <div className="status-icon">✅</div>
              <h4>漫画生成完成</h4>
              <p>共生成 {comicGeneration.images.length} 张图片</p>
              <div className="image-grid completed">
                {comicGeneration.images.map((image) => (
                  <div key={image.id} className="image-item">
                    <img src={image.url} alt={`场景 ${image.sceneIndex + 1}`} />
                    <div className="image-info">
                      <div className="scene-number">场景 {image.sceneIndex + 1}</div>
                      {image.description && <div className="scene-desc">{image.description}</div>}
                    </div>
                    <div className="image-actions">
                      <button onClick={() => window.open(image.url, '_blank')}>查看大图</button>
                      <button onClick={async () => {
                        try {
                          const response = await fetch(image.url)
                          const blob = await response.blob()
                          const url = window.URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `scene-${image.sceneIndex + 1}.jpg`
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          window.URL.revokeObjectURL(url)
                        } catch (error) {
                          console.error('下载失败:', error)
                          alert('下载失败，请重试')
                        }
                      }}>下载</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {comicGeneration.status === 'error' && (
            <div className="status-display error">
              <div className="status-icon">❌</div>
              <h4>生成失败</h4>
              <p className="error-message">{comicGeneration.error}</p>
              <div className="error-actions">
                <button onClick={retryGeneration} className="retry-btn">重试</button>
                <button onClick={resetGeneration}>
                  重置
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {showAdd && (
        <AddNovelDialog
          onClose={() => setShowAdd(false)}
          onSubmit={async (n) => {
            await window.api.saveNovel(n as any)
            setNovels((prev) => [n, ...prev])
            setSelectedNovelId(n.id)
            setBrowseNovelId(n.id)
            setBrowseLevel('novel')
            setSelectedChapterId(n.chapters[0]?.id || null)
            setShowAdd(false)
          }}
        />
      )}

      {settingsForId && (
        <NovelSettingsDialog
          novel={novels.find(n => n.id === settingsForId)!}
          onClose={() => setSettingsForId(null)}
          onUpdate={(updated) => {
            setNovels(prev => prev.map(n => n.id === updated.id ? updated : n))
          }}
          onDelete={(id) => {
            setNovels(prev => prev.filter(n => n.id !== id))
            if (selectedNovelId === id) {
              setSelectedNovelId(null)
              setSelectedChapterId(null)
            }
          }}
        />
      )}
    </div>
  )
}

export default CreatePage