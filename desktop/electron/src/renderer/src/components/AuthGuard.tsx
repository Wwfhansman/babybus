import React from 'react'
import { useAuth } from '@renderer/contexts/AuthContext'
import LoginForm from './LoginForm'

interface AuthGuardProps {
  children: React.ReactNode
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth()

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

  // 如果未认证，显示登录表单
  if (!isAuthenticated) {
    return <LoginForm />
  }

  // 如果已认证，显示受保护的内容
  return <>{children}</>
}

export default AuthGuard