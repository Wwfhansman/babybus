import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  id: number
  username: string
  email?: string
  avatar?: string
}

interface AuthContextType {
  user: User | null
  sessionToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, email?: string) => Promise<void>
  logout: () => Promise<void>
  verifySession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const BACKEND_URL = 'http://139.224.101.91:5000'

  // 初始化时检查本地存储的token
  useEffect(() => {
    const storedToken = localStorage.getItem('sessionToken')
    if (storedToken) {
      setSessionToken(storedToken)
      verifySession()
    } else {
      setIsLoading(false)
    }
  }, [])

  const verifySession = async () => {
    const token = sessionToken || localStorage.getItem('sessionToken')
    if (!token) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
        setSessionToken(token)
        console.log('自动登录成功')
      } else {
        // token无效，清除本地存储
        localStorage.removeItem('sessionToken')
        setSessionToken(null)
        setUser(null)
      }
    } catch (error) {
      console.error('验证会话失败:', error)
      localStorage.removeItem('sessionToken')
      setSessionToken(null)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (username: string, password: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password })
      })

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(`服务器返回了非JSON响应: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (response.ok && data.success) {
        const token = data.session_token
        const userData = data.user

        setSessionToken(token)
        setUser(userData)
        localStorage.setItem('sessionToken', token)
        
        console.log('登录成功！')
      } else {
        throw new Error(data.error || '登录失败')
      }
    } catch (error) {
      console.error('登录请求失败:', error)
      throw error
    }
  }

  const register = async (username: string, password: string, email?: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: password,
          email: email || null
        })
      })

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(`服务器返回了非JSON响应: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (response.ok && data.success) {
        console.log('注册成功！')
      } else {
        throw new Error(data.error || '注册失败')
      }
    } catch (error) {
      console.error('注册请求失败:', error)
      throw error
    }
  }

  const logout = async () => {
    try {
      if (sessionToken) {
        await fetch(`${BACKEND_URL}/api/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`
          }
        })
      }
    } catch (error) {
      console.error('退出登录API调用失败:', error)
    } finally {
      // 清除本地状态
      localStorage.removeItem('sessionToken')
      setSessionToken(null)
      setUser(null)
      console.log('已退出登录')
    }
  }

  const value: AuthContextType = {
    user,
    sessionToken,
    isAuthenticated: !!user && !!sessionToken,
    isLoading,
    login,
    register,
    logout,
    verifySession
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}