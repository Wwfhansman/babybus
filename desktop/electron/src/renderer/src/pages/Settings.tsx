import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import '../styles/settings.css'

type Theme = 'light' | 'dark'
type Lang = 'zh-CN' | 'en'
type UiDensity = 'comfortable' | 'compact'

interface AppSettings {
  theme: Theme
  language: Lang
  reduceMotion: boolean
  uiDensity: UiDensity
  defaultExportFormat: 'png' | 'jpeg'
  imageQuality: number // 40-100
  longImagePadding: number // 0-32
  notifyOnComplete: boolean
  notifyOnError: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: (localStorage.getItem('theme') as Theme) || 'dark',
  language: (localStorage.getItem('lang') as Lang) || 'zh-CN',
  reduceMotion: false,
  uiDensity: 'comfortable',
  defaultExportFormat: 'png',
  imageQuality: 80,
  longImagePadding: 8,
  notifyOnComplete: true,
  notifyOnError: true
}

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const raw = localStorage.getItem('appSettings')
      if (raw) {
        const parsed = JSON.parse(raw)
        return { ...DEFAULT_SETTINGS, ...parsed }
      }
    } catch {}
    return DEFAULT_SETTINGS
  })

  const [savedHint, setSavedHint] = useState<string | null>(null)
  const hintTimerRef = useRef<number | null>(null)

  // 分页
  const PAGES = [
    { key: 'appearance' as const, label: '外观' },
    { key: 'export' as const, label: '导出' },
    { key: 'notifications' as const, label: '通知' },
    { key: 'data' as const, label: '数据与安全' }
  ]
  type PageKey = typeof PAGES[number]['key']
  const [page, setPage] = useState<PageKey>('appearance')
  const goPrev = () => {
    const i = PAGES.findIndex(p => p.key === page)
    if (i > 0) setPage(PAGES[i - 1].key)
  }
  const goNext = () => {
    const i = PAGES.findIndex(p => p.key === page)
    if (i < PAGES.length - 1) setPage(PAGES[i + 1].key)
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
    localStorage.setItem('theme', settings.theme)
  }, [])

  const saveSettings = (next: AppSettings) => {
    localStorage.setItem('appSettings', JSON.stringify(next))
    // 同步独立键，便于其他模块读取
    localStorage.setItem('theme', next.theme)
    localStorage.setItem('lang', next.language)
    document.documentElement.setAttribute('data-theme', next.theme)
    // 轻量保存提示
    setSavedHint('已保存')
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current)
    hintTimerRef.current = window.setTimeout(() => setSavedHint(null), 1200)
  }

  const update = (patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS)
    saveSettings(DEFAULT_SETTINGS)
  }

  const exportSettings = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'app-settings.json'
    a.click()
    URL.revokeObjectURL(url)
    setSavedHint('已导出')
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current)
    hintTimerRef.current = window.setTimeout(() => setSavedHint(null), 1200)
  }

  const importSettings = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const next = { ...DEFAULT_SETTINGS, ...parsed }
      setSettings(next)
      saveSettings(next)
      setSavedHint('已导入')
    } catch {
      setSavedHint('导入失败')
    } finally {
      if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current)
      hintTimerRef.current = window.setTimeout(() => setSavedHint(null), 1200)
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1>设置</h1>
        <p>配置外观、导出、通知与数据偏好。</p>
        {savedHint && <span className="save-hint" aria-live="polite">{savedHint}</span>}
      </header>

      <div className="settings-tabs" role="tablist" aria-label="设置分页">
        {PAGES.map(p => (
          <button
            key={p.key}
            className={`settings-tab ${page === p.key ? 'active' : ''}`}
            onClick={() => setPage(p.key)}
            role="tab"
            aria-selected={page === p.key}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="settings-body">
        {page === 'appearance' && (
          <section className="settings-section">
            <h2 className="section-title">外观</h2>
            <div className="form-row">
              <label htmlFor="theme">主题模式</label>
              <div className="controls">
                <select id="theme" value={settings.theme} onChange={(e) => update({ theme: e.target.value as Theme })}>
                  <option value="dark">深色</option>
                  <option value="light">浅色</option>
                </select>
                <small>与侧边栏切换保持同步，影响整体配色与对比度。</small>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="reduceMotion">减少动效</label>
              <div className="controls">
                <input id="reduceMotion" type="checkbox" checked={settings.reduceMotion} onChange={(e) => update({ reduceMotion: e.target.checked })} />
                <small>减少较大的过渡与动画，降低视觉刺激与资源消耗。</small>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="uiDensity">界面密度</label>
              <div className="controls">
                <select id="uiDensity" value={settings.uiDensity} onChange={(e) => update({ uiDensity: e.target.value as UiDensity })}>
                  <option value="comfortable">舒适</option>
                  <option value="compact">紧凑</option>
                </select>
                <small>影响控件间距与列表密度（后续版本在全局样式中联动）。</small>
              </div>
            </div>
          </section>
        )}

        {page === 'export' && (
          <section className="settings-section">
            <h2 className="section-title">导出</h2>
            <div className="form-row">
              <label htmlFor="defaultExportFormat">默认导出格式</label>
              <div className="controls">
                <select id="defaultExportFormat" value={settings.defaultExportFormat} onChange={(e) => update({ defaultExportFormat: e.target.value as 'png' | 'jpeg' })}>
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                </select>
                <small>长图导出默认格式，PNG 清晰、JPEG 体积小。</small>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="imageQuality">图片质量</label>
              <div className="controls">
                <input id="imageQuality" type="range" min={40} max={100} step={5} value={settings.imageQuality} onChange={(e) => update({ imageQuality: parseInt(e.target.value, 10) })} />
                <small>影响预览合成质量与体积，建议 70–90。</small>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="longImagePadding">长图内边距</label>
              <div className="controls">
                <input id="longImagePadding" type="range" min={0} max={32} step={2} value={settings.longImagePadding} onChange={(e) => update({ longImagePadding: parseInt(e.target.value, 10) })} />
                <small>长图边缘与内容间距，便于社交平台展示。</small>
              </div>
            </div>
          </section>
        )}

        {page === 'notifications' && (
          <section className="settings-section">
            <h2 className="section-title">通知</h2>
            <div className="form-row">
              <label htmlFor="notifyOnComplete">生成完成提醒</label>
              <div className="controls">
                <input id="notifyOnComplete" type="checkbox" checked={settings.notifyOnComplete} onChange={(e) => update({ notifyOnComplete: e.target.checked })} />
                <small>当漫画生成完成时显示提醒。</small>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="notifyOnError">错误提示</label>
              <div className="controls">
                <input id="notifyOnError" type="checkbox" checked={settings.notifyOnError} onChange={(e) => update({ notifyOnError: e.target.checked })} />
                <small>处理失败时弹出提示，便于定位问题。</small>
              </div>
            </div>
          </section>
        )}

        {page === 'data' && (
          <section className="settings-section">
            <h2 className="section-title">数据与安全</h2>
            <div className="form-row">
              <label>重置设置</label>
              <div className="controls">
                <button onClick={resetSettings}>恢复默认</button>
                <small>仅重置本页设置项，不影响登录状态与积分。</small>
              </div>
            </div>
            <div className="form-row">
              <label>导出设置</label>
              <div className="controls">
                <button onClick={exportSettings}>导出为 JSON</button>
                <small>下载当前偏好为 JSON 文件。</small>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="importFile">导入设置</label>
              <div className="controls">
                <input id="importFile" type="file" accept="application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) importSettings(f) }} />
                <small>选择已导出的 JSON 文件以恢复设置。</small>
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="pager">
        <button onClick={goPrev} disabled={page === PAGES[0].key}>上一页</button>
        <span className="pager-indicator">{PAGES.findIndex(p => p.key === page) + 1} / {PAGES.length}</span>
        <button onClick={goNext} disabled={page === PAGES[PAGES.length - 1].key}>下一页</button>
      </div>
    </div>
  )
}

export default SettingsPage