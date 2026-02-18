import { getDb } from '../storage/database'
import { getMainWindow } from '../index'
import { getPmCopyExecutor } from './pm-copy-executor'
import type { PmCopySettings, PmTrackedWallet, PmServiceState } from '@shared/types/polymarket'

const DATA_API = 'https://data-api.polymarket.com'
const GAMMA_API = 'https://gamma-api.polymarket.com'

const marketTitleCache = new Map<string, string>()
let state: PmServiceState = { running: false, lastPoll: null, error: null }
let pollTimer: ReturnType<typeof setInterval> | null = null

export function getWalletMonitorState(): PmServiceState {
  return { ...state }
}

async function fetchMarketTitle(conditionId: string): Promise<string> {
  if (marketTitleCache.has(conditionId)) return marketTitleCache.get(conditionId)!
  try {
    const res = await fetch(`${GAMMA_API}/markets?condition_id=${conditionId}`)
    if (res.ok) {
      const data = await res.json()
      const title = data?.[0]?.question || data?.[0]?.title || ''
      if (title) marketTitleCache.set(conditionId, title)
      return title
    }
  } catch {}
  return ''
}

interface RawWallet {
  id: number
  proxyWallet: string
  displayName: string
  source: string
  winRate: number
  pnl: number
  volume: number
  rank: number
  isActive: boolean
  lastTradeCheck: number | null
  addedAt: number
}

