import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/Dashboard'
import { WalletsPage } from './pages/Wallets'
import { BotConfigPage } from './pages/BotConfig'
import { BotControlPage } from './pages/BotControl'
import { SettingsPage } from './pages/Settings'
import { PolymarketPage } from './pages/Polymarket'

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="wallets" element={<WalletsPage />} />
          <Route path="bot-config" element={<BotConfigPage />} />
          <Route path="bot-control" element={<BotControlPage />} />
          <Route path="polymarket" element={<PolymarketPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
