import React, { useState, useEffect, useCallback } from 'react'
import { create } from 'zustand'
import { toast } from 'sonner'
import {
  Activity,
  ChartColumn,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Trophy,
  Users,
  X
} from 'lucide-react'
import type {
  PmCopySettings,
  PmCopyPosition,
  PmCopyLogEntry,
  PmWalletTrade,
  PmTrackedWallet,
  PmLeaderboardEntry,
  PmCopyStats,
  PmServiceState
} from '@shared/types/polymarket'

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: any[]) => Promise<any>
      on: (channel: string, callback: (data: any) => void) => () => void
    }
  }
}

function useIpcEvent(channel: string, callback: (data: any) => void) {
  useEffect(() => {
    const unsubscribe = window.electronAPI.on(channel, callback)
    return unsubscribe
  }, [channel, callback])
}

function Spinner() {
  return <span className="inline-block w-3 h-3 border border-win-dark border-t-transparent rounded-full animate-spin" />
}

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <Icon className="w-8 h-8 text-win-dark mb-2" strokeWidth={1} />
      <p className="text-[11px] font-bold">{title}</p>
      <p className="text-[10px] text-win-dark">{description}</p>
    </div>
  )
}

// Store

interface PolymarketStore {
  settings: PmCopySettings | null
  leaderboard: PmLeaderboardEntry[]
  trackedWallets: PmTrackedWallet[]
  walletTrades: PmWalletTrade[]
  positions: PmCopyPosition[]
  copyLog: PmCopyLogEntry[]
  stats: PmCopyStats | null
  serviceState: PmServiceState
  loading: boolean
  fetchSettings: () => Promise<void>
  saveSettings: (settings: PmCopySettings) => Promise<void>
  saveKeys: (polygonPrivateKey: string) => Promise<void>
  testConnection: () => Promise<{ ok: boolean; balance: number }>
  fetchLeaderboard: (timePeriod?: string, limit?: number) => Promise<void>
  fetchTrackedWallets: () => Promise<void>
  trackWallet: (proxyWallet: string, displayName: string) => Promise<void>
  untrackWallet: (walletId: number) => Promise<void>
  toggleWallet: (walletId: number, isActive: boolean) => Promise<void>
  fetchWalletTrades: (walletId: number, limit?: number) => Promise<void>
  fetchPositions: () => Promise<void>
  closePosition: (positionId: string) => Promise<void>
  fetchCopyLog: (limit?: number) => Promise<void>
  fetchStats: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  fetchState: () => Promise<void>
  onTradeDetected: (trade: PmWalletTrade) => void
  onCopyExecuted: (position: PmCopyPosition) => void
  onPositionUpdated: (position: PmCopyPosition) => void
  onStateChanged: (state: PmServiceState) => void
}

const usePolymarketStore = create<PolymarketStore>((set, get) => ({
  settings: null,
  leaderboard: [],
  trackedWallets: [],
  walletTrades: [],
  positions: [],
  copyLog: [],
  stats: null,
  serviceState: { running: false, lastPoll: null, error: null },
  loading: false,

  fetchSettings: async () => {
    const settings = await window.electronAPI.invoke('pm:get-settings')
    set({ settings })
  },
  saveSettings: async (settings) => {
    await window.electronAPI.invoke('pm:set-settings', settings)
    set({ settings })
  },
  saveKeys: async (polygonPrivateKey) => {
    await window.electronAPI.invoke('pm:save-keys', { polygonPrivateKey })
  },
  testConnection: async () => {
    return window.electronAPI.invoke('pm:test-connection')
  },
  fetchLeaderboard: async (timePeriod, limit) => {
    set({ loading: true })
    try {
      const leaderboard = await window.electronAPI.invoke('pm:leaderboard', { timePeriod, limit })
      set({ leaderboard, loading: false })
    } catch {
      set({ loading: false })
    }
  },
  fetchTrackedWallets: async () => {
    const trackedWallets = await window.electronAPI.invoke('pm:tracked-wallets')
    set({ trackedWallets })
  },
  trackWallet: async (proxyWallet, displayName) => {
    await window.electronAPI.invoke('pm:track-wallet', { proxyWallet, displayName })
    await get().fetchTrackedWallets()
  },
  untrackWallet: async (walletId) => {
    await window.electronAPI.invoke('pm:untrack-wallet', { walletId })
    set({ trackedWallets: get().trackedWallets.filter((w) => w.id !== walletId) })
  },
  toggleWallet: async (walletId, isActive) => {
    await window.electronAPI.invoke('pm:toggle-wallet', { walletId, isActive })
    set({
      trackedWallets: get().trackedWallets.map(
        (w) => (w.id === walletId ? { ...w, isActive } : w)
      )
    })
  },
  fetchWalletTrades: async (walletId, limit) => {
    const walletTrades = await window.electronAPI.invoke('pm:wallet-trades', { walletId, limit })
    set({ walletTrades })
  },
  fetchPositions: async () => {
    const positions = await window.electronAPI.invoke('pm:copy-positions')
    set({ positions })
  },
  closePosition: async (positionId) => {
    await window.electronAPI.invoke('pm:close-position', { positionId })
    await get().fetchPositions()
  },
  fetchCopyLog: async (limit) => {
    const copyLog = await window.electronAPI.invoke('pm:copy-log', { limit })
    set({ copyLog })
  },
  fetchStats: async () => {
    const stats = await window.electronAPI.invoke('pm:stats')
    set({ stats })
  },
  start: async () => {
    await window.electronAPI.invoke('pm:start')
    set({ serviceState: { running: true, lastPoll: null, error: null } })
  },
  stop: async () => {
    await window.electronAPI.invoke('pm:stop')
    set({ serviceState: { running: false, lastPoll: null, error: null } })
  },
  fetchState: async () => {
    const serviceState = await window.electronAPI.invoke('pm:state')
    set({ serviceState })
  },
  onTradeDetected: (trade) => {
    set({ walletTrades: [trade, ...get().walletTrades].slice(0, 200) })
  },
  onCopyExecuted: (position) => {
    set({ positions: [position, ...get().positions] })
  },
  onPositionUpdated: (position) => {
    set({
      positions: get().positions.map((p) => (p.id === position.id ? position : p))
    })
  },
  onStateChanged: (serviceState) => {
    set({ serviceState })
  }
}))

// Tabs

const tabs = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'wallets', label: 'Tracked Wallets' },
  { id: 'positions', label: 'Positions' },
  { id: 'settings', label: 'Settings' }
]

export function PolymarketPage() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const store = usePolymarketStore()

  const handleTradeDetected = useCallback((trade: any) => {
    store.onTradeDetected(trade)
  }, [])
  const handleCopyExecuted = useCallback((pos: any) => {
    store.onCopyExecuted(pos)
    store.fetchStats()
  }, [])
  const handlePositionUpdated = useCallback((pos: any) => {
    store.onPositionUpdated(pos)
  }, [])
  const handleStateChanged = useCallback((state: any) => {
    store.onStateChanged(state)
  }, [])

  useIpcEvent('pm:trade-detected', handleTradeDetected)
  useIpcEvent('pm:copy-executed', handleCopyExecuted)
  useIpcEvent('pm:position-updated', handlePositionUpdated)
  useIpcEvent('pm:state-changed', handleStateChanged)

  return (
    <div className="space-y-2">
      <div className="shadow-win-out bg-win-bg p-0.5 flex gap-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1 text-[11px] ${
              activeTab === tab.id ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && <DashboardTab />}
      {activeTab === 'leaderboard' && <LeaderboardTab />}
      {activeTab === 'wallets' && <WalletsTab />}
      {activeTab === 'positions' && <PositionsTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  )
}

function DashboardTab() {
  const { stats, serviceState, fetchStats, start, stop } = usePolymarketStore()

  useEffect(() => {
    fetchStats()
  }, [])

  return (
    <div className="space-y-3">
      <div className="win-groupbox">
        <span className="win-groupbox-label">Service Control</span>
        <div className="mt-2 flex items-center gap-2">
          {serviceState.running ? (
            <button onClick={stop} className="btn-danger">Stop Monitor</button>
          ) : (
            <button onClick={start} className="btn-primary">Start Monitor</button>
          )}
          <span className={`text-[11px] ${serviceState.running ? 'text-success' : 'text-win-dark'}`}>
            {serviceState.running ? 'Running' : 'Stopped'}
          </span>
          {serviceState.error && (
            <span className="text-[10px] text-danger">{serviceState.error}</span>
          )}
        </div>
      </div>

      {stats && (
        <div className="win-groupbox">
          <span className="win-groupbox-label">Performance</span>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <div className="shadow-win-in p-2 text-center">
              <div className="text-[10px] text-win-dark">Total PnL</div>
              <div className={`text-sm font-bold font-sys ${stats.totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
              </div>
            </div>
            <div className="shadow-win-in p-2 text-center">
              <div className="text-[10px] text-win-dark">Win Rate</div>
              <div className="text-sm font-bold font-sys">{(stats.winRate * 100).toFixed(0)}%</div>
            </div>
            <div className="shadow-win-in p-2 text-center">
              <div className="text-[10px] text-win-dark">Open Positions</div>
              <div className="text-sm font-bold font-sys">{stats.openPositions}</div>
            </div>
            <div className="shadow-win-in p-2 text-center">
              <div className="text-[10px] text-win-dark">Exposure</div>
              <div className="text-sm font-bold font-sys">${stats.totalExposure.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      <RecentPositionsPanel />
    </div>
  )
}

function RecentPositionsPanel() {
  const { positions, fetchPositions } = usePolymarketStore()
  useEffect(() => { fetchPositions() }, [])

  const openPositions = positions.filter((p) => p.status === 'open')
  if (openPositions.length === 0) {
    return (
      <div className="win-groupbox">
        <span className="win-groupbox-label">Open Positions</span>
        <EmptyState icon={Activity} title="No open positions" description="Copy trades will appear here when tracked wallets trade." />
      </div>
    )
  }

  return (
    <div className="win-groupbox">
      <span className="win-groupbox-label">Open Positions ({openPositions.length})</span>
      <div className="mt-2 shadow-win-field bg-white max-h-[300px] overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-win-bg sticky top-0">
              <th className="text-left px-1 py-0.5 font-normal border-b border-win-dark">Market</th>
              <th className="text-left px-1 py-0.5 font-normal border-b border-win-dark">Outcome</th>
              <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">Entry</th>
              <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">Current</th>
              <th className="text-center px-1 py-0.5 font-normal border-b border-win-dark">Conv.</th>
              <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">P&L</th>
            </tr>
          </thead>
          <tbody>
            {openPositions.map((pos, i) => (
              <tr key={pos.id} className={i % 2 === 0 ? 'bg-white' : 'bg-win-mid'}>
                <td className="px-1 py-0.5 max-w-[200px] truncate">{pos.marketTitle || pos.tokenId.slice(0, 8)}</td>
                <td className="px-1 py-0.5">{pos.outcome}</td>
                <td className="px-1 py-0.5 text-right font-sys text-[10px]">${pos.entryPrice.toFixed(3)}</td>
                <td className="px-1 py-0.5 text-right font-sys text-[10px]">${pos.currentPrice.toFixed(3)}</td>
                <td className="px-1 py-0.5 text-center">
                  <span className="inline-block bg-win-bg border border-win-dark px-1 text-[9px] font-sys">
                    {pos.consensusScore.toFixed(0)}
                  </span>
                </td>
                <td className={`px-1 py-0.5 text-right font-sys text-[10px] font-bold ${pos.unrealizedPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                  {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LeaderboardTab() {
  const { leaderboard, loading, fetchLeaderboard, trackWallet, trackedWallets, fetchTrackedWallets } = usePolymarketStore()
  const [timePeriod, setTimePeriod] = useState('WEEK')

  useEffect(() => {
    fetchLeaderboard(timePeriod, 50)
    fetchTrackedWallets()
  }, [timePeriod])

  const trackedSet = new Set(trackedWallets.map((w) => w.proxyWallet))

  const handleTrack = async (proxyWallet: string, displayName: string) => {
    try {
      await trackWallet(proxyWallet, displayName)
      toast.success(`Tracking ${displayName || proxyWallet.slice(0, 8)}`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed')
    }
  }

  return (
    <div className="space-y-2">
      <div className="shadow-win-out bg-win-bg p-1 flex gap-1 items-center">
        <span className="text-[11px] px-1">Time Period:</span>
        {['DAY', 'WEEK', 'MONTH', 'ALL'].map((tp) => (
          <button key={tp} onClick={() => setTimePeriod(tp)} className={`px-2 py-0.5 text-[11px] ${timePeriod === tp ? 'btn-primary' : 'btn-secondary'}`}>
            {tp}
          </button>
        ))}
        <div className="flex-1" />
        {loading && <Spinner />}
      </div>

      {leaderboard.length === 0 && !loading ? (
        <EmptyState icon={Trophy} title="No data" description="Failed to load leaderboard. Try again." />
      ) : (
        <div className="shadow-win-field bg-white max-h-[500px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-win-bg sticky top-0">
                <th className="text-center px-1 py-0.5 font-normal border-b border-win-dark">#</th>
                <th className="text-left px-1 py-0.5 font-normal border-b border-win-dark">Name</th>
                <th className="text-left px-1 py-0.5 font-normal border-b border-win-dark">Wallet</th>
                <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">PnL</th>
                <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">Volume</th>
                <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">Win Rate</th>
                <th className="text-center px-1 py-0.5 font-normal border-b border-win-dark">Action</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, i) => (
                <tr key={entry.proxyWallet} className={i % 2 === 0 ? 'bg-white' : 'bg-win-mid'}>
                  <td className="px-1 py-0.5 text-center">{entry.rank}</td>
                  <td className="px-1 py-0.5">{entry.displayName || '-'}</td>
                  <td className="px-1 py-0.5 font-sys text-[10px]">{entry.proxyWallet.slice(0, 6)}...{entry.proxyWallet.slice(-4)}</td>
                  <td className={`px-1 py-0.5 text-right font-sys text-[10px] ${entry.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                    ${entry.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-1 py-0.5 text-right font-sys text-[10px]">
                    ${entry.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-1 py-0.5 text-right font-sys text-[10px]">{(entry.winRate * 100).toFixed(0)}%</td>
                  <td className="px-1 py-0.5 text-center">
                    {trackedSet.has(entry.proxyWallet) ? (
                      <span className="text-[10px] text-success">Tracked</span>
                    ) : (
                      <button onClick={() => handleTrack(entry.proxyWallet, entry.displayName)} className="btn-secondary text-[10px] px-1 py-0">
                        Track
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function WalletsTab() {
  const { trackedWallets, fetchTrackedWallets, untrackWallet, toggleWallet, fetchWalletTrades, walletTrades } = usePolymarketStore()
  const [addInput, setAddInput] = useState('')
  const [addName, setAddName] = useState('')
  const [expandedWallet, setExpandedWallet] = useState<number | null>(null)

  useEffect(() => { fetchTrackedWallets() }, [])
  useEffect(() => {
    if (expandedWallet !== null) {
      fetchWalletTrades(expandedWallet, 20)
    }
  }, [expandedWallet])

  const handleAdd = async () => {
    if (!addInput.trim()) return
    try {
      await usePolymarketStore.getState().trackWallet(addInput.trim(), addName.trim())
      setAddInput('')
      setAddName('')
      toast.success('Wallet added')
    } catch (err: any) {
      toast.error(err?.message || 'Failed')
    }
  }

  const handleUntrack = async (walletId: number) => {
    await untrackWallet(walletId)
    toast.success('Wallet removed')
  }

  const handleToggle = async (walletId: number, isActive: boolean) => {
    await toggleWallet(walletId, isActive)
  }

  return (
    <div className="space-y-2">
      <div className="win-groupbox">
        <span className="win-groupbox-label">Add Manual Wallet</span>
        <div className="mt-2 flex gap-1 items-end">
          <div className="flex-1">
            <label className="label">Proxy Wallet Address:</label>
            <input className="input w-full" value={addInput} onChange={(e) => setAddInput(e.target.value)} placeholder="0x..." />
          </div>
          <div className="w-32">
            <label className="label">Label:</label>
            <input className="input w-full" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Optional" />
          </div>
          <button onClick={handleAdd} disabled={!addInput.trim()} className="btn-primary">
            <Plus className="w-3 h-3 inline mr-0.5" />Add
          </button>
        </div>
      </div>

      {trackedWallets.length === 0 ? (
        <EmptyState icon={Users} title="No tracked wallets" description="Add wallets manually or track them from the Leaderboard tab." />
      ) : (
        <div className="shadow-win-field bg-white">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-win-bg">
                <th className="text-left px-1 py-0.5 font-normal border-b border-win-dark">Name</th>
                <th className="text-left px-1 py-0.5 font-normal border-b border-win-dark">Wallet</th>
                <th className="text-left px-1 py-0.5 font-normal border-b border-win-dark">Source</th>
                <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">PnL</th>
                <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">Win Rate</th>
                <th className="text-center px-1 py-0.5 font-normal border-b border-win-dark">Active</th>
                <th className="text-center px-1 py-0.5 font-normal border-b border-win-dark">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trackedWallets.map((wallet, i) => (
                <React.Fragment key={wallet.id}>
                  <tr className={i % 2 === 0 ? 'bg-white' : 'bg-win-mid'}>
                    <td className="px-1 py-0.5">{wallet.displayName || '-'}</td>
                    <td className="px-1 py-0.5 font-sys text-[10px]">{wallet.proxyWallet.slice(0, 6)}...{wallet.proxyWallet.slice(-4)}</td>
                    <td className="px-1 py-0.5">{wallet.source}</td>
                    <td className={`px-1 py-0.5 text-right font-sys text-[10px] ${wallet.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                      ${wallet.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-1 py-0.5 text-right font-sys text-[10px]">{(wallet.winRate * 100).toFixed(0)}%</td>
                    <td className="px-1 py-0.5 text-center">
                      <button onClick={() => handleToggle(wallet.id, !wallet.isActive)}>
                        {wallet.isActive ? <Eye className="w-3 h-3 text-success inline" /> : <EyeOff className="w-3 h-3 text-win-dark inline" />}
                      </button>
                    </td>
                    <td className="px-1 py-0.5 text-center flex gap-1 justify-center">
                      <button onClick={() => setExpandedWallet(expandedWallet === wallet.id ? null : wallet.id)} className="btn-secondary text-[10px] px-1 py-0">
                        Trades
                      </button>
                      <button onClick={() => handleUntrack(wallet.id)} className="text-danger">
                        <Trash2 className="w-3 h-3 inline" />
                      </button>
                    </td>
                  </tr>
                  {expandedWallet === wallet.id && (
                    <tr key={`${wallet.id}-trades`}>
                      <td colSpan={7} className="p-1 bg-win-bg">
                        <WalletTradesPanel trades={walletTrades.filter((t) => t.walletId === wallet.id)} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function WalletTradesPanel({ trades }: { trades: PmWalletTrade[] }) {
  if (trades.length === 0) {
    return <p className="text-[10px] text-win-dark px-1">No trades detected yet.</p>
  }

  return (
    <div className="shadow-win-field bg-white max-h-[150px] overflow-y-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-win-bg">
            <th className="text-left px-1 py-0.5 font-normal">Side</th>
            <th className="text-left px-1 py-0.5 font-normal">Market</th>
            <th className="text-left px-1 py-0.5 font-normal">Outcome</th>
            <th className="text-right px-1 py-0.5 font-normal">Price</th>
            <th className="text-right px-1 py-0.5 font-normal">Size</th>
            <th className="text-left px-1 py-0.5 font-normal">Time</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, i) => (
            <tr key={trade.id} className={i % 2 === 0 ? 'bg-white' : 'bg-win-mid'}>
              <td className="px-1 py-0.5">
                <span className={trade.side === 'BUY' ? 'text-success font-bold' : 'text-danger font-bold'}>{trade.side}</span>
              </td>
              <td className="px-1 py-0.5 max-w-[150px] truncate">{trade.marketTitle || trade.conditionId.slice(0, 8)}</td>
              <td className="px-1 py-0.5">{trade.outcome}</td>
              <td className="px-1 py-0.5 text-right font-sys">${trade.price.toFixed(3)}</td>
              <td className="px-1 py-0.5 text-right font-sys">{trade.size.toFixed(1)}</td>
              <td className="px-1 py-0.5 font-sys">{new Date(trade.timestamp * 1000).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PositionsTab() {
  const { positions, copyLog, fetchPositions, fetchCopyLog, closePosition } = usePolymarketStore()
  const [closing, setClosing] = useState<string | null>(null)

  useEffect(() => {
    fetchPositions()
    fetchCopyLog(50)
  }, [])

  const handleClose = async (positionId: string) => {
    setClosing(positionId)
    try {
      await closePosition(positionId)
      toast.success('Position closed')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to close')
    }
    setClosing(null)
  }

  const openPositions = positions.filter((p) => p.status === 'open')

  return (
    <div className="space-y-3">
      <div className="win-groupbox">
        <span className="win-groupbox-label">Open Positions ({openPositions.length})</span>
        <div className="mt-2">
          {openPositions.length === 0 ? (
            <EmptyState icon={Activity} title="No open positions" description="Positions will appear when copy trades execute." />
          ) : (
            <div className="shadow-win-field bg-white max-h-[300px] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-win-bg sticky top-0">
                    <th className="text-left px-1 py-0.5 font-normal border-b border-win-dark">Market</th>
                    <th className="text-left px-1 py-0.5 font-normal border-b border-win-dark">Outcome</th>
                    <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">Entry</th>
                    <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">Current</th>
                    <th className="text-center px-1 py-0.5 font-normal border-b border-win-dark">Conv.</th>
                    <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">Size</th>
                    <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">P&L</th>
                    <th className="text-center px-1 py-0.5 font-normal border-b border-win-dark">Close</th>
                  </tr>
                </thead>
                <tbody>
                  {openPositions.map((pos, i) => (
                    <tr key={pos.id} className={i % 2 === 0 ? 'bg-white' : 'bg-win-mid'}>
                      <td className="px-1 py-0.5 max-w-[200px] truncate">{pos.marketTitle || pos.tokenId.slice(0, 8)}</td>
                      <td className="px-1 py-0.5">{pos.outcome}</td>
                      <td className="px-1 py-0.5 text-right font-sys text-[10px]">${pos.entryPrice.toFixed(3)}</td>
                      <td className="px-1 py-0.5 text-right font-sys text-[10px]">${pos.currentPrice.toFixed(3)}</td>
                      <td className="px-1 py-0.5 text-center">
                        <span className="inline-block bg-win-bg border border-win-dark px-1 text-[9px] font-sys">
                          {pos.consensusScore.toFixed(0)}
                        </span>
                      </td>
                      <td className="px-1 py-0.5 text-right font-sys text-[10px]">{pos.size.toFixed(1)}</td>
                      <td className={`px-1 py-0.5 text-right font-sys text-[10px] font-bold ${pos.unrealizedPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                      </td>
                      <td className="px-1 py-0.5 text-center">
                        <button
                          onClick={() => handleClose(pos.id)}
                          disabled={closing === pos.id}
                          className="btn-danger text-[10px] px-1 py-0"
                        >
                          {closing === pos.id ? <Spinner /> : <X className="w-3 h-3 inline" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="win-groupbox">
        <span className="win-groupbox-label">Trade History</span>
        <div className="mt-2">
          {copyLog.length === 0 ? (
            <EmptyState icon={ChartColumn} title="No completed trades" description="Closed positions will be logged here." />
          ) : (
            <div className="shadow-win-field bg-white max-h-[250px] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-win-bg sticky top-0">
                    <th className="text-left px-1 py-0.5 font-normal border-b border-win-dark">Market</th>
                    <th className="text-left px-1 py-0.5 font-normal border-b border-win-dark">Outcome</th>
                    <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">Entry</th>
                    <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">Exit</th>
                    <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">PnL</th>
                    <th className="text-right px-1 py-0.5 font-normal border-b border-win-dark">%</th>
                    <th className="text-left px-1 py-0.5 font-normal border-b border-win-dark">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {copyLog.map((entry, i) => (
                    <tr key={entry.id} className={i % 2 === 0 ? 'bg-white' : 'bg-win-mid'}>
                      <td className="px-1 py-0.5 max-w-[180px] truncate">{entry.marketTitle}</td>
                      <td className="px-1 py-0.5">{entry.outcome}</td>
                      <td className="px-1 py-0.5 text-right font-sys text-[10px]">${entry.entryPrice.toFixed(3)}</td>
                      <td className="px-1 py-0.5 text-right font-sys text-[10px]">${entry.exitPrice.toFixed(3)}</td>
                      <td className={`px-1 py-0.5 text-right font-sys text-[10px] font-bold ${entry.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                        {entry.pnl >= 0 ? '+' : ''}${entry.pnl.toFixed(2)}
                      </td>
                      <td className={`px-1 py-0.5 text-right font-sys text-[10px] ${entry.pnlPct >= 0 ? 'text-success' : 'text-danger'}`}>
                        {entry.pnlPct >= 0 ? '+' : ''}{entry.pnlPct.toFixed(1)}%
                      </td>
                      <td className="px-1 py-0.5">{entry.closeReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingsTab() {
  const { settings, fetchSettings, saveSettings, saveKeys, testConnection } = usePolymarketStore()
  const [privateKey, setPrivateKey] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; balance: number } | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<PmCopySettings | null>(null)

  useEffect(() => { fetchSettings() }, [])
  useEffect(() => {
    if (settings && !form) setForm({ ...settings })
  }, [settings])

  const handleSaveKey = async () => {
    if (!privateKey.trim()) return
    setSaving(true)
    try {
      await saveKeys(privateKey.trim())
      setPrivateKey('')
      toast.success('Key saved')
    } catch (err: any) {
      toast.error(err?.message || 'Failed')
    }
    setSaving(false)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testConnection()
      setTestResult(result)
      toast[result.ok ? 'success' : 'error'](
        result.ok ? `Connected — $${result.balance.toFixed(2)} USDC` : 'Connection failed'
      )
    } catch {
      setTestResult({ ok: false, balance: 0 })
      toast.error('Test failed')
    }
    setTesting(false)
  }

  const handleSaveSettings = async () => {
    if (!form) return
    setSaving(true)
    try {
      await saveSettings(form)
      toast.success('Settings saved')
    } catch (err: any) {
      toast.error(err?.message || 'Failed')
    }
    setSaving(false)
  }

  const updateForm = (key: keyof PmCopySettings, value: any) => {
    if (form) setForm({ ...form, [key]: value })
  }

  if (!form) return null

  return (
    <div className="space-y-3 max-w-lg">
      <div className="win-groupbox">
        <span className="win-groupbox-label">Polygon Private Key</span>
        <div className="mt-2 space-y-2">
          <div>
            <label className="label">Private Key (hex):</label>
            <div className="flex gap-1">
              <input className="input flex-1" type="password" value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="0x..." />
              <button onClick={handleSaveKey} disabled={saving || !privateKey.trim()} className="btn-primary">
                {saving ? <Spinner /> : 'Save'}
              </button>
            </div>
          </div>
          <div className="flex gap-1 items-center">
            <button onClick={handleTest} disabled={testing} className="btn-secondary">
              {testing ? <Spinner /> : 'Test Connection'}
            </button>
            {testResult && (
              <span className={`text-[11px] ${testResult.ok ? 'text-success' : 'text-danger'}`}>
                {testResult.ok ? `OK — $${testResult.balance.toFixed(2)} USDC` : 'Failed'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="win-groupbox">
        <span className="win-groupbox-label">Copy Size</span>
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <label className="flex items-center gap-1 text-[11px]">
              <input type="radio" checked={form.sizeMode === 'percentage'} onChange={() => updateForm('sizeMode', 'percentage')} />
              Percentage of source
            </label>
            <label className="flex items-center gap-1 text-[11px]">
              <input type="radio" checked={form.sizeMode === 'fixed'} onChange={() => updateForm('sizeMode', 'fixed')} />
              Fixed USDC
            </label>
          </div>
          {form.sizeMode === 'percentage' ? (
            <div>
              <label className="label">Percentage: {form.sizePercentage}%</label>
              <input type="range" className="w-full" value={form.sizePercentage} min={1} max={500} step={5} onChange={(e) => updateForm('sizePercentage', parseInt(e.target.value))} />
            </div>
          ) : (
            <div>
              <label className="label">Amount (USDC):</label>
              <input type="number" className="input" value={form.fixedSizeUsdc} onChange={(e) => updateForm('fixedSizeUsdc', parseFloat(e.target.value) || 0)} min={0.01} step={1} />
            </div>
          )}
        </div>
      </div>

      <div className="win-groupbox">
        <span className="win-groupbox-label">Risk Controls</span>
        <div className="mt-2 space-y-2">
          <div>
            <label className="label">Max Total Exposure (USDC):</label>
            <input type="number" className="input" value={form.maxExposureUsdc} onChange={(e) => updateForm('maxExposureUsdc', parseFloat(e.target.value) || 0)} min={1} />
          </div>
          <div>
            <label className="label">Max Positions Per Wallet:</label>
            <input type="number" className="input" value={form.maxPositionsPerWallet} onChange={(e) => updateForm('maxPositionsPerWallet', parseInt(e.target.value) || 1)} min={1} max={100} />
          </div>
          <label className="flex items-center gap-1 text-[11px]">
            <input type="checkbox" checked={form.copyExits} onChange={(e) => updateForm('copyExits', e.target.checked)} />
            Copy exit trades (sell when tracked wallet sells)
          </label>
        </div>
      </div>

      <div className="win-groupbox">
        <span className="win-groupbox-label">Auto-Track Leaderboard</span>
        <div className="mt-2 space-y-2">
          <div>
            <label className="label">Auto-Track Top N Wallets (0 = disabled):</label>
            <input type="number" className="input" value={form.autoTrackTopN} onChange={(e) => updateForm('autoTrackTopN', parseInt(e.target.value) || 0)} min={0} max={100} />
          </div>
          <div>
            <label className="label">Min Win Rate:</label>
            <input type="number" className="input" value={form.leaderboardMinWinRate} onChange={(e) => updateForm('leaderboardMinWinRate', parseFloat(e.target.value) || 0)} min={0} max={1} step={0.05} />
          </div>
          <div>
            <label className="label">Min PnL ($):</label>
            <input type="number" className="input" value={form.leaderboardMinPnl} onChange={(e) => updateForm('leaderboardMinPnl', parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="label">Time Period:</label>
            <select className="input" value={form.leaderboardTimePeriod} onChange={(e) => updateForm('leaderboardTimePeriod', e.target.value)}>
              <option value="DAY">Day</option>
              <option value="WEEK">Week</option>
              <option value="MONTH">Month</option>
              <option value="ALL">All Time</option>
            </select>
          </div>
        </div>
      </div>

      <div className="win-groupbox">
        <span className="win-groupbox-label">Poll Interval</span>
        <div className="mt-2">
          <label className="label">Interval (seconds): {form.pollIntervalSeconds}s</label>
          <input type="range" className="w-full" value={form.pollIntervalSeconds} min={5} max={60} step={5} onChange={(e) => updateForm('pollIntervalSeconds', parseInt(e.target.value))} />
        </div>
      </div>

      <button onClick={handleSaveSettings} disabled={saving} className="btn-primary">
        {saving ? <Spinner /> : 'Save All Settings'}
      </button>
    </div>
  )
}
