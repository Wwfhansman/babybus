import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@renderer/contexts/AuthContext'
import LoginForm from './LoginForm'

interface AuthGuardProps {
  children: React.ReactNode
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  // 显示加载状态
  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="loading-container">
          <div className="loading-spinner">🔄</div>
          <p>正在验证登录状态...</p>
        </div>
      </div>
    )
  }

  // 如果未认证，显示登录表单（登录成功后默认跳转首页）
  if (!isAuthenticated) {
    return <LoginForm onSuccess={() => navigate('/home', { replace: true })} />
  }

  // 如果已认证，显示受保护的内容
  return <>{children}</>
}

export default AuthGuard