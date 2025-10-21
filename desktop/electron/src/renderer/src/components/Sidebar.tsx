import React from 'react'
import { Link } from 'react-router-dom'

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
    path: '/library',
    label: '素材库',
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
        <path d="M12 18h.01M12 6a4 4 0 0 1 4 4c0 2-2 3-3 4" />
      </svg>
    )
  }
]

const Sidebar: React.FC<{ activePath?: string }> = ({ activePath }) => {
  return (
    <div className="sidebar">
      <div className="sidebar-title" style={{ display: 'none' }}>
        导航
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
    </div>
  )
}

export default Sidebar
