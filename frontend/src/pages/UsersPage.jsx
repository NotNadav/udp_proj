import { useState, useEffect, useCallback } from 'react'
import api from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import Toast from '../components/Toast.jsx'
import { Shield, ShieldAlert, Trash2, Loader2, Users, Activity } from 'lucide-react'

export default function UsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [healthMap, setHealthMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [toast, setToast] = useState({ msg: '', type: 'ok' })

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500)
  }

  const loadData = useCallback(async () => {
    try {
      const [uRes, hRes] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/logs/health').catch(() => ({ data: {} }))
      ])
      setUsers(uRes.data)
      setHealthMap(hRes.data || {})
    } catch (err) {
      showToast('Failed to load users data', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const int = setInterval(loadData, 5000)
    return () => clearInterval(int)
  }, [loadData])

  const deleteUser = async (id, un) => {
    if (!window.confirm(`האם אתה בטוח שברצונך למחוק את המשתמש ולחסום לו את הגישה: '${un}'?`)) return
    setActionId(id)
    try {
      await api.delete(`/api/users/${id}`)
      showToast(`User '${un}' deleted. Killswitch activated.`)
      setUsers(u => u.filter(x => x.id !== id))
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete user', 'error')
    } finally {
      setActionId(null)
    }
  }

  if (user?.role !== 'admin') {
    return <div className="p-6 text-red-400">נדרשת הרשאת מנהל.</div>
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Toast {...toast} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Users className="w-6 h-6 text-indigo-400" /> ניהול משתמשים
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">בריאות רשת גלובלית וניתוק מיידי (Killswitch)</p>
        </div>
      </div>

      <div className="glass p-5">
        {loading && users.length === 0 ? (
          <div className="py-12 text-center text-gray-600 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> טוען נתוני רשת…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-white/5">
                  <th className="pb-3 text-right font-medium">שם משתמש</th>
                  <th className="pb-3 text-right font-medium">הרשאה</th>
                  <th className="pb-3 text-right font-medium">בריאות רשת (נפילות)</th>
                  <th className="pb-3 text-right font-medium">הצטרפות</th>
                  <th className="pb-3 text-left font-medium">אפשרויות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map(u => {
                  const retx = healthMap[u.id] || 0;
                  const isMe = u.id === user.id;

                  return (
                    <tr key={u.id} className="hover:bg-white/3 transition-colors group">
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold shrink-0">
                            {u.username[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-white">{u.username} {isMe && <span className="text-xs text-indigo-400 mr-1">(אתה)</span>}</div>
                            <div className="text-xs text-gray-500">ID: {u.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <span className={`text-xs px-2 py-1 rounded-md border ${
                          u.role === 'admin' 
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        }`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-2">
                          <Activity className={`w-4 h-4 ${retx > 50 ? 'text-red-400' : retx > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
                          <span className="text-sm font-mono text-gray-300">
                            {retx} <span className="text-xs text-gray-500">שידורים חוזרים</span>
                          </span>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-xs text-gray-500">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4 text-left">
                        {!isMe && (
                          <button
                            onClick={() => deleteUser(u.id, u.username)}
                            disabled={actionId === u.id}
                            className="btn-danger inline-flex h-8 py-0 px-3 opacity-0 group-hover:opacity-100 transition-all font-medium text-xs mr-auto"
                          >
                            {actionId === u.id 
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <ShieldAlert className="w-3 h-3" />}
                            ניתוק (Killswitch)
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
