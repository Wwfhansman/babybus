import React, { useState } from 'react'
import { useAuth } from '@renderer/contexts/AuthContext'

interface LoginFormProps {
  onSuccess?: () => void
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const { login, register } = useAuth()
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 5000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const { username, password, email } = formData

    // 基本验证
    if (!username.trim()) {
      showMessage('请输入用户名', 'error')
      return
    }

    if (!password) {
      showMessage('请输入密码', 'error')
      return
    }

    if (isRegisterMode && username.length < 3) {
      showMessage('用户名至少需要3个字符', 'error')
      return
    }

    if (isRegisterMode && password.length < 6) {
      showMessage('密码至少需要6个字符', 'error')
      return
    }

    setIsLoading(true)
    setMessage(null)

    try {
      if (isRegisterMode) {
        await register(username, password, email || undefined)
        showMessage('注册成功！请登录', 'success')
        // 清空表单并切换到登录模式
        setFormData({ username: '', password: '', email: '' })
        setTimeout(() => {
          setIsRegisterMode(false)
        }, 1500)
      } else {
        await login(username, password)
        showMessage('登录成功！', 'success')
        // 清空表单
        setFormData({ username: '', password: '', email: '' })
        onSuccess?.()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '操作失败，请重试'
      showMessage(errorMessage, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleMode = () => {
    setIsRegisterMode(!isRegisterMode)
    setMessage(null)
    setFormData({ username: '', password: '', email: '' })
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>宝宝巴士 AI 漫画</h1>
          <p>{isRegisterMode ? '创建新账户' : '欢迎回来'}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">用户名</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              placeholder="请输入用户名"
              disabled={isLoading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">密码</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder={isRegisterMode ? '至少6个字符' : '请输入密码'}
              disabled={isLoading}
              required
            />
          </div>

          {isRegisterMode && (
            <div className="form-group">
              <label htmlFor="email">邮箱 (可选)</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="请输入邮箱地址"
                disabled={isLoading}
              />
            </div>
          )}

          {message && (
            <div className={`auth-message ${message.type}-message`}>
              {message.text}
            </div>
          )}

          <button
            type="submit"
            className="auth-button"
            disabled={isLoading}
          >
            {isLoading 
              ? (isRegisterMode ? '注册中...' : '登录中...') 
              : (isRegisterMode ? '注册' : '登录')
            }
          </button>

          <div className="auth-switch">
            <span>
              {isRegisterMode ? '已有账户？' : '还没有账户？'}
            </span>
            <button
              type="button"
              onClick={toggleMode}
              className="switch-button"
              disabled={isLoading}
            >
              {isRegisterMode ? '立即登录' : '立即注册'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default LoginForm