import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Shield, Lock, User, AlertCircle, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const { login, register } = useAuth()
  const navigate   = useNavigate()
  const [form,  setForm]  = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)

  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isRegistering) {
        await register(form.username, form.password)
      } else {
        await login(form.username, form.password)
      }
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || (isRegistering ? 'Registration failed.' : 'Login failed — check your credentials.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-bg min-h-screen flex items-center justify-center p-4">
      {/* background grid */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNjB2NjBIMHoiLz48cGF0aCBkPSJNNjAgMEgwdjYwaDYwVjB6TTEgMWg1OHY1OEgxVjF6IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIi8+PC9nPjwvc3ZnPg==')] opacity-40 pointer-events-none" />

      <div className="relative w-full max-w-md animate-fade-in">
        {/* logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 mb-4 glow">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">SecureProxy</h1>
          <p className="text-gray-400 mt-1 text-sm">Management Dashboard</p>
        </div>

        {/* card */}
        <div className="glass p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-6">
            {isRegistering ? 'יצירת חשבון חדש' : 'התחבר לחשבון שלך'}
          </h2>

          {error && (
            <div className="flex items-center gap-2 mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">שם משתמש</label>
              <div className="relative flex items-center">
                <User className="absolute right-3 w-4 h-4 text-gray-500" />
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={form.username}
                  onChange={handle}
                  placeholder="admin"
                  className="input pr-10 text-right"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">סיסמה</label>
              <div className="relative flex items-center">
                <Lock className="absolute right-3 w-4 h-4 text-gray-500" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={handle}
                  placeholder="••••••••"
                  className="input pr-10 text-right"
                  dir="ltr"
                />
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center mt-2 h-11 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              {loading 
                ? (isRegistering ? 'יוצר חשבון…' : 'מתחבר…') 
                : (isRegistering ? 'צור חשבון' : 'התחברות')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering)
                setError('')
              }}
              className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {isRegistering ? 'כבר יש לך חשבון? התחבר' : "אין לך חשבון? הירשם עכשיו"}
            </button>
          </div>

          <p className="text-center text-xs text-gray-600 mt-6">
            ברירת מחדל: <span className="text-gray-400 font-mono" dir="ltr">admin</span> / <span className="text-gray-400 font-mono" dir="ltr">admin123</span>
          </p>
        </div>

        {/* footer */}
        <div className="mt-8 text-center space-y-2">
          <p className="text-xs font-medium text-gray-500">
            נוצר על ידי נדב כהן ; אורט רחובות
          </p>
          <p className="text-xs text-gray-700">
            מערכת ניהול מנהרת UDP מוצפנת בטכנולוגיית AES-GCM
          </p>
        </div>
      </div>
    </div>
  )
}
