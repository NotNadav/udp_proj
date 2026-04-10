import { useState, useEffect, useCallback } from 'react'
import api from '../api/client.js'
import Toast from '../components/Toast.jsx'
import {
  Shield, Lock, Globe, Plus, Trash2,
  Loader2, RefreshCw, Search, ArrowRight, ShieldAlert, Save, ListFilter
} from 'lucide-react'

const ACTION_META = {
  BLOCK:  { label: 'חסימה',     bg: 'bg-red-500/5',     color: 'text-red-400',     border: 'border-red-500/20',     icon: ShieldAlert },
  TUNNEL: { label: 'הצפנה', bg: 'bg-indigo-500/5',  color: 'text-indigo-400',  border: 'border-indigo-500/20',  icon: Lock },
  DIRECT: { label: 'ישיר',    bg: 'bg-emerald-500/5', color: 'text-emerald-400', border: 'border-emerald-500/20', icon: ArrowRight },
}

function ActionBadge({ action }) {
  const m = ACTION_META[action] || {}
  const Icon = m.icon || Globe
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium ${m.bg} ${m.color} ${m.border}`}>
      <Icon className="w-3 h-3" />
      {m.label}
    </span>
  )
}


export default function PoliciesPage() {
  const [policies, setPolicies] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [toast,    setToast]    = useState({ msg: '', type: 'ok' })
  const [form,     setForm]     = useState({ domain: '', action: 'BLOCK' })
  const [deletingId, setDeletingId] = useState(null)

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 3500)
  }

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await api.get('/api/policies')
      setPolicies(res.data)
    } catch { showToast('Failed to load policies', 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchPolicies() }, [fetchPolicies])

  const addPolicy = async e => {
    e.preventDefault()
    if (!form.domain.trim()) return
    setSaving(true)
    try {
      const cleanDomain = form.domain.trim().toLowerCase()
        .replace(/^https?:\/\//i, '')
        .replace(/[/?#].*$/, '')
      await api.post('/api/policies', { domain: cleanDomain, action: form.action })
      setForm(f => ({ ...f, domain: '' }))
      await fetchPolicies()
      showToast(`Rule added: ${form.domain} → ${form.action}`)
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add policy', 'error')
    } finally { setSaving(false) }
  }

  const deletePolicy = async id => {
    setDeletingId(id)
    try {
      await api.delete(`/api/policies/${id}`)
      setPolicies(ps => ps.filter(p => p.id !== id))
      showToast('Policy deleted')
    } catch { showToast('Failed to delete policy', 'error') }
    finally { setDeletingId(null) }
  }

  const filtered = policies.filter(p =>
    p.domain.includes(search.toLowerCase()) ||
    p.action.includes(search.toUpperCase())
  )

  const counts = { BLOCK: 0, TUNNEL: 0, DIRECT: 0 }
  policies.forEach(p => { if (counts[p.action] !== undefined) counts[p.action]++ })

  return (
    <div className="p-6 space-y-6 animate-fade-in" dir="rtl">
      <Toast {...toast} />

      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ניהול מדיניות</h1>
          <p className="text-gray-400 text-sm mt-0.5">ניהול חוקי תעבורה — TUNNEL / BLOCK / DIRECT</p>
        </div>
        <button id="policies-refresh" onClick={fetchPolicies} className="p-2 rounded-xl glass text-gray-400 hover:text-white transition-all">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* summary badges */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(ACTION_META).map(([action, m]) => {
          const Icon = m.icon
          return (
            <div key={action} className={`glass border px-4 py-2.5 flex items-center gap-2.5 ${m.bg}`}>
              <Icon className={`w-4 h-4 ${m.color}`} />
              <span className="text-sm text-white font-semibold">{counts[action]}</span>
              <span className="text-xs text-gray-400">דומיינים - {m.label}</span>
            </div>
          )
        })}
      </div>

      {/* add rule form */}
      <div className="glass p-6">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-5">
          <Plus className="w-4 h-4 text-indigo-400" /> הוספת חוק חדש
        </h2>
        <form id="add-policy-form" onSubmit={addPolicy} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">דומיין</label>
            <div className="relative flex items-center">
              <Globe className="absolute right-3 w-4 h-4 text-gray-500" />
              <input
                id="policy-domain-input"
                type="text"
                placeholder="למשל youtube.com"
                value={form.domain}
                onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                className="input pr-10 text-right"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">פעולה (Action)</label>
            <select
              id="policy-action-select"
              value={form.action}
              onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
              className="select h-[42px] pr-8"
              dir="rtl"
            >
              <option value="BLOCK">🚫 חסימה (Block)</option>
              <option value="TUNNEL">🔒 הצפנה (Tunnel)</option>
              <option value="DIRECT">➡️ ישיר (Direct)</option>
            </select>
          </div>

          <button
            id="add-policy-btn"
            type="submit"
            disabled={saving || !form.domain.trim()}
            className="btn-primary h-[42px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'שומר…' : 'הוסף חוק'}
          </button>
        </form>

        {/* quick add presets */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-gray-600 ml-1 self-center">Quick add:</span>
          {[
            ['youtube.com', 'TUNNEL'], ['facebook.com', 'BLOCK'],
            ['google.com',  'TUNNEL'], ['example.com',  'DIRECT'],
          ].map(([d, a]) => (
            <button
              key={d + a}
              type="button"
              onClick={() => setForm({ domain: d, action: a })}
              className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all"
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* rules table */}
      <div className="glass p-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <ListFilter className="w-4 h-4 text-gray-400" /> חוקים קיימים
        </h2>

        {/* filter search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              id="policy-search"
              type="text"
              placeholder="חיפוש חוקים…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pr-10 py-2"
            />
          </div>
          <span className="text-xs text-gray-600">{filtered.length} חוקים</span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-600 text-sm">טוען חוקים…</div>
        ) : policies.length === 0 ? (
          <div className="py-8 text-center text-gray-600 text-sm">לא הוגדרו חוקים עדיין.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-white/5">
                  <th className="pb-3 text-right font-medium">דומיין</th>
                  <th className="pb-3 text-right font-medium">פעולה (Action)</th>
                  <th className="pb-3 text-right font-medium">נוסף בתאריך</th>
                  <th className="pb-3 text-left font-medium">אפשרויות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-white/3 transition-colors group animate-fade-in">
                    <td className="py-3 pr-4 font-mono text-white">{p.domain}</td>
                    <td className="py-3 pr-4">
                      <ActionBadge action={p.action} />
                    </td>
                    <td className="py-3 pr-4 text-gray-600 text-xs">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-left">
                      <button
                        id={`policy-delete-${p.id}`}
                        onClick={() => deletePolicy(p.id)}
                        disabled={deletingId === p.id}
                        title="מחק חוק"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* integration remark */}
      <div className="glass border border-indigo-500/20 bg-indigo-500/5 p-4 flex gap-3">
        <Shield className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-white">Zero-Trust Policy Engine</p>
          <p className="text-xs text-gray-400 mt-1">
            The Python client agent fetches these rules from <code className="text-indigo-300 font-mono">GET /api/rules</code> every 60s.
            Each SOCKS5 request is evaluated: <strong>TUNNEL</strong> (encrypt &amp; send via VPN), <strong>BLOCK</strong> (drop), or <strong>DIRECT</strong> (bypass VPN).
          </p>
        </div>
      </div>
    </div>
  )
}
