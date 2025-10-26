import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@renderer/contexts/AuthContext'
import appLogoUrl from '@renderer/assets/app-logo.png'

const NAVS = [
  {
    path: '/home',
    label: '主页',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 10.5l9-7 9 7V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" />
      </svg>
    )
  },
  {
    path: '/create',
    label: '创作',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 20h16M12 4l8 8-8 8-8-8 8-8Z" />
      </svg>
    )
  },
  {
    path: '/community',
    label: '社区',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 5h16v14H4zM8 9h8" />
      </svg>
    )
  },
  {
    path: '/profile',
    label: '个人中心',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm7 8H5a7 7 0 0 1 7-6 7 7 0 0 1 7 6Z" />
      </svg>
    )
  },
  {
    path: '/help',
    label: '帮助',
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 17h.01" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.9 2c-.9.7-1.4 1.2-1.4 2.1" />
      </svg>
    )
  }
]

const Sidebar: React.FC<{ activePath?: string }> = ({ activePath }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'dark')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  // 积分：默认1000，持久化到localStorage
  const [credits, setCredits] = useState<number>(() => {
    const saved = localStorage.getItem('userCredits')
    return saved ? parseInt(saved, 10) || 1000 : 1000
  })
  useEffect(() => {
    localStorage.setItem('userCredits', String(credits))
  }, [credits])

  // 充值浮层
  const [showCreditsModal, setShowCreditsModal] = useState(false)
  const [selectedRecharge, setSelectedRecharge] = useState<number | null>(null)
  const PACKAGES = [
    { price: 10, points: 100 },
    { price: 30, points: 320 },
    { price: 50, points: 600 },
    { price: 100, points: 1300 },
    { price: 200, points: 2700 }
  ]

  return (
    <div className="sidebar">
      <Link to="/home" className="sidebar-brand" title="宝宝巴士·AI漫画">
        <img src={appLogoUrl} alt="应用 Logo" className="brand-logo" />
        <span className="brand-title">宝宝巴士·AI漫画</span>
      </Link>

      {/* 积分模块：位于品牌与导航之间，推动选项下移 */}
      <div className="points-card" onClick={() => setShowCreditsModal(true)} role="button" title="剩余积分">
        <div className="points-row">
          <span className="points-label">剩余积分</span>
          <span className="points-value">{credits}</span>
        </div>
      </div>

      <ul className="nav">
        {NAVS.map((n) => (
          <li key={n.path} className={activePath === n.path ? 'active' : ''}>
            <Link to={n.path} title={n.label}>
              <span className="icon" aria-hidden>
                {n.icon}
              </span>
              <span className="label">{n.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/* 充值与规则浮层（基础结构，交互在后续任务实现） */}
      {showCreditsModal && (
        <div className="points-overlay" onClick={() => setShowCreditsModal(false)}>
          <div className="points-modal" onClick={(e) => e.stopPropagation()}>
            <header className="points-modal-header">
              <h4>积分规则与充值</h4>
              <button className="close" onClick={() => setShowCreditsModal(false)} aria-label="关闭">×</button>
            </header>
            <div className="points-modal-body">
              <div className="rules">
                <ul>
                  <li>一个分镜 50 积分</li>
                </ul>
              </div>
              <div className="recharge">
                <div className="options">
                  {PACKAGES.map((pkg) => (
                    <button
                      key={pkg.price}
                      className={`option ${selectedRecharge === pkg.points ? 'selected' : ''}`}
                      onClick={() => setSelectedRecharge(pkg.points)}
                    >
                      <span className="price">¥{pkg.price}</span>
                      <span className="pts">+{pkg.points} 积分</span>
                      {pkg.price >= 100 ? <span className="badge">推荐</span> : null}
                    </button>
                  ))}
                </div>
                <div className="actions">
                  <button
                    className="primary confirm"
                    disabled={!selectedRecharge}
                    onClick={() => {
                      if (!selectedRecharge) return
                      setCredits((prev) => prev + selectedRecharge)
                      setShowCreditsModal(false)
                      setSelectedRecharge(null)
                    }}
                  >
                    确定充值
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <div className="footer-actions">
          <button className="theme-toggle" onClick={toggleTheme} title="切换主题">
            {theme === 'dark' ? (
              <span>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                深色
              </span>
            ) : (
              <span>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93 6.34 6.34M17.66 17.66 19.07 19.07M17.66 6.34 19.07 4.93M4.93 19.07 6.34 17.66"/></svg>
                浅色
              </span>
            )}
          </button>
          <Link to="/settings" className="settings-link" title="设置">
            <span className="icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="8"/><line x1="4" y1="6" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="9" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="17"/></svg>
            </span>
            <span className="label">设置</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Sidebar
