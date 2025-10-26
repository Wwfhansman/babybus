import React, { useMemo, useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from '@renderer/contexts/AuthContext'
import ComicLongImage from '@renderer/components/ComicLongImage'

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

const AddNovelDialog: React.FC<{ onClose(): void; onSubmit(n: Novel): void; sessionToken?: string | null }> = ({ onClose, onSubmit, sessionToken }) => {
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
      // 移除：导入阶段不触发后端文本解析，避免自动填充分镜
      const chapters = splitChaptersFromText(content)
      const novel: Novel = { id: 'novel-' + Date.now(), title: file.name.replace(/\.txt$/i, ''), chapters }
      onSubmit(novel)
      onClose()
    }
    reader.readAsText(file, 'utf-8')
  }

  const submitText = async () => {
    // 移除：文本提交阶段不触发后端文本解析，避免自动填充分镜
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
                    {c.imagePath ? (<img src={(c.imagePath.startsWith('file://') ? c.imagePath : ('file://' + c.imagePath))} alt={c.name} />) : (<div className="placeholder">无图</div>)}
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
  const { sessionToken } = useAuth()
  const [novels, setNovels] = useState<Novel[]>([])
  const [selectedNovelId, setSelectedNovelId] = useState<string | null>(null)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  // 保持最新选择的引用，避免事件监听闭包使用旧值
  const selectedNovelIdRef = useRef<string | null>(null)
  const selectedChapterIdRef = useRef<string | null>(null)
  useEffect(() => { selectedNovelIdRef.current = selectedNovelId }, [selectedNovelId])
  useEffect(() => { selectedChapterIdRef.current = selectedChapterId }, [selectedChapterId])
  // 切换章节时重置识别状态并清理绑定引用，避免后台事件导致误填充或误显示
  useEffect(() => {
    setRecognizeRequested(false)
    setRecognizing(false)
    requestedNovelIdRef.current = null
    requestedChapterIdRef.current = null
  }, [selectedChapterId])
  const selectedNovel = useMemo(() => novels.find((n) => n.id === selectedNovelId) || null, [novels, selectedNovelId])
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
  const [recognizeRequested, setRecognizeRequested] = useState(false)
  const recognizeRequestedRef = useRef(false)
  useEffect(() => { recognizeRequestedRef.current = recognizeRequested }, [recognizeRequested])
  const requestedNovelIdRef = useRef<string | null>(null)
  const requestedChapterIdRef = useRef<string | null>(null)
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
  const [longImageDataUrl, setLongImageDataUrl] = useState<string | null>(null)
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
    if (!sessionToken) return

    console.log('初始化WebSocket连接...')
    
    // 创建WebSocket连接
    const socket = io('http://139.224.101.91:5000', {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true,
      reconnection: false
    })

    socketRef.current = socket

    // 连接成功
    socket.on('connect', () => {
      console.log('WebSocket连接成功，发送认证请求...')
      // 连接成功后发送认证请求
      socket.emit('authenticate', { session_token: sessionToken })
    })

    // 监听认证结果
    socket.on('authentication_result', (data) => {
      console.log('收到认证结果:', data)
      if (data.success) {
        console.log('认证成功！')
      } else {
        console.error('认证失败:', data.error)
      }
    })

    // 连接错误
    socket.on('connect_error', (error) => {
      console.error('WebSocket连接错误:', error)
    })

    // 移除：局部定义的 sanitizeUrl，改为使用模块级函数
    // 监听漫画生成完成事件
    socket.on('comics_generation_complete', async (data) => {
      console.log('收到comics_generation_complete事件:', data)
      const source: any[] = Array.isArray(data?.comic_results) ? data.comic_results : (Array.isArray(data?.images) ? data.images : [])
      const mapped = source.map((item: any, idx: number) => {
        const raw = sanitizeUrl(item?.image_url || item?.url || item?.imageUrl || '')
        return { id: `img-${idx + 1}`, rawUrl: raw, sceneIndex: (item?.scene_index ?? idx + 1) }
      })
    
      // 主进程代理图片为 dataURL，绕开CORS与画布污染
      const proxied = await Promise.all(mapped.map(async (m) => {
        try {
          const p: any = await (window as any).api.invokeBackend('image/proxy', { url: m.rawUrl })
          const url = p?.ok && p?.data?.dataUrl ? p.data.dataUrl : m.rawUrl
          return { id: m.id, url, sceneIndex: m.sceneIndex }
        } catch (e) {
          console.error('代理图片失败，回退为原始URL:', e)
          return { id: m.id, url: m.rawUrl, sceneIndex: m.sceneIndex }
        }
      }))
    
      console.log('映射后的图片URL列表(前5项):', proxied.slice(0, 5).map(i => i.url))
      setComicGeneration(prev => ({
        ...prev,
        status: 'completed',
        images: proxied,
        message: '漫画生成完成！'
      }))
    })

    // 新增：监听完整流程完成事件
    socket.on('full_process_complete', async (data) => {
      console.log('收到full_process_complete事件:', data)
      const source: any[] = Array.isArray(data?.comic_results) ? data.comic_results : []
      const mapped = source.map((item: any, idx: number) => {
        const raw = sanitizeUrl(item?.image_url || item?.url || item?.imageUrl || '')
        return { id: `img-${idx + 1}`, rawUrl: raw, sceneIndex: (item?.scene_index ?? idx + 1) }
      })
    
      const proxied = await Promise.all(mapped.map(async (m) => {
        try {
          const p: any = await (window as any).api.invokeBackend('image/proxy', { url: m.rawUrl })
          const url = p?.ok && p?.data?.dataUrl ? p.data.dataUrl : m.rawUrl
          return { id: m.id, url, sceneIndex: m.sceneIndex }
        } catch (e) {
          console.error('代理图片失败，回退为原始URL:', e)
          return { id: m.id, url: m.rawUrl, sceneIndex: m.sceneIndex }
        }
      }))
    
      console.log('映射后的图片URL列表(前5项):', proxied.slice(0, 5).map(i => i.url))
    
      setComicGeneration(prev => ({
        ...prev,
        status: 'completed',
        images: proxied,
        progress: {
          current: data.total_scenes || proxied.length || 0,
          total: data.total_scenes || proxied.length || 0,
          percentage: 100
        },
        message: data.message || '漫画生成完成！'
      }))
    })

    // 监听生成进度
    socket.on('full_process_progress', (data) => {
      console.log('收到进度更新:', data)
      // 前端不展示进度条，仅保持“加载中”提示，不更新百分比
      setComicGeneration(prev => ({
        ...prev,
        status: 'generating',
        message: '加载中...'
      }))
    })

    // 新增：监听完整流程状态（用于在文本阶段显示处理中）
    socket.on('full_process_status', (data) => {
      const step = Number(data.step || 0)
      console.log('完整流程状态事件', { step, data, recognizeRequested: recognizeRequestedRef.current, requestedNovelId: requestedNovelIdRef.current, requestedChapterId: requestedChapterIdRef.current })
      if (!recognizeRequestedRef.current) {
        console.warn('忽略完整流程状态（未点击生成分镜）')
        return
      }
      if (step >= 1 && step <= 3) {
        setRecognizing(true)
      }
    })

    socket.on('full_process_complete', (data) => {
      console.log('收到full_process_complete事件:', data)
      const images = (data.comic_results || []).map((item: any, idx: number) => ({
        id: `img-${idx + 1}`,
        url: item?.image_url || item?.url || item?.imageUrl || '',
        sceneIndex: (item?.scene_index ?? idx + 1)
      }))

      setComicGeneration(prev => ({
        ...prev,
        status: 'completed',
        images,
        progress: {
          current: data.total_scenes || images.length || 0,
          total: data.total_scenes || images.length || 0,
          percentage: 100
        },
        message: data.message || '漫画生成完成！'
      }))
    })

    // 新增：监听服务器返回的生成错误（找不到处理状态等）
    socket.on('generation_error', (data) => {
      console.error('收到generation_error事件:', data)
      setComicGeneration(prev => ({
        ...prev,
        status: 'error',
        error: data.error || '生成过程中发生错误'
      }))
    })

    // 新增：监听文本处理阶段事件（WebSocket识别分镜）
    socket.on('process_status', (data) => {
      console.log('文本处理状态事件', { data, recognizeRequested: recognizeRequestedRef.current, requestedNovelId: requestedNovelIdRef.current, requestedChapterId: requestedChapterIdRef.current })
      if (!recognizeRequestedRef.current) {
        console.warn('忽略后台文本处理状态（未点击生成分镜）')
        return
      }
      setRecognizing(true)
    })

    socket.on('process_error', (data) => {
      console.error('文本处理错误:', data)
      if (!recognizeRequestedRef.current) {
        console.warn('忽略后台文本处理错误（未点击生成分镜）')
        return
      }
      setRecognizing(false)
      setRecognizeRequested(false)
      // 清理本次识别绑定的目标
      requestedNovelIdRef.current = null
      requestedChapterIdRef.current = null
      alert(data.error || '文本处理失败，请稍后重试')
    })

    socket.on('text_processing_complete', (data) => {
      console.log('收到text_processing_complete事件:', data)
      setRecognizing(false)
      if (!recognizeRequestedRef.current) {
        console.warn('忽略后台文本处理结果（未点击识别/生成分镜）')
        return
      }
      const sectionsDetail = Array.isArray((data as any).scenes_detail)
        ? (data as any).scenes_detail.map((desc: any, idx: number) => ({
            id: `s-${idx + 1}`,
            title: typeof desc === 'string' ? (desc.slice(0, 24) || `镜头 ${idx + 1}`) : `镜头 ${idx + 1}`,
            detail: typeof desc === 'string' ? desc : JSON.stringify(desc),
            description: typeof desc === 'string' ? desc : JSON.stringify(desc)
          }))
        : null
      
      const sectionsPreview = (data.scenes_preview || []).map((s: any, idx: number) => ({
        id: `s-${idx + 1}`,
        title: s?.description ? (s.description.slice(0, 24) || `镜头 ${idx + 1}`) : `镜头 ${idx + 1}`,
        detail: s?.description || '',
        description: s?.description || ''
      }))
      
      const sections = sectionsDetail || sectionsPreview
      
      // 仅当存在明确绑定的识别目标（由“生成分镜”设置）时才更新
      const novelId = requestedNovelIdRef.current
      const chapterId = requestedChapterIdRef.current
      if (!novelId || !chapterId) {
        console.warn('未绑定识别目标，忽略文本处理结果更新（需用户点击“生成分镜”）')
        setRecognizeRequested(false)
        setRecognizing(false)
        return
      }
      console.log('将文本处理结果应用到绑定章节', { novelId, chapterId, sectionsCount: (sections || []).length })
      
      setNovels(prev => prev.map(n => n.id === novelId ? ({
        ...n,
        chapters: n.chapters.map(ch => ch.id === chapterId ? ({
          ...ch,
          sections,
          processId: data.process_id,
          scenesCount: data.scenes_count,
          characterConsistency: data.character_consistency || {},
          environmentConsistency: data.environment_consistency || {}
        }) : ch)
      }) : n))
      setRecognizeRequested(false)
      // 清理本次识别绑定的目标
      requestedNovelIdRef.current = null
      requestedChapterIdRef.current = null
    })

    // 新增：监听完整流程文本处理完成事件（full_process_text_complete）
    socket.on('full_process_text_complete', (data) => {
      console.log('收到full_process_text_complete事件:', data)
      setRecognizing(false)
      if (!recognizeRequestedRef.current) {
        console.warn('忽略后台完整流程文本结果（未点击识别/生成分镜）')
        return
      }
      const sections = (data.scenes_detail || []).map((desc: any, idx: number) => ({
        id: `s-${idx + 1}`,
        title: typeof desc === 'string' ? (desc.slice(0, 24) || `镜头 ${idx + 1}`) : `镜头 ${idx + 1}`,
        detail: typeof desc === 'string' ? desc : JSON.stringify(desc),
        description: typeof desc === 'string' ? desc : JSON.stringify(desc)
      }))
      // 仅当存在明确绑定的识别目标（由“生成分镜”设置）时才更新
      const novelId = requestedNovelIdRef.current
      const chapterId = requestedChapterIdRef.current
      if (!novelId || !chapterId) {
        console.warn('未绑定识别目标，忽略完整流程文本结果更新（需用户点击“生成分镜”）')
        setRecognizeRequested(false)
        setRecognizing(false)
        return
      }
      console.log('将完整流程文本结果应用到绑定章节', { novelId, chapterId, sectionsCount: (data.scenes_detail || []).length })
      setNovels(prev => prev.map(n => n.id === novelId ? ({
        ...n,
        chapters: n.chapters.map(ch => ch.id === chapterId ? ({
          ...ch,
          sections,
          processId: data.process_id,
          scenesCount: (data.scenes_detail || []).length,
          characterConsistency: data.character_consistency || {},
          environmentConsistency: data.environment_consistency || {}
        }) : ch)
      }) : n))
      setRecognizeRequested(false)
      // 清理本次识别绑定的目标
      requestedNovelIdRef.current = null
      requestedChapterIdRef.current = null
    })

    // 监听错误事件
    socket.on('full_process_error', (data) => {
      console.error('收到错误事件:', data)
      
      setComicGeneration(prev => ({
        ...prev,
        status: 'error',
        error: data.error || '生成过程中发生错误'
      }))
    })

    return () => {
      console.log('清理WebSocket连接')
      socket.disconnect()
    }
  }, [sessionToken])

  // 导出漫画功能
  const exportComics = async () => {
    if (comicGeneration.images.length === 0) {
      alert('没有可导出的图片')
      return
    }
  
    // 将 data:URL 转为 Blob
    const dataUrlToBlob = (dataUrl: string) => {
      try {
        const [header, base64] = dataUrl.split(',')
        const mime = header.substring(header.indexOf(':') + 1, header.indexOf(';'))
        const binary = atob(base64)
        const len = binary.length
        const bytes = new Uint8Array(len)
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
        return new Blob([bytes], { type: mime })
      } catch (e) {
        console.error('解析 data:URL 失败', e)
        return new Blob([])
      }
    }
  
    const mimeToExt = (mime: string) => {
      if (!mime) return 'bin'
      if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
      if (mime.includes('png')) return 'png'
      if (mime.includes('webp')) return 'webp'
      return 'bin'
    }
  
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
  
      for (let i = 0; i < comicGeneration.images.length; i++) {
        const image = comicGeneration.images[i]
        try {
          let blob: Blob | null = null
          let ext = 'jpg'
  
          if (image.url.startsWith('data:')) {
            // 直接处理 data:URL
            blob = dataUrlToBlob(image.url)
            const header = image.url.slice(0, image.url.indexOf(','))
            const mime = header.substring(header.indexOf(':') + 1, header.indexOf(';'))
            ext = mimeToExt(mime)
          } else {
            // 使用主进程代理，避免 CORS，获取 data:URL
            const resp: any = await (window as any).api.invokeBackend('image/proxy', { url: image.url })
            if (resp?.ok && resp?.data?.dataUrl) {
              const dataUrl = resp.data.dataUrl as string
              blob = dataUrlToBlob(dataUrl)
              const header = dataUrl.slice(0, dataUrl.indexOf(','))
              const mime = header.substring(header.indexOf(':') + 1, header.indexOf(';'))
              ext = mimeToExt(mime)
            } else {
              // 兜底：直接 fetch（可能受 CORS 限制）
              const response = await fetch(image.url)
              blob = await response.blob()
              ext = mimeToExt(blob.type)
            }
          }
  
          zip.file(`scene-${image.sceneIndex + 1}.${ext}`, blob!)
        } catch (error) {
          console.error(`下载图片 ${i + 1} 失败:`, error)
        }
      }
  
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

  // 导出合成的长图为 PNG
  const exportLongImage = async () => {
    if (!longImageDataUrl) {
      alert('长图尚未生成')
      return
    }
    try {
      const a = document.createElement('a')
      a.href = longImageDataUrl
      a.download = `${selectedChapter?.title || '漫画长图'}-${new Date().toISOString().slice(0, 10)}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      console.error('导出长图失败:', e)
      alert('导出长图失败，请重试')
    }
  }

  // 使用历史记录作为测试数据：读取最新一条并代理图片
  const loadHistoryTestData = async () => {
    try {
      if (!sessionToken) {
        alert('请先登录后再加载历史测试数据')
        return
      }
      setComicGeneration(prev => ({ ...prev, status: 'connecting', message: '正在加载历史测试数据...' }))
      const listResp: any = await (window as any).api.invokeBackend('history/list', { limit: 1, offset: 0 }, sessionToken)
      if (!listResp?.ok) {
        console.error('获取历史列表失败:', listResp)
        alert('获取历史列表失败')
        setComicGeneration(prev => ({ ...prev, status: 'error', error: '获取历史列表失败' }))
        return
      }
      const first = listResp?.data?.history?.[0]
      if (!first?.process_id) {
        alert('没有可用的历史记录')
        setComicGeneration(prev => ({ ...prev, status: 'idle', message: undefined }))
        return
      }
      const detailResp: any = await (window as any).api.invokeBackend('history/detail', { processId: first.process_id }, sessionToken)
      if (!detailResp?.ok) {
        console.error('获取历史详情失败:', detailResp)
        alert('获取历史详情失败')
        setComicGeneration(prev => ({ ...prev, status: 'error', error: '获取历史详情失败' }))
        return
      }
      const record = detailResp?.data?.history
      const source: any[] = Array.isArray(record?.comic_results) ? record.comic_results : []
  
      const mapped = source.map((item: any, idx: number) => {
        const raw = sanitizeUrl(item?.image_url || item?.url || item?.imageUrl || '')
        return { id: `img-${idx + 1}`, rawUrl: raw, sceneIndex: (item?.scene_index ?? idx + 1) }
      })
  
      // 主进程代理图片为 dataURL，绕开CORS
      const proxied = await Promise.all(mapped.map(async (m) => {
        try {
          const p: any = await (window as any).api.invokeBackend('image/proxy', { url: m.rawUrl })
          const url = p?.ok && p?.data?.dataUrl ? p.data.dataUrl : m.rawUrl
          return { id: m.id, url, sceneIndex: m.sceneIndex }
        } catch (e) {
          console.error('代理图片失败，回退为原始URL:', e)
          return { id: m.id, url: m.rawUrl, sceneIndex: m.sceneIndex }
        }
      }))
  
      setComicGeneration(prev => ({
        ...prev,
        status: 'completed',
        images: proxied,
        message: '已加载历史测试数据'
      }))
    } catch (e) {
      console.error('加载历史测试数据异常:', e)
      setComicGeneration(prev => ({ ...prev, status: 'error', error: '加载历史测试数据异常' }))
    }
  }

  // 简单的漫画生成函数
  const generateComics = () => {
    console.log('点击了生成漫画按钮')
    
    if (!selectedChapter) {
      alert('请先选择章节')
      return
    }
    
    if (!selectedChapter.processId) {
      alert('该章节尚未进行分镜识别，请先完成分镜识别')
      return
    }
    
    console.log('准备生成漫画，章节:', selectedChapter.title)
    console.log('processId:', selectedChapter.processId)
    
    // 检查WebSocket连接
    if (!socketRef.current) {
      console.log('WebSocket未初始化')
      alert('WebSocket连接未建立')
      return
    }
    
    if (!socketRef.current.connected) {
      console.log('WebSocket未连接')
      alert('WebSocket连接断开，请刷新页面重试')
      return
    }
    
    console.log('WebSocket连接正常，发送生成请求...')
    
    // 设置生成状态（仅显示加载中，不显示进度）
    setComicGeneration(prev => ({
      ...prev,
      status: 'generating',
      progress: { current: 0, total: 0, percentage: 0 },
      images: [],
      error: undefined,
      message: '加载中...'
    }))
    setLongImageDataUrl(null)
    
    // 发送生成请求
    socketRef.current.emit('start_comics_generation', { 
      process_id: selectedChapter.processId 
    })
    
    console.log('已发送start_comics_generation事件')
  }

  // 初始化：从本地读取小说列表
  useEffect(() => {
    (async () => {
      try {
        const list = await window.api.listNovels()
        try {
          console.log('listNovels 加载结果（章节分镜计数）:', (list || []).map((n: any) => ({
            id: n?.id, title: n?.title,
            chapters: (n?.chapters || []).map((ch: any) => ({ id: ch?.id, title: ch?.title, sectionsCount: (ch?.sections || []).length }))
          })))
        } catch {}
        setNovels(list as unknown as Novel[])
      } catch {}
    })()
  }, [])

  // 开发测试：若没有生成结果，自动加载历史记录图片作为数据源
  const historyLoadedRef = useRef(false)
  useEffect(() => {
    // 停止自动加载历史记录，改为仅使用当次生成的图片
    // historyLoadedRef.current = true
  }, [comicGeneration.status, comicGeneration.images])

  async function recognizeStoryboard() {
    if (!selectedChapter || !selectedNovelId) return
    const text = selectedChapter.content || ''
    if (!text) return
    
    // 绑定本次识别的目标小说与章节
    requestedNovelIdRef.current = selectedNovelId
    requestedChapterIdRef.current = selectedChapterId
    console.log('识别绑定目标', { novelId: requestedNovelIdRef.current, chapterId: requestedChapterIdRef.current })

    setRecognizeRequested(true)
    setRecognizing(true)
    try {
      console.log('开始识别分镜，通过WebSocket发送文本到后端...')
      console.log('发送的文本内容:', text.substring(0, 100) + '...')
      
      if (!socketRef.current || !socketRef.current.connected) {
        console.warn('WebSocket未连接，无法识别分镜')
        alert('WebSocket连接未建立或已断开，请刷新页面重试')
        setRecognizing(false)
        setRecognizeRequested(false)
        return
      }
      
      // 通过WebSocket触发文本处理
      socketRef.current.emit('process_novel', { 
        novel_text: text 
      })
    } catch (e) {
      console.error('识别分镜时发生错误:', e)
      setRecognizing(false)
      setRecognizeRequested(false)
    }
  }

  // 新增：完整流程触发（返回完整 scenes_detail）
  async function fullProcessStoryboard() {
    if (!selectedChapter || !selectedNovelId) return
    const text = selectedChapter.content || ''
    if (!text) return

    // 绑定本次识别的目标小说与章节（完整流程）
    requestedNovelIdRef.current = selectedNovelId
    requestedChapterIdRef.current = selectedChapterId
    console.log('完整流程绑定目标', { novelId: requestedNovelIdRef.current, chapterId: requestedChapterIdRef.current })

    setRecognizeRequested(true)
    setRecognizing(true)
    try {
      console.log('开始完整流程，通过WebSocket发送文本到后端...')
      console.log('发送的文本内容:', text.substring(0, 100) + '...')

      if (!socketRef.current || !socketRef.current.connected) {
        console.warn('WebSocket未连接，无法启动完整流程')
        alert('WebSocket连接未建立或已断开，请刷新页面重试')
        setRecognizing(false)
        setRecognizeRequested(false)
        return
      }

      socketRef.current.emit('full_process', {
        novel_text: text,
        title: browseNovel?.title || selectedChapter.title || '',
        description: ''
      })
    } catch (e) {
      console.error('完整流程启动失败:', e)
      setRecognizing(false)
      setRecognizeRequested(false)
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
            <button className="primary" disabled={!selectedChapter?.content || recognizing} onClick={fullProcessStoryboard}>
              生成分镜
            </button>
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
                    <span>正在生成分镜...</span>
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
                  <p className="hint">请点击"生成分镜"按钮生成分镜设定</p>
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
            <button disabled={comicGeneration.images.length === 0} onClick={exportComics}>导出</button>
            <button disabled={!longImageDataUrl} onClick={exportLongImage}>导出长图</button>
            {/* 移除历史测试按钮，新增清空输出 */}
            <button onClick={() => {
              setComicGeneration(prev => ({
                ...prev,
                status: 'idle',
                images: [],
                error: undefined,
                message: undefined,
                progress: { current: 0, total: 0, percentage: 0 }
              }))
              setLongImageDataUrl(null)
            }}>清空输出</button>
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
              <div className="status-icon loading">🔄</div>
              <h4>加载中...</h4>
              <p>{comicGeneration.message || '正在生成，请稍候'}</p>
              {/* 移除进度条与时间估算，仅保留转圈提示 */}
            </div>
          )}



          {comicGeneration.status === 'completed' && (
            <div className="long-image-wrapper">
              <ComicLongImage
                images={comicGeneration.images}
                fillParent
                panelWidthRatio={0.96}
                panelAspect={1.6}
                skew={32}
                bottomSkew={32}
                gap={6}
                borderWidth={1}
                borderColor="#000000"
                backgroundColor="#ffffff"
                onReady={(dataUrl) => setLongImageDataUrl(dataUrl)}
              />
            </div>
          )}

          {comicGeneration.status === 'error' && (
            <div className="status-display error">
              <div className="status-icon">❌</div>
              <h4>生成失败</h4>
              <p className="error-message">{comicGeneration.error}</p>
              <div className="error-actions">
                <button onClick={generateComics} className="retry-btn">重试</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {showAdd && (
        <AddNovelDialog
          sessionToken={sessionToken}
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
// 将URL清理函数提升为模块级，供全文件复用
function sanitizeUrl(u: any) {
  try {
    const s = String(u ?? '').trim()
    // 去掉包裹的引号或多余空格
    return s.replace(/^"|"$/g, '').replace(/^'|'$/g, '')
  } catch {
    return ''
  }
}