import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Shield, LayoutDashboard, ListFilter, LogOut, Wifi, Activity } from 'lucide-react'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'לוח בקרה' },
  { to: '/policies',  icon: ListFilter,      label: 'מדיניות' },
  { to: '/logs',      icon: Activity,        label: 'יומן תעבורה' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const tabs = [...navItems];
  if (user?.role === 'admin') {
    tabs.push({ to: '/users', icon: Shield, label: 'משתמשים' });
  }

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* sidebar */}
      <aside className="w-64 shrink-0 flex flex-col bg-gray-900/60 border-r border-white/5">
        {/* brand */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center glow shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-white text-sm leading-tight text-right">SecureProxy</div>
            <div className="text-xs text-gray-500 text-right">מערכת ניהול</div>
          </div>
        </div>

        {/* nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              id={`nav-${label.toLowerCase()}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* proxy status */}
        <div className="px-4 pb-3">
          <div className="glass px-3 py-2.5 flex items-center gap-2">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <div className="text-right">
              <div className="text-xs font-medium text-white">פרוקסי פעיל</div>
              <div className="text-[10px] text-gray-500" dir="ltr">SOCKS5 · 127.0.0.1:1080</div>
            </div>
            <span className="mr-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse-slow" />
          </div>
        </div>

        {/* user */}
        <div className="border-t border-white/5 px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 text-right">
            <div className="text-sm font-medium text-white truncate">{user?.username}</div>
            <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
          </div>
          <button
            id="logout-btn"
            onClick={handleLogout}
            title="התנתק"
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* student footer */}
        <div className="px-4 py-3 border-t border-white/5 bg-black/20 text-center">
          <p className="text-[10px] text-gray-500 font-medium tracking-wide">
            נוצר על ידי נדב כהן
          </p>
          <p className="text-[9px] text-gray-600 mt-0.5">
            אורט רחובות
          </p>
        </div>
      </aside>

      {/* main section */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
