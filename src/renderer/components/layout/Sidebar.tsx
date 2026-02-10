import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  Settings2,
  Bot,
  Activity,
  Zap
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/wallets', icon: Wallet, label: 'Wallets' },
  { to: '/bot-config', icon: Settings2, label: 'Bot Config' },
  { to: '/bot-control', icon: Bot, label: 'Bot Control' },
  { to: '/settings', icon: Activity, label: 'Settings' }
]

export function Sidebar() {
  return (
    <aside className="w-64 bg-surface-secondary border-r border-border flex flex-col h-screen">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Solana Bot</h1>
            <p className="text-xs text-gray-500">Bundle & Volume</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-surface-tertiary'
              }`
            }
          >
            <Icon className="w-4.5 h-4.5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="text-xs text-gray-600 text-center">v1.0.0</div>
      </div>
    </aside>
  )
}
