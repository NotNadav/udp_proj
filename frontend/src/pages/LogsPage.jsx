import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Activity, RefreshCw, Search, Download,
  ChevronLeft, ChevronRight, Loader2, Globe, Clock
} from 'lucide-react'

function formatBytes(b) {
  if (b == null || isNaN(b)) return '0 B'
  if (b < 1024)       return `${b} B`
  if (b < 1048576)    return `${(b/1024).toFixed(1)} KB`
  return `${(b/1048576).toFixed(2)} MB`
}

const PAGE_SIZE = 25

export default function LogsPage() {
  const { user } = useAuth()
  const [logs,      setLogs]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [since,     setSince]     = useState('')
  const [page,      setPage]      = useState(1)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const timerRef = useRef(null)

  const fetchLogs = useCallback(async () => {
    try {
      const params = { limit: 500 }
      if (since) params.since = since
      const res = await api.get('/api/logs', { params })
      setLogs(res.data)
    } catch (e) {
      console.error('Failed to fetch logs:', e)
    } finally {
      setLoading(false)
    }
  }, [since])

  useEffect(() => {
    fetchLogs()
    if (autoRefresh) {
      timerRef.current = setInterval(fetchLogs, 5000)
      return () => clearInterval(timerRef.current)
    }
  }, [fetchLogs, autoRefresh])

  // Filter by search
  const filtered = logs.filter(log =>
    (log.domain || '').toLowerCase().includes(search.toLowerCase()) ||
    (log.username || '').toLowerCase().includes(search.toLowerCase())
  )

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalBytes = filtered.reduce((s, l) => s + Number(l.bytes_sent || 0), 0)

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">יומן תעבורה</h1>
          <p className="text-gray-400 text-sm mt-0.5">ניטור תעבורה היסטורית — פאקטות נכנסות ויוצאות</p>
        </div>
        <div className="flex items-center gap-2">
          {autoRefresh && (
            <span className="text-xs text-gray-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              חי
            </span>
          )}
          <button
            id="logs-autorefresh-toggle"
            onClick={() => setAutoRefresh(a => !a)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              autoRefresh
                ? 'bg-emerald-500/15 border border-emerald-500/20 text-emerald-400'
                : 'glass text-gray-400 hover:text-white'
            }`}
          >
            {autoRefresh ? '● ריענון אוטומטי ' : '○ ריענון אוטומטי (כבוי)'}
          </button>
          <button
            id="logs-refresh"
            onClick={fetchLogs}
            className="p-2 rounded-xl glass text-gray-400 hover:text-white transition-all"
            title="Refresh now"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass bg-gradient-to-br from-indigo-500/20 to-indigo-600/5 border-indigo-500/20 p-4">
          <div className="text-xs text-gray-400 mb-1">סך הכל רשומות</div>
          <div className="text-xl font-bold text-white">{filtered.length}</div>
        </div>
        <div className="glass bg-gradient-to-br from-violet-500/20 to-violet-600/5 border-violet-500/20 p-4">
          <div className="text-xs text-gray-400 mb-1">נפח תעבורה (Bytes)</div>
          <div className="text-xl font-bold text-white">{formatBytes(totalBytes)}</div>
        </div>
        <div className="glass bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 p-4">
          <div className="text-xs text-gray-400 mb-1">דומיינים נפרדים</div>
          <div className="text-xl font-bold text-white">{new Set(filtered.map(l => l.domain).filter(Boolean)).size}</div>
        </div>
        <div className="glass bg-gradient-to-br from-amber-500/20 to-amber-600/5 border-amber-500/20 p-4">
          <div className="text-xs text-gray-400 mb-1">עמוד נוכחי</div>
          <div className="text-xl font-bold text-white">{page} / {totalPages}</div>
        </div>
      </div>

      {/* filters */}
      <div className="glass p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            id="logs-search"
            type="text"
            placeholder="סינון לפי דומיין או משתמש…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="input pr-10 py-2 text-right"
          />
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" />
          <input
            id="logs-since"
            type="datetime-local"
            value={since}
            onChange={e => { setSince(e.target.value); setPage(1) }}
            className="input py-2 w-auto text-xs"
          />
          {since && (
            <button
              onClick={() => setSince('')}
              className="text-xs text-gray-500 hover:text-white transition-all mr-2"
            >
              נקה סינון
            </button>
          )}
        </div>
        <span className="text-xs text-gray-600 mr-auto">{filtered.length} רשומות רשת</span>
      </div>

      {/* table */}
      <div className="glass p-5">
        {loading ? (
          <div className="py-16 text-center text-gray-600 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> טוען נתוני תעבורה…
          </div>
        ) : paged.length === 0 ? (
          <div className="py-16 text-center">
            <Activity className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {search || since ? 'לא נמצאו נתונים.' : 'לא תועדה תעבורה.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" id="logs-table">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-white/5">
                  <th className="pb-2.5 text-right font-medium w-12">#</th>
                  <th className="pb-2.5 text-right font-medium">דומיין</th>
                  <th className="pb-2.5 text-right font-medium">נפח (Bytes)</th>
                  {user?.role === 'admin' && <th className="pb-2.5 text-right font-medium">משתמש</th>}
                  <th className="pb-2.5 text-right font-medium">זמן החיבור</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paged.map((log, i) => (
                  <tr key={log.id} className="hover:bg-white/3 transition-colors">
                    <td className="py-2.5 pr-3 text-gray-600 text-xs">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="py-2.5 pr-4">
                      <span className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="font-mono text-xs text-indigo-300">{log.domain || '—'}</span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-white font-semibold">{formatBytes(log.bytes_sent)}</td>
                    {user?.role === 'admin' && <td className="py-2.5 pr-4 text-gray-400 text-xs">{log.username}</td>}
                    <td className="py-2.5 text-gray-500 text-xs">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
            <button
              id="logs-prev-page"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg glass text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs"
            >
              <ChevronRight className="w-3.5 h-3.5" /> הקודם
            </button>
            <span className="text-xs text-gray-500">עמוד {page} מתוך {totalPages}</span>
            <button
              id="logs-next-page"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg glass text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs"
            >
              הבא <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
