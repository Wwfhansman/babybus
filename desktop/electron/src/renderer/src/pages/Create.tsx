import React, { useMemo, useState } from 'react'

// 简易数据结构与占位数据
export type Section = { id: string; title: string }
// 将章节类型扩展为包含正文内容
export type Chapter = { id: string; title: string; sections: Section[]; content?: string }
export type Novel = { id: string; title: string; chapters: Chapter[] }

const sampleNovels: Novel[] = [
  {
    id: 'novel-1',
    title: '斗罗大陆',
    chapters: [
      { id: 'n1-c1', title: '第一章 XXXX', content: '这里是章节内容示例 A\n\n（占位正文）', sections: [{ id: 'n1-c1-s1', title: '片段 A' }] },
      { id: 'n1-c2', title: '第二章 XXXX', content: '这里是章节内容示例 B\n\n（占位正文）', sections: [{ id: 'n1-c2-s1', title: '片段 B' }] }
    ]
  },
  {
    id: 'novel-2',
    title: '斗破苍穹',
    chapters: [
      { id: 'n2-c1', title: '第一章 XXXX', content: '这里是章节内容示例 C\n\n（占位正文）', sections: [{ id: 'n2-c1-s1', title: '片段 A' }] }
    ]
  }
]

// 章节拆分占位（包含正文）
function splitChaptersFromText(text: string): Chapter[] {
  const lines = text.split(/\r?\n/)
  const chapters: Chapter[] = []
  let current: Chapter | null = null
  let buf: string[] = []
  const chapterRegex = /^第.{1,9}[章节卷回].*/
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    const isNew = chapterRegex.test(trimmed) || i === 0
    if (isNew) {
      if (current) {
        current.content = buf.join('\n').trim()
        chapters.push(current)
      }
      current = { id: 'ch-' + (chapters.length + 1), title: trimmed || `章节 ${chapters.length + 1}`, sections: [] }
      buf = []
    } else if (current) {
      buf.push(line)
      const secId = `s-${current.sections.length + 1}`
      if (trimmed) current.sections.push({ id: secId, title: trimmed.slice(0, 24) })
    }
  })
  if (current) {
    (current as Chapter).content = buf.join('\n').trim()
    chapters.push(current)
  }
  return chapters.length ? chapters : [{ id: 'ch-1', title: '第一章', content: text.slice(0, 800), sections: [{ id: 's-1', title: '片段 1' }] }]
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
      // 占位：调用后端解析接口（preload->main->backend）
      try {
        await window.api.invokeBackend('novel/parse', { text: content })
      } catch {}
      const chapters = splitChaptersFromText(content)
      onSubmit({ id: 'novel-' + Date.now(), title: file.name.replace(/\.txt$/i, ''), chapters })
      onClose()
    }
    reader.readAsText(file, 'utf-8')
  }

  const submitText = async () => {
    // 占位：调用后端解析接口
    try {
      await window.api.invokeBackend('novel/parse', { text })
    } catch {}
    const chapters = splitChaptersFromText(text)
    onSubmit({ id: 'novel-' + Date.now(), title: '新小说（单章节）', chapters })
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

const CreatePage: React.FC = () => {
  const [novels, setNovels] = useState<Novel[]>(sampleNovels)
  const [selectedNovelId, setSelectedNovelId] = useState<string | null>(novels[0]?.id || null)
  const selectedNovel = useMemo(() => novels.find((n) => n.id === selectedNovelId) || null, [novels, selectedNovelId])
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(selectedNovel?.chapters[0]?.id || null)
  const selectedChapter = useMemo(() => selectedNovel?.chapters.find((c) => c.id === selectedChapterId) || null, [selectedNovel, selectedChapterId])
  const [showAdd, setShowAdd] = useState(false)
  // 分级显示：当前展开的小说（仅展开一个）
  const [openNovelId, setOpenNovelId] = useState<string | null>(selectedNovelId)
  // 抽屉展开保持状态（点击把手展开，外部点击收回）
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 新增：分级浏览与分页状态
  const [browseLevel, setBrowseLevel] = useState<'home' | 'novel'>('home')
  const [browseNovelId, setBrowseNovelId] = useState<string | null>(null)
  const [chapterPageIdx, setChapterPageIdx] = useState(0)
  const PER_PAGE = 50
  const browseNovel = useMemo(() => novels.find(n => n.id === browseNovelId) || null, [novels, browseNovelId])
  // 识别分镜加载态
  const [recognizing, setRecognizing] = useState(false)

  // 本地回退：简单将正文按句号/换行拆分为镜头标题
  function splitIntoShots(text: string): Section[] {
    const parts = text.split(/[。！？!?\n]+/).map(s => s.trim()).filter(Boolean)
    const limited = parts.slice(0, 12)
    return limited.length ? limited.map((t, i) => ({ id: `s-${i+1}`, title: t.slice(0, 24) || `镜头 ${i+1}` })) : [{ id: 's-1', title: '镜头 1' }]
  }

  async function recognizeStoryboard() {
    if (!selectedChapter || !selectedNovelId) return
    const text = selectedChapter.content || ''
    if (!text) return
    setRecognizing(true)
    try {
      const res: any = await window.api.invokeBackend('storyboard/recognize', { chapterId: selectedChapter.id, text })
      const sections: Section[] | null = Array.isArray(res?.sections)
        ? res.sections.map((item: any, idx: number) => ({ id: `s-${idx+1}`, title: typeof item === 'string' ? item : (item?.title || `镜头 ${idx+1}`) }))
        : null
      const finalSections = sections && sections.length ? sections : splitIntoShots(text)
      setNovels(prev => prev.map(n => n.id === selectedNovelId ? ({
        ...n,
        chapters: n.chapters.map(ch => ch.id === selectedChapter.id ? ({ ...ch, sections: finalSections }) : ch)
      }) : n))
    } catch (e) {
      const fallback = splitIntoShots(text)
      setNovels(prev => prev.map(n => n.id === selectedNovelId ? ({
        ...n,
        chapters: n.chapters.map(ch => ch.id === selectedChapter.id ? ({ ...ch, sections: fallback }) : ch)
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
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="novel-chapters">
              <div className="page-tabs">
                {Array.from({ length: Math.max(1, Math.ceil((browseNovel?.chapters.length || 0) / PER_PAGE)) }).map((_, i) => {
                  const start = i * PER_PAGE + 1
                  const end = Math.min((i + 1) * PER_PAGE, browseNovel?.chapters.length || 0)
                  return (
                    <button
                      key={i}
                      className={i === chapterPageIdx ? 'active' : ''}
                      onClick={() => setChapterPageIdx(i)}
                    >
                      {start}-{end}
                    </button>
                  )
                })}
              </div>
              <ul className="chapters">
                {(browseNovel?.chapters || []).slice(chapterPageIdx * PER_PAGE, chapterPageIdx * PER_PAGE + PER_PAGE).map((ch) => (
                  <li
                    key={ch.id}
                    className={selectedChapterId === ch.id ? 'active' : ''}
                    onClick={() => {
                      setSelectedNovelId(browseNovel?.id || null)
                      setSelectedChapterId(ch.id)
                      setDrawerOpen(false) // 退出小说选择模块
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
                    <input defaultValue={s.title} />
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
            <button disabled>生成漫画</button>
            <button disabled>导出</button>
          </div>
        </header>
        <div className="output-body">
          <div className="pages">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="page-skeleton">第 {i} 页预览（占位）</div>
            ))}
          </div>
          <p className="tip">后端完成后将展示生成的页面缩略图与进度。</p>
        </div>
      </section>

      {showAdd && (
        <AddNovelDialog
          onClose={() => setShowAdd(false)}
          onSubmit={(n) => setNovels((prev) => [n, ...prev])}
        />
      )}
    </div>
  )
}

export default CreatePage