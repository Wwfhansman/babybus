import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@renderer/contexts/AuthContext'

// 简单的URL清洗（去除首尾引号与空格）
function sanitizeUrl(u: any) {
  try {
    if (typeof u !== 'string') return ''
    let s = u.trim()
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1)
    }
    return s
  } catch {
    return ''
  }
}

// 格式化日期
function formatDateTime(s: string | number | Date | null | undefined) {
  try {
    if (!s) return ''
    const d = new Date(s)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${dd} ${hh}:${mm}`
  } catch {
    return ''
  }
}

// 代理远程图片为 data:URL，避免CORS
async function proxyImage(url: string): Promise<string> {
  try {
    const resp: any = await (window as any).api.invokeBackend('image/proxy', { url })
    if (resp?.ok && resp?.data?.dataUrl) return resp.data.dataUrl
    return url
  } catch {
    return url
  }
}

const ProfilePage: React.FC = () => {
  const { user, sessionToken, logout, verifySession } = useAuth()
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ processId: string; title?: string; description?: string; characters?: Record<string, string>; environments?: Record<string, string>; images: { id: string; url: string; sceneIndex?: number; description?: string }[] } | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  
  // 预览图缓存，减少重复请求
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({})

  // 新增：筛选与分页
  const [filterText, setFilterText] = useState('')
  const [limit] = useState(20)
  const [isMoreLoading, setIsMoreLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // 头像相关状态与配置
  const BACKEND_URL = 'http://139.224.101.91:5000'
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false)
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const canLoad = useMemo(() => !!sessionToken, [sessionToken])

  // 拉取历史列表（重载）
  const fetchHistory = async () => {
    if (!canLoad) return
    setLoading(true)
    setError(null)
    try {
      const resp: any = await (window as any).api.invokeBackend('history/list', { limit, offset: 0 }, sessionToken)
      if (!resp?.ok) throw new Error('获取历史列表失败')
      const list = Array.isArray(resp?.data?.history) ? resp.data.history : []

      // 预处理预览图代理
      const nextCache: Record<string, string> = { ...previewCache }
      for (const item of list) {
        const raw = sanitizeUrl(item?.preview_image || '')
        const key = item?.process_id || item?.id
        if (raw && key && !nextCache[key]) {
          nextCache[key] = await proxyImage(raw)
        }
      }
      setPreviewCache(nextCache)
      setHistory(list)
      setHasMore(list.length >= limit)
    } catch (e) {
      console.error('获取历史列表失败:', e)
      setError('获取历史列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoad])

  // 加载用户头像为 data:URL，优先使用后端 URL，失败回退到本地默认
  useEffect(() => {
    const loadAvatar = async () => {
      if (!user) { setAvatarDataUrl(null); return }
      setAvatarLoading(true)
      setAvatarError(null)
      try {
        const remoteUrl = user.avatar ? `${BACKEND_URL}${user.avatar}` : `${BACKEND_URL}/api/avatar/default.png`
        const resp: any = await (window as any).api.invokeBackend('image/proxy', { url: remoteUrl })
        if (resp?.ok && resp?.data?.dataUrl) {
          setAvatarDataUrl(resp.data.dataUrl)
        } else {
          const fallbackPath = 'c:\\Users\\Kris\\Desktop\\babybus\\backend\\avatars\\default.png'
          const d = await (window as any).api.loadImageDataUrl(fallbackPath)
          setAvatarDataUrl(d || null)
        }
      } catch (e) {
        console.error('加载头像失败:', e)
        setAvatarError('头像加载失败')
      } finally {
        setAvatarLoading(false)
      }
    }
    loadAvatar()
  }, [user?.avatar])

  const viewDetail = async (processId: string) => {
    try {
      setLoading(true)
      const resp: any = await (window as any).api.invokeBackend('history/detail', { processId }, sessionToken)
      if (!resp?.ok) throw new Error('获取历史详情失败')
      const record = resp?.data?.history
      const source: any[] = Array.isArray(record?.comic_results) ? record.comic_results : []
      const scenesDetail: string[] = Array.isArray(record?.llm_result?.scenes_detail) ? record.llm_result.scenes_detail : []
      const characters: Record<string, string> = record?.llm_result?.character_consistency || {}
      const environments: Record<string, string> = record?.llm_result?.environment_consistency || {}

      const mapped = source.map((item: any, idx: number) => ({
        id: `img-${idx + 1}`,
        rawUrl: sanitizeUrl(item?.image_url || item?.url || item?.imageUrl || ''),
        sceneIndex: (item?.scene_index ?? idx + 1),
        description: scenesDetail[idx] || ''
      }))

      const proxied = await Promise.all(mapped.map(async m => {
        try {
          const p: any = await (window as any).api.invokeBackend('image/proxy', { url: m.rawUrl })
          const url = p?.ok && p?.data?.dataUrl ? p.data.dataUrl : m.rawUrl
          return { id: m.id, url, sceneIndex: m.sceneIndex, description: m.description }
        } catch (e) {
          console.error('代理图片失败，回退为原始URL:', e)
          return { id: m.id, url: m.rawUrl, sceneIndex: m.sceneIndex, description: m.description }
        }
      }))
      setSelected({ processId, title: record?.title, description: record?.description, characters, environments, images: proxied })
      setViewerIndex(null)
    } catch (e) {
      console.error('获取历史详情失败:', e)
      setError('获取历史详情失败')
    } finally {
      setLoading(false)
    }
  }

  // 加载更多
  const loadMore = async () => {
    if (!canLoad || isMoreLoading || !hasMore) return
    setIsMoreLoading(true)
    try {
      const offset = history.length
      const resp: any = await (window as any).api.invokeBackend('history/list', { limit, offset }, sessionToken)
      if (!resp?.ok) throw new Error('获取更多历史失败')
      const list = Array.isArray(resp?.data?.history) ? resp.data.history : []

      const nextCache: Record<string, string> = { ...previewCache }
      for (const item of list) {
        const raw = sanitizeUrl(item?.preview_image || '')
        const key = item?.process_id || item?.id
        if (raw && key && !nextCache[key]) {
          nextCache[key] = await proxyImage(raw)
        }
      }
      setPreviewCache(nextCache)
      setHistory((prev) => [...prev, ...list])
      setHasMore(list.length >= limit)
    } catch (e) {
      console.error('获取更多历史失败:', e)
    } finally {
      setIsMoreLoading(false)
    }
  }

  // 删除历史
  const deleteHistory = async (historyId: string | number) => {
    if (!sessionToken) return
    const ok = window.confirm('确定删除这条历史记录吗？此操作不可恢复。')
    if (!ok) return
    try {
      const resp: any = await (window as any).api.invokeBackend('history/delete', { historyId }, sessionToken)
      if (!resp?.ok) throw new Error('删除失败')
      setHistory((prev) => prev.filter((h: any) => h.id !== historyId))
      setSelected((prev) => (prev && prev.processId === String(historyId) ? null : prev))
    } catch (e) {
      console.error('删除历史失败:', e)
      alert('删除失败，请稍后重试')
    }
  }

  // 导出选中记录的图片到ZIP
  const exportSelectedZip = async () => {
    if (!selected || !selected.images.length) {
      alert('无可导出的图片')
      return
    }

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
      for (let i = 0; i < selected.images.length; i++) {
        const image = selected.images[i]
        let blob: Blob | null = null
        let ext = 'jpg'
        if (image.url.startsWith('data:')) {
          blob = dataUrlToBlob(image.url)
          const header = image.url.slice(0, image.url.indexOf(','))
          const mime = header.substring(header.indexOf(':') + 1, header.indexOf(';'))
          ext = mimeToExt(mime)
        } else {
          // 回退：尝试fetch（可能受CORS限制）
          const response = await fetch(image.url)
          blob = await response.blob()
          ext = mimeToExt(blob.type)
        }
        zip.file(`image-${i + 1}.${ext}`, blob!)
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const url = window.URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `history-${selected.processId}-${new Date().toISOString().slice(0,10)}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      alert('导出成功！')
    } catch (e) {
      console.error('导出失败:', e)
      alert('导出失败，请重试')
    }
  }

  const handleLogout = async () => {
    await logout()
    // 退出后 AuthGuard 会显示登录界面
  }

  // 头像查看与上传交互
  const openAvatarViewer = () => setAvatarViewerOpen(true)
  const closeAvatarViewer = () => { setAvatarViewerOpen(false); setSelectedAvatarFile(null) }
  const handleAvatarSelect: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0] || null
    setSelectedAvatarFile(file)
  }
  const uploadAvatar = async () => {
    if (!selectedAvatarFile) {
      alert('请选择要上传的图片文件')
      return
    }
    if (!sessionToken) {
      alert('请先登录后再上传头像')
      return
    }
    setUploadingAvatar(true)
    try {
      const fd = new FormData()
      fd.append('avatar', selectedAvatarFile)
      const resp = await fetch(`${BACKEND_URL}/api/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        },
        body: fd
      })
      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data?.error || '上传失败')
      }
      // 上传成功后刷新用户信息与头像
      await verifySession?.()
      const remoteUrl = data?.avatar_url ? `${BACKEND_URL}${data.avatar_url}` : `${BACKEND_URL}/api/avatar/default.png`
      const p: any = await (window as any).api.invokeBackend('image/proxy', { url: remoteUrl })
      let durl: string | null = null
      if (p?.ok && p?.data?.dataUrl) {
        durl = p.data.dataUrl
      } else {
        durl = await (window as any).api.loadImageDataUrl('c:\\Users\\Kris\\Desktop\\babybus\\backend\\avatars\\default.png')
      }
      setAvatarDataUrl(durl || null)
      alert('头像上传成功')
      setSelectedAvatarFile(null)
    } catch (e) {
      console.error('上传头像失败:', e)
      alert(e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploadingAvatar(false)
    }
  }

  // 过滤后的展示列表
  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    if (!q) return history
    return history.filter((h: any) => {
      const title = String(h?.title || '').toLowerCase()
      const desc = String(h?.description || '').toLowerCase()
      const pid = String(h?.process_id || '').toLowerCase()
      return title.includes(q) || desc.includes(q) || pid.includes(q)
    })
  }, [filterText, history])

  return (
    <div className="profile-page">
      <header className="profile-header">
        <div className="header-left">
          <h2>个人中心</h2>
        </div>
        <div className="profile-actions">
          <button className="danger" onClick={handleLogout}>退出登录</button>
        </div>
      </header>

      <section className="profile-summary">
         {user ? (
           <div className="summary-body">
             <div className="summary-left">
               <div className="avatar-large" onClick={openAvatarViewer} title="点击查看大图并上传">
                 {avatarLoading ? (
                   <div className="avatar-skeleton" />
                 ) : avatarDataUrl ? (
                   <img src={avatarDataUrl} alt="用户头像" />
                 ) : (
                   <div className="avatar-default">默认头像</div>
                 )}
               </div>
             </div>
             <div className="summary-right">
               <div className="user-title">{user.username || `用户 ${user.id}`}</div>
               <div className="user-meta">
                 <span>用户ID：{user.id}</span>
                 {user.email && <span>邮箱：{user.email}</span>}
               </div>
              <div className="user-stats">
                <div className="stat-item">
                  <div className="value">1,284</div>
                  <div className="label">获赞</div>
                </div>
                <div className="stat-item">
                  <div className="value">56</div>
                  <div className="label">关注</div>
                </div>
                <div className="stat-item">
                  <div className="value">340</div>
                  <div className="label">粉丝</div>
                </div>
                <div className="stat-item">
                  <div className="value">12</div>
                  <div className="label">作品</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card-body"><p>未登录或无法获取用户信息</p></div>
        )}
 
         {avatarViewerOpen && (
           <div className="image-viewer" onClick={(e) => { if (e.target === e.currentTarget) closeAvatarViewer() }}>
             <div className="viewer-card small">
               <div className="viewer-image">
                 {avatarDataUrl ? (
                   <img src={avatarDataUrl} alt="用户头像" />
                 ) : (
                   <div className="avatar-skeleton" style={{ height: 240 }} />
                 )}
               </div>
               <div className="viewer-meta">
                 <h4>头像</h4>
                 <div className="viewer-actions">
                   <input type="file" accept="image/*" onChange={handleAvatarSelect} />
                   <button className="primary" disabled={!selectedAvatarFile || uploadingAvatar} onClick={uploadAvatar}>
                     {uploadingAvatar ? '上传中...' : '上传新头像'}
                   </button>
                   <button onClick={closeAvatarViewer}>关闭</button>
                 </div>
               </div>
               <button className="viewer-close" onClick={closeAvatarViewer} aria-label="关闭">✕</button>
             </div>
           </div>
         )}
       </section>

      <section className="profile-history">
        <div className="section-header">
          <h3>历史记录</h3>
          <div className="history-controls">
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="搜索标题/描述/进程ID"
            />
            <button onClick={fetchHistory}>刷新</button>
          </div>
        </div>
        {!canLoad && <p>请登录后查看历史记录</p>}
        {error && <p className="error">{error}</p>}
        {loading && <p>加载中...</p>}

        {filtered.length === 0 && !loading ? (
          <div className="empty">暂无历史记录</div>
        ) : (
          <div className="history-list">
            {filtered.map((h: any) => (
              <div key={h.id || h.process_id} className="history-item">
                <div className="preview" onClick={() => viewDetail(h.process_id)} title={`查看详情 ${h.process_id}`}>
                  {previewCache[h.process_id] ? (
                    <img src={previewCache[h.process_id]} alt="预览" referrerPolicy="no-referrer" />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '12px', color: 'var(--text-2)' }}>
                      加载中...
                    </div>
                  )}
                </div>
                <div className="history-meta">
                  <div className="meta-left">
                    <div className="history-title">{h.title || '未命名'}</div>
                    <div className="history-subtitle">{formatDateTime(h.created_at)} · PID {h.process_id}</div>
                  </div>
                  <div className="meta-right">
                    <span className="history-chip">{h.total_scenes ?? 0} 镜头</span>
                    <button className="danger small" onClick={() => deleteHistory(h.id)}>删除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {hasMore && (
          <div className="load-more">
            <button disabled={isMoreLoading} onClick={loadMore}>{isMoreLoading ? '加载中...' : '加载更多'}</button>
          </div>
        )}
      </section>

      {selected && (
        <section className="profile-history-detail card">
          <div className="card-header">
            <h3>详情 - {selected.processId}</h3>
            <div className="actions">
              <button className="primary" onClick={exportSelectedZip}>导出ZIP</button>
              <button className="danger" onClick={() => deleteHistory(selected!.processId)}>删除此记录</button>
              <button onClick={() => setSelected(null)}>关闭</button>
            </div>
          </div>
          <div className="card-body">
            <div className="image-grid completed">
              {selected.images.map((img, idx) => (
                <img key={img.id} src={img.url} alt={img.description || ''} referrerPolicy="no-referrer" onClick={() => setViewerIndex(idx)} />
              ))}
            </div>
          </div>
        </section>
      )}
      {selected && viewerIndex !== null && (
        <div className="image-viewer" onClick={(e) => { if (e.target === e.currentTarget) setViewerIndex(null) }}>
          <div className="viewer-card">
            <div className="viewer-image">
              <img src={selected.images[viewerIndex].url} alt={selected.images[viewerIndex].description || ''} referrerPolicy="no-referrer" />
            </div>
            <div className="viewer-meta">
              <h4>场景 {selected.images[viewerIndex].sceneIndex ?? viewerIndex + 1}</h4>
              {selected.images[viewerIndex].description ? (
                <p className="viewer-desc">{selected.images[viewerIndex].description}</p>
              ) : (
                <p className="viewer-desc muted">暂无场景介绍</p>
              )}
              {selected.characters && Object.keys(selected.characters).length > 0 && (
                <div className="viewer-subsection">
                  <h5>人物设定</h5>
                  <ul className="viewer-list">
                    {Object.entries(selected.characters).slice(0, 4).map(([name, desc]) => (
                      <li key={name}><strong>{name}：</strong><span>{desc}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {selected.environments && Object.keys(selected.environments).length > 0 && (
                <div className="viewer-subsection">
                  <h5>环境设定</h5>
                  <ul className="viewer-list">
                    {Object.entries(selected.environments).slice(0, 4).map(([env, desc]) => (
                      <li key={env}><strong>{env}：</strong><span>{desc}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="viewer-actions">
                <button onClick={() => setViewerIndex(null)}>关闭</button>
              </div>
            </div>
            <button className="viewer-close" onClick={() => setViewerIndex(null)} aria-label="关闭">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProfilePage