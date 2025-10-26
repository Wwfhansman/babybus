import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import '@renderer/styles/community.css'

// 简易数据结构（纯前端展示，不依赖后端）
type Artwork = { id: string; title: string; topic: string; author: string; likes: number; a: string; b: string }
const TOPICS = ['热榜', '风格合集', '科幻', '校园', '机甲', '童话', '冒险', '日常']
const AUTHORS = ['小白', '阿木', '星河', '橙子', '墨雨', '鲸落', '蓝莓', '栗子']
const ENTRY_ITEMS = [
  { key: 'friends', label: '好友', icon: (<svg viewBox="0 0 24 24"><path d="M7 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M17 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M12 20c0-2 2-4 5-4s4 2 4 4" /></svg>) },
  { key: 'messages', label: '消息', icon: (<svg viewBox="0 0 24 24"><path d="M4 5h16v12H7l-3 3V5z" /></svg>) },
  { key: 'likes', label: '我的点赞', icon: (<svg viewBox="0 0 24 24"><path d="M20.8 11c0 5.7-8.8 10-8.8 10S3.2 16.7 3.2 11C3.2 7.9 5.7 6 8 6c1.6 0 3 .8 4 2 1-1.2 2.4-2 4-2 2.3 0 4.8 1.9 4.8 5z" /></svg>) },
  { key: 'bookmarks', label: '收藏', icon: (<svg viewBox="0 0 24 24"><path d="M6 4h12v16l-6-4-6 4V4z" /></svg>) },
  { key: 'following', label: '关注', icon: (<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" /><path d="M19 8v6" /><path d="M22 11h-6" /><path d="M5 20a7 7 0 0 1 7-6 7 7 0 0 1 7 6H5z" /></svg>) },
  { key: 'notifications', label: '通知', icon: (<svg viewBox="0 0 24 24"><path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2Z" /><path d="M18 16V11a6 6 0 1 0-12 0v5l-2 2h16l-2-2z" /></svg>) }
]

function grad(a: string, b: string) {
  return `linear-gradient(135deg, ${a}, ${b})`
}
function makeArtworks(): Artwork[] {
  const colors = [
    ['#6b8cff', '#9ab6ff'], ['#ff7ab2', '#ffd3e8'], ['#ffb86b', '#ffe1b3'], ['#57d0b3', '#aef2e3'],
    ['#8f7afc', '#c9baff'], ['#6be1ff', '#b8f2ff'], ['#ffa66b', '#ffd6b3'], ['#69e5a9', '#c8f6df']
  ]
  const list: Artwork[] = []
  for (let i = 0; i < 24; i++) {
    const t = TOPICS[2 + (i % (TOPICS.length - 2))] // 从“科幻”开始分配话题
    const c = colors[i % colors.length]
    list.push({ id: `a-${i+1}`, title: `作品 ${i+1}`, topic: t, author: AUTHORS[i % AUTHORS.length], likes: 20 + (i * 3) % 200, a: c[0], b: c[1] })
  }
  return list
}

// 入场动效：交叉观察器
function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ob = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.classList.add('in-view') })
    ob.observe(el)
    return () => ob.disconnect()
  }, [])
  return ref
}