async function pollWallet(wallet: RawWallet): Promise<any[]> {
  const res = await fetch(`${DATA_API}/trades?user=${wallet.proxyWallet}&limit=20`)
  if (!res.ok) throw new Error(`Trade fetch failed for ${wallet.proxyWallet}: ${res.status}`)
  const trades = await res.json()
  if (!Array.isArray(trades)) return []

  const db = getDb()
  const newTrades: any[] = []

  for (const raw of trades) {
    const tradeId = String(raw.id || raw.tradeId || raw.trade_id)
    const conditionId = raw.conditionId || raw.condition_id || raw.market || ''
    const marketTitle = await fetchMarketTitle(conditionId)

    const trade = {
      id: tradeId,
      walletId: wallet.id,
      conditionId,
      tokenId: raw.tokenId || raw.token_id || raw.asset || '',
      side: ((raw.side || '') as string).toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
      outcome: raw.outcome || raw.outcomeName || '',
      price: Number(raw.price || 0),
      size: Number(raw.size || raw.amount || 0),
      marketTitle,
      timestamp: raw.timestamp
        ? new Date(raw.timestamp).getTime() / 1000
        : Math.floor(Date.now() / 1000)
    }

    const result = db
      .prepare(
        `INSERT OR IGNORE INTO pm_wallet_trades (id, wallet_id, condition_id, token_id, side, outcome, price, size, market_title, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        trade.id, trade.walletId, trade.conditionId, trade.tokenId,
        trade.side, trade.outcome, trade.price, trade.size,
        trade.marketTitle, trade.timestamp
      )

    if (result.changes > 0) {
      newTrades.push(trade)
    }
  }

  db.prepare('UPDATE pm_tracked_wallets SET last_trade_check = ? WHERE id = ?').run(
    Math.floor(Date.now() / 1000),
    wallet.id
  )

  return newTrades
}

async function pollAllWallets(): Promise<void> {
  const db = getDb()
  const wallets = db.prepare('SELECT * FROM pm_tracked_wallets WHERE is_active = 1').all() as any[]
  const mainWindow = getMainWindow()

  for (const row of wallets) {
    try {
      const wallet: RawWallet = {
        id: row.id,
        proxyWallet: row.proxy_wallet,
        displayName: row.display_name,
        source: row.source,
        winRate: row.win_rate,
        pnl: row.pnl,
        volume: row.volume,
        rank: row.rank,
        isActive: !!row.is_active,
        lastTradeCheck: row.last_trade_check,
        addedAt: row.added_at
      }

      const newTrades = await pollWallet(wallet)
      for (const trade of newTrades) {
        mainWindow?.webContents.send('pm:trade-detected', trade)
        getPmCopyExecutor().handleNewTrade(trade)
      }
    } catch (err) {
      console.error(`Poll failed for wallet ${row.proxy_wallet}:`, err)
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  state.lastPoll = Date.now()
  state.error = null
}

function broadcastState(): void {
  const mainWindow = getMainWindow()
  mainWindow?.webContents.send('pm:state-changed', getWalletMonitorState())
}

export function startWalletMonitor(intervalSeconds: number): void {
  stopWalletMonitor()
  state = { running: true, lastPoll: null, error: null }
  broadcastState()

  pollAllWallets().catch((err) => {
    state.error = err?.message || 'Poll failed'
    broadcastState()
  })

  pollTimer = setInterval(() => {
    pollAllWallets().catch((err) => {
      state.error = err?.message || 'Poll failed'
      broadcastState()
    })
  }, intervalSeconds * 1000)
}

export function stopWalletMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  state = { running: false, lastPoll: state.lastPoll, error: null }
  broadcastState()
}

// Leaderboard

export async function fetchLeaderboard(params: { timePeriod?: string; limit?: number }): Promise<any[]> {
  const timePeriod = params.timePeriod || 'WEEK'
  const limit = params.limit || 50
  const url = `${DATA_API}/v1/leaderboard?timePeriod=${timePeriod}&orderBy=PNL&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Leaderboard fetch failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) return []
  return data.map((entry: any, i: number) => ({
    rank: i + 1,
    proxyWallet: entry.proxyWallet || entry.address || '',
    displayName: entry.displayName || entry.username || entry.proxyWallet?.slice(0, 8) || '',
    pnl: Number(entry.pnl || 0),
    volume: Number(entry.volume || 0),
    winRate: Number(entry.winRate || entry.win_rate || 0)
  }))
}

function autoTrackTopWallets(settings: PmCopySettings): void {
  if (settings.autoTrackTopN <= 0) return
  const db = getDb()

  fetchLeaderboard({
    timePeriod: settings.leaderboardTimePeriod,
    limit: settings.autoTrackTopN * 2
  })
    .then((entries) => {
      const filtered = entries.filter(
        (e: any) => e.winRate >= settings.leaderboardMinWinRate && e.pnl >= settings.leaderboardMinPnl
      )
      const topN = filtered.slice(0, settings.autoTrackTopN)
      const topWallets = new Set(topN.map((e: any) => e.proxyWallet))

      const upsert = db.prepare(`
        INSERT INTO pm_tracked_wallets (proxy_wallet, display_name, source, win_rate, pnl, volume, rank, is_active)
        VALUES (?, ?, 'leaderboard', ?, ?, ?, ?, 1)
        ON CONFLICT(proxy_wallet) DO UPDATE SET
          display_name = excluded.display_name,
          win_rate = excluded.win_rate,
          pnl = excluded.pnl,
          volume = excluded.volume,
          rank = excluded.rank
      `)

      for (const entry of topN) {
        upsert.run(entry.proxyWallet, entry.displayName, entry.winRate, entry.pnl, entry.volume, entry.rank)
      }

      const existing = db
        .prepare("SELECT id, proxy_wallet FROM pm_tracked_wallets WHERE source = 'leaderboard' AND is_active = 1")
        .all() as any[]
      const deactivate = db.prepare('UPDATE pm_tracked_wallets SET is_active = 0 WHERE id = ?')
      for (const row of existing) {
        if (!topWallets.has(row.proxy_wallet)) {
          deactivate.run(row.id)
        }
      }
    })
    .catch((err) => {
      console.error('Auto-track leaderboard failed:', err)
    })
}

let scannerTimer: ReturnType<typeof setInterval> | null = null

export function startLeaderboardScanner(intervalMinutes: number, settings: PmCopySettings): void {
  stopLeaderboardScanner()
  autoTrackTopWallets(settings)
  scannerTimer = setInterval(() => autoTrackTopWallets(settings), intervalMinutes * 60 * 1000)
}

export function stopLeaderboardScanner(): void {
  if (scannerTimer) {
    clearInterval(scannerTimer)
    scannerTimer = null
  }
}
