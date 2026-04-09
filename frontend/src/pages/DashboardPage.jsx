import { useState, useEffect, useCallback, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api/client.js'
import {
  Activity, Wifi, Users, TrendingUp, RefreshCw,
  ArrowUpRight, Database, Zap, Globe
} from 'lucide-react'

const POLL_MS = 5000   // real-time poll every 5 seconds

function formatBytes(b) {
  if (b == null || isNaN(b)) return '0 B'
  if (b < 1024)       return `${b} B`
  if (b < 1048576)    return `${(b/1024).toFixed(1)} KB`
  return `${(b/1048576).toFixed(2)} MB`
}

function StatCard({ icon: Icon, label, value, sub, color = 'indigo', trend }) {
  const colors = {
    indigo:  'from-indigo-500/20 to-indigo-600/5  border-indigo-500/20 text-indigo-400',
    emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
    violet:  'from-violet-500/20 to-violet-600/5  border-violet-500/20 text-violet-400',
    amber:   'from-amber-500/20 to-amber-600/5   border-amber-500/20 text-amber-400',
  }
  return (
    <div className={`glass bg-gradient-to-br ${colors[color]} p-5 animate-fade-in`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend != null && (
          <span className="flex items-center gap-0.5 text-xs text-emerald-400 font-medium">
            <ArrowUpRight className="w-3 h-3" /> {trend}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      <div className="text-sm text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  )
}

/* custom tooltip for charts */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-400 mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="text-white font-semibold">{formatBytes(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

const CHART_COLORS = ['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4']

export default function DashboardPage() {
  const { user } = useAuth()
  const [summary,    setSummary]    = useState([])
  const [recent,     setRecent]     = useState([])
  const [history,    setHistory]    = useState([])   // time-series for area chart
  const [loading,    setLoading]    = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [policies,   setPolicies]   = useState([])
  const timerRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const [sumRes, logRes, polRes] = await Promise.all([
        api.get('/api/logs/summary'),
        api.get('/api/logs', { params: { limit: 50 } }),
        api.get('/api/policies'),
      ])
      setSummary(sumRes.data)
      setRecent(logRes.data.slice(0, 8))
      setPolicies(polRes.data)

      // Build rolling time-series for area chart from last 20 log entries
      const timeSeries = logRes.data.slice(0, 20).reverse().map((e, i) => ({
        t:    new Date(e.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
        bytes: e.bytes_sent,
        name:  e.username || user?.username || 'user',
      }))
      setHistory(timeSeries)
      setLastUpdate(new Date())
    } catch (e) {
      console.error('Dashboard fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchData()
    timerRef.current = setInterval(fetchData, POLL_MS)
    return () => clearInterval(timerRef.current)
  }, [fetchData])

  const totalBytes = summary.reduce((s, u) => s + Number(u.total_bytes || 0), 0)
  const blocked    = policies.filter(p => p.action === 'BLOCK').length
  const tunneled   = policies.filter(p => p.action === 'TUNNEL').length

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">לוח בקרה אישי</h1>
          <p className="text-gray-400 text-sm mt-0.5">ניטור תעבורה וססטוס פרוקסי בזמן אמת</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-gray-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              עודכן לאחרונה ב-{lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            id="dashboard-refresh"
            onClick={fetchData}
            className="p-2 rounded-xl glass text-gray-400 hover:text-white transition-all"
            title="Refresh now"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Database}  label="תעבורה חודשית"       value={formatBytes(totalBytes)} color="indigo"  trend="+live" />
        <StatCard icon={Users}     label="משתמשים שמשדרים"        value={summary.length}         color="emerald" />
        <StatCard icon={Zap}       label="חוקי הצפנה (Tunnel)"    value={tunneled}               color="violet"  />
        <StatCard icon={Globe}     label="אתרים חסומים"     value={blocked}                color="amber"   />
      </div>

      {/* charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* area chart for time-series traffic */}
        <div className={`glass p-5 ${user?.role === 'admin' ? 'xl:col-span-2' : 'xl:col-span-3'}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" /> תעבורת רשת לאורך זמן
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">סך Bytes שנשלחו — מתרענן כל 5 שניות</p>
            </div>
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">Loading…</div>
          ) : history.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No traffic data yet — run some requests through the proxy.</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={history} margin={{ top:5, right:10, left:-10, bottom:0 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="t" tick={{ fill:'#6b7280', fontSize:10 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => formatBytes(v)} tick={{ fill:'#6b7280', fontSize:10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="bytes" name="Bytes" stroke="#6366f1" strokeWidth={2} fill="url(#grad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* bar chart details users usage (admin) */}
        {user?.role === 'admin' && (
          <div className="glass p-5">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-violet-400" /> נפח תעבורה לכל משתמש
            </h2>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-gray-600 text-sm">Loading…</div>
            ) : summary.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={summary} margin={{ top:5, right:5, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="username" tick={{ fill:'#6b7280', fontSize:10 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={v => formatBytes(v)} tick={{ fill:'#6b7280', fontSize:10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total_bytes" name="Total Bytes" radius={[4,4,0,0]}
                    fill="url(#barGrad)" />
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      {/* recent logs */}
      <div className="glass p-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <Wifi className="w-4 h-4 text-emerald-400" /> תיעוד תעבורה אחרונה
        </h2>
        {loading ? (
          <div className="text-gray-600 text-sm py-8 text-center">טוען נתונים…</div>
        ) : recent.length === 0 ? (
          <div className="text-gray-600 text-sm py-8 text-center">טרם תועדה תעבורה. אנא גלוש באמצעות ה-SOCKS5.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-white/5">
                  <th className="pb-2 text-right font-medium">יעד (דומיין)</th>
                  <th className="pb-2 text-right font-medium">נפח Bytes</th>
                  {user?.role === 'admin' && <th className="pb-2 text-right font-medium">משתמש</th>}
                  <th className="pb-2 text-right font-medium">שעה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recent.map(log => (
                  <tr key={log.id} className="hover:bg-white/3 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-indigo-300 text-xs">{log.domain || '—'}</td>
                    <td className="py-2.5 pr-4 text-white font-semibold">{formatBytes(log.bytes_sent)}</td>
                    {user?.role === 'admin' && <td className="py-2.5 pr-4 text-gray-400">{log.username}</td>}
                    <td className="py-2.5 text-gray-500 text-xs">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
