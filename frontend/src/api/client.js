import axios from 'axios'

const api = axios.create({
  baseURL: '',          // Vite proxies /api → localhost:3001
  timeout: 10000,
})

// Attach JWT automatically
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('sp_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Auto-logout on 401
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sp_token')
      localStorage.removeItem('sp_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
