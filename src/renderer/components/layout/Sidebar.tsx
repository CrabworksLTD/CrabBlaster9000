import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  Settings2,
  Bot,
  Activity
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
    <aside className="w-44 bg-win-bg border-r-2 border-r-white shadow-win-in flex flex-col">
      <div className="p-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-2 py-1 text-[11px] cursor-default ${
                isActive
                  ? 'bg-win-blue text-white'
                  : 'text-black hover:bg-win-blue hover:text-white'
              }`
            }
          >
            <Icon className="w-4 h-4" strokeWidth={1.5} />
            {label}
          </NavLink>
        ))}
      </div>

      <div className="mt-auto border-t border-win-dark p-1">
        <div className="text-[10px] text-win-dark text-center">v1.0.0</div>
      </div>
    </aside>
  )
}
