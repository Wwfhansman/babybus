import React, { useMemo, useState, useEffect } from 'react'

// 简易数据结构与占位数据
export type Section = { id: string; title: string }
// 将章节类型扩展为包含正文内容
export type Chapter = { id: string; title: string; sections: Section[]; content?: string; processId?: string }
export type Character = { name: string; imagePath?: string }
export type Novel = { id: string; title: string; chapters: Chapter[]; characters?: Character[] }

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
    const body = ch.content || ''
    const parts = body.split(/[。！？!?,，\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 12)
    ch.sections = parts.map((t, i) => ({ id: `s-${i + 1}`, title: t.slice(0, 24) || `镜头 ${i + 1}` }))
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
                    {previewUrls[idx] ? (<img src={previewUrls[idx]} alt={c.name} />) : (<div className="placeholder">无图</div>)}
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
  const [generating, setGenerating] = useState(false)
  const [settingsForId, setSettingsForId] = useState<string | null>(null)
  // 记录每个章节的后端处理ID（用于后续生成漫画）
  const [processIdsByChapter, setProcessIdsByChapter] = useState<Record<string, string>>({})
  // 存储每个章节生成的漫画结果（后续用于展示图片）
  const [comicResultsByChapter, setComicResultsByChapter] = useState<Record<string, any[]>>({})

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
      const resp: any = await window.api.invokeBackend('storyboard/recognize', { chapterId: selectedChapter.id, text })
      const ok = !!resp && (resp.ok ?? true)
      const data = resp?.data ?? resp
      const pid = data?.process_id
      if (pid) {
        setProcessIdsByChapter((prev) => ({ ...prev, [selectedChapter.id]: String(pid) }))
      }
      // 纯识别模式：不处理漫画结果
      // 从后端 llm_result 中提取分镜标题
      const llm = data?.llm_result || {}
      const scenes = Array.isArray(llm?.scenes_detail) ? llm.scenes_detail : (Array.isArray(llm?.scenes) ? llm.scenes : [])
      const toTitle = (item: any, idx: number) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') return (item.title || item.desc || item.description || `镜头 ${idx+1}`)
        return `镜头 ${idx+1}`
      }
      const sections: Section[] | null = Array.isArray(scenes) && scenes.length
        ? scenes.map((item: any, idx: number) => ({ id: `s-${idx+1}`, title: String(toTitle(item, idx)).slice(0, 24) || `镜头 ${idx+1}` }))
        : null
      const finalSections = sections && sections.length
        ? sections
        : text.split(/[。！？!?,，\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 12).map((t, i) => ({ id: `s-${i+1}`, title: t.slice(0, 24) || `镜头 ${i+1}` }))
      setNovels(prev => prev.map(n => n.id === selectedNovelId ? ({
        ...n,
        chapters: n.chapters.map(ch => ch.id === selectedChapter.id ? ({ ...ch, sections: finalSections, processId: pid || ch.processId }) : ch)
      }) : n))
    } catch (e) {
      const fallback = text.split(/[。！？!?,，\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 12).map((t, i) => ({ id: `s-${i+1}`, title: t.slice(0, 24) || `镜头 ${i+1}` }))
      setNovels(prev => prev.map(n => n.id === selectedNovelId ? ({
        ...n,
        chapters: n.chapters.map(ch => ch.id === selectedChapter.id ? ({ ...ch, sections: fallback }) : ch)
      }) : n))
    } finally {
      setRecognizing(false)
    }
  }

  async function generateComics() {
    if (!selectedChapter || !selectedNovelId) return
    const sections = selectedChapter.sections || []
    if (!sections.length) return
    setGenerating(true)
    try {
      const titles = sections.map((s) => s.title)
      const json_data = { scenes_detail: titles }
      const payload: any = { json_data }
      const pid = selectedChapter.processId || processIdsByChapter[selectedChapter.id]
      if (pid) payload.process_id = pid
      const resp: any = await (window as any).api.invokeBackend('api/generate-comics', payload)
      const data = resp?.data ?? resp
      const results = Array.isArray(data?.comic_results) ? data.comic_results : (Array.isArray(data?.results) ? data.results : [])
      setComicResultsByChapter((prev) => ({ ...prev, [selectedChapter.id]: results }))
    } catch (e) {
      console.error('生成漫画失败', e)
    } finally {
      setGenerating(false)
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
              {recognizing ? '识别中…' : '识别分镜'}
            </button>
            {!selectedChapter?.content ? (
              <span className="tip">请先从左侧选择章节后再识别</span>
            ) : null}
          </div>
        </div>
      </section>

      {/* 中：设定编辑区（点击外部收回抽屉） */}
      <section className="panel settings-panel fade-in" onClick={() => drawerOpen && setDrawerOpen(false)}>
        <header>
          <h3>设定编辑区</h3>
          <div className="actions">
            <button>保存设定</button>
          </div>
        </header>
        <div className="settings-body">
          {selectedChapter ? (
            <div className="storyboard">
              <h4>分镜（占位） - {selectedChapter.title}</h4>
              <ul>
                {selectedChapter.sections.map((s) => (
                  <li key={s.id}>
                    <input value={s.title} onChange={(e) => {
                      const v = e.target.value
                      setNovels((prev) => prev.map((n) => n.id === selectedNovelId ? ({
                        ...n,
                        chapters: n.chapters.map((ch) => ch.id === selectedChapter.id ? ({
                          ...ch,
                          sections: ch.sections.map((sec) => sec.id === s.id ? ({ ...sec, title: v }) : sec)
                        }) : ch)
                      }) : n))
                    }} />
                  </li>
                ))}
              </ul>
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
            <button className="primary" disabled={!selectedChapter?.sections?.length || generating} onClick={generateComics}>{generating ? '生成中…' : '生成漫画'}</button>
            <button disabled>导出</button>
          </div>
        </header>
        <div className="output-body">
          <div className="pages">
            {(comicResultsByChapter[selectedChapterId || ''] || []).length ? (
              (comicResultsByChapter[selectedChapterId || ''] || []).map((item, i) => (
                <div key={i} className="page">
                  {item?.url ? (
                    <img src={item.url} alt={`场景 ${item?.scene_index || i + 1}`} />
                  ) : (
                    <div className="page-skeleton">场景 {item?.scene_index || i + 1}（图片生成后展示）</div>
                  )}
                  {item?.size ? <div className="meta">尺寸：{item.size}</div> : null}
                </div>
              ))
            ) : ([1, 2, 3, 4].map((i) => (
              <div key={i} className="page-skeleton">第 {i} 页预览（占位）</div>
            )))}
          </div>
          <p className="tip">后端完成后将展示生成的页面缩略图与进度。</p>
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