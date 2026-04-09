import { createContext, useContext, useState, useCallback } from 'react'
import api from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('sp_token'))
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('sp_user')) } catch { return null }
  })

  const login = useCallback(async (username, password) => {
    const res = await api.post('/api/auth/login', { username, password })
    const { token: t, user: u } = res.data
    localStorage.setItem('sp_token', t)
    localStorage.setItem('sp_user',  JSON.stringify(u))
    setToken(t)
    setUser(u)
    return u
  }, [])

  const register = useCallback(async (username, password) => {
    await api.post('/api/auth/register', { username, password })
    return login(username, password)
  }, [login])

  const logout = useCallback(() => {
    localStorage.removeItem('sp_token')
    localStorage.removeItem('sp_user')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