const CommunityPage: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [topic, setTopic] = useState<string>('热榜')
  const [liked, setLiked] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<Artwork | null>(null)
  const artworks = useMemo(() => makeArtworks(), [])

  useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t) }, [])

  const filtered = useMemo(() => {
    if (topic === '热榜') return [...artworks].sort((a,b) => b.likes - a.likes).slice(0, 18)
    if (topic === '风格合集') return artworks.slice(0, 18)
    return artworks.filter(a => a.topic === topic).slice(0, 18)
  }, [topic, artworks])

  const heroRef = useInView<HTMLDivElement>()
  const gridRef = useInView<HTMLDivElement>()
  const creatorsRef = useInView<HTMLDivElement>()
  const activityRef = useInView<HTMLDivElement>()

  return (
    <div className="community">
      {/* 英雄区 */}
      <section ref={heroRef} className="section hero">
        <div className="hero-text">
          <h1>社区 · 精选灵感</h1>
          <p>探索创作灵感，结识优秀作者</p>
          <div className="hero-actions">
            <Link to="/create" className="btn-primary">去创作</Link>
          </div>
        </div>
        <div className="hero-visual">
          <div className="blob" />
          <div className="hero-slogan" aria-label="社区标语">
            <div className="line-cn">文字跃然次元，AI 绘就万象。</div>
            <div className="line-en">Words leap across dimensions, AI paints all visions.</div>
          </div>
        </div>
      </section>

      {/* 话题 chips */}
      <div className="chips">
        {TOPICS.map(t => (
          <button key={t} className={`chip ${topic === t ? 'active' : ''}`} onClick={() => setTopic(t)}>{t}</button>
        ))}
      </div>

      {/* 顶部快捷图标 */}
      <div className="quick-actions" aria-label="快捷功能">
        {ENTRY_ITEMS.map(item => (
          <button
            key={item.key}
            className="action-btn"
            title={item.label}
            onClick={() => alert(`仅前端展示：${item.label}`)}
          >
            <span className="icon" aria-hidden>{item.icon}</span>
          </button>
        ))}
      </div>

      {/* 精选作品网格 */}
      <section ref={gridRef} className="section grid">
        {loading ? (
          Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="card skeleton">
              <div className="cover" />
              <div className="meta"><div className="title" /><div className="sub" /></div>
            </div>
          ))
        ) : (
          filtered.map(a => (
            <div key={a.id} className="card" onClick={() => setPreview(a)}>
              <div className="cover" style={{ backgroundImage: grad(a.a, a.b) }} />
              <div className="meta">
                <div className="title">{a.title}</div>
                <div className="sub">{a.author} · {a.topic}</div>
              </div>
              <button className={`like ${liked[a.id] ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); setLiked(prev => ({ ...prev, [a.id]: !prev[a.id] })) }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill={liked[a.id] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.8 11c0 5.7-8.8 10-8.8 10S3.2 16.7 3.2 11C3.2 7.9 5.7 6 8 6c1.6 0 3 .8 4 2 1-1.2 2.4-2 4-2 2.3 0 4.8 1.9 4.8 5z"/></svg>
                <span>{a.likes + (liked[a.id] ? 1 : 0)}</span>
              </button>
            </div>
          ))
        )}
      </section>

      {/* 推荐创作者（静态） */}
      <section ref={creatorsRef} className="section creators">
        <h3>推荐创作者</h3>
        <div className="creator-grid">
          {AUTHORS.slice(0, 6).map((name, i) => (
            <div key={i} className="creator-card">
              <div className="avatar" aria-hidden>{name.slice(0,1)}</div>
              <div className="info">
                <div className="name">{name}</div>
                <div className="bio">擅长{['科幻','童话','校园','机甲','奇幻','日常'][i % 6]}</div>
              </div>
              <button className="follow">关注</button>
            </div>
          ))}
        </div>
      </section>

      {/* 活动公告 */}
      <section ref={activityRef} className="section activity">
        <div className="card-cta">
          <h3>社区活动 · 本周主题：科幻冒险</h3>
          <p>投稿你的最佳科幻场景分镜，精选将展示在首页</p>
          <div className="cta">
            <Link to="/create" className="btn-secondary">参与活动</Link>
            <button className="btn-ghost" onClick={() => alert('仅前端展示：活动规则弹窗')}>查看规则</button>
          </div>
        </div>
      </section>

      {/* 预览弹层 */}
      {preview && (
        <div className="preview-overlay" onClick={() => setPreview(null)}>
          <div className="preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="preview-cover" style={{ backgroundImage: grad(preview.a, preview.b) }} />
            <div className="preview-meta">
              <h4>{preview.title}</h4>
              <p>{preview.author} · {preview.topic}</p>
              <div className="actions">
                <button className="btn-primary" onClick={() => setPreview(null)}>关闭</button>
              </div>
            </div>
            <button className="preview-close" onClick={() => setPreview(null)} aria-label="关闭">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CommunityPage