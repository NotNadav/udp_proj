import { AlertCircle, CheckCircle2 } from 'lucide-react'

export default function Toast({ msg, type }) {
  if (!msg) return null
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium animate-fade-in
      ${type === 'error' ? 'bg-red-900 border border-red-500/30 text-red-300' : 'bg-emerald-900 border border-emerald-500/30 text-emerald-300'}`}>
      {type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
      {msg}
    </div>
  )
}
