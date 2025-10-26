import React, { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from '@renderer/contexts/AuthContext'
import AuthGuard from '@renderer/components/AuthGuard'
import Sidebar from '@renderer/components/Sidebar'
import CreatePage from '@renderer/pages/Create'
import ProfilePage from '@renderer/pages/Profile'
import CommunityPage from '@renderer/pages/Community'
import HelpPage from '@renderer/pages/Help'
import SettingsPage from '@renderer/pages/Settings'

const PagePlaceholder = ({ title }: { title: string }) => (
  <div className="page-placeholder">
    <h2>{title}</h2>
    <p>此页面为占位页，后续迭代补充具体功能。</p>
  </div>
)

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('theme') as 'light' | 'dark') || 'dark'
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])
  return { theme, setTheme }
}

const TopBar: React.FC<{ theme: 'light' | 'dark'; onToggle(): void }> = ({ theme, onToggle }) => {
  return (
    <div className="topbar">
      <div className="brand">宝宝巴士·AI漫画</div>
      <div className="top-actions">
        <button className="btn-switch" onClick={onToggle} aria-label="切换主题">
          {theme === 'dark' ? '🌙 深色' : '☀️ 浅色'}
        </button>
      </div>
    </div>
  )
}

const Shell: React.FC = () => {
  const location = useLocation()
  return (
    <AuthGuard>
      <div className="shell">
        <Sidebar activePath={location.pathname} />
        <div className="content">
          <div className="view">
            <Routes>
              <Route path="/" element={<Navigate to="/create" replace />} />
              <Route path="/home" element={<PagePlaceholder title="主页" />} />
              <Route path="/create" element={<CreatePage />} />
              <Route path="/community" element={<CommunityPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<PagePlaceholder title="未找到页面" />} />
            </Routes>
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AuthProvider>
  )
}

export default App
