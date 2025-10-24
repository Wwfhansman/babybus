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
  const { user, sessionToken, logout } = useAuth()
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ processId: string; images: { id: string; url: string }[] } | null>(null)

  // 预览图缓存，减少重复请求
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({})

  // 新增：筛选与分页
  const [filterText, setFilterText] = useState('')
  const [limit] = useState(20)
  const [isMoreLoading, setIsMoreLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

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

  const viewDetail = async (processId: string) => {
    try {
      setLoading(true)
      const resp: any = await (window as any).api.invokeBackend('history/detail', { processId }, sessionToken)
      if (!resp?.ok) throw new Error('获取历史详情失败')
      const record = resp?.data?.history
      const source: any[] = Array.isArray(record?.comic_results) ? record.comic_results : []

      const mapped = source.map((item: any, idx: number) => ({
        id: `img-${idx + 1}`,
        rawUrl: sanitizeUrl(item?.image_url || item?.url || item?.imageUrl || '')
      }))

      const proxied = await Promise.all(mapped.map(async m => ({ id: m.id, url: await proxyImage(m.rawUrl) })))
      setSelected({ processId, images: proxied })
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
          <span className="sub">欢迎，{user?.username || user?.id || '游客'}</span>
        </div>
        <div className="profile-actions">
          <button className="danger" onClick={handleLogout}>退出登录</button>
        </div>
      </header>

      <section className="profile-info card">
        <div className="card-header"><h3>账户信息</h3></div>
        {user ? (
          <div className="card-body">
            <div className="info-row"><span>ID：</span><strong>{user.id}</strong></div>
            {user.username && <div className="info-row"><span>用户名：</span><strong>{user.username}</strong></div>}
            {user.email && <div className="info-row"><span>邮箱：</span><strong>{user.email}</strong></div>}
          </div>
        ) : (
          <div className="card-body"><p>未登录或无法获取用户信息</p></div>
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
                  <img src={previewCache[h.process_id] || sanitizeUrl(h.preview_image || '')} alt="预览" referrerPolicy="no-referrer" />
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
              {selected.images.map(img => (
                <img key={img.id} src={img.url} alt="" referrerPolicy="no-referrer" />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export default ProfilePage