import { ipcMain } from 'electron'
import { z } from 'zod'
import { getDb } from '../storage/database'
import { getPmCopyExecutor } from '../services/pm-copy-executor'
import { getPolymarketAdapter, savePolygonPrivateKey } from '../services/polymarket-adapter'
import {
  fetchLeaderboard,
  startWalletMonitor,
  stopWalletMonitor,
  startLeaderboardScanner,
  stopLeaderboardScanner,
  getWalletMonitorState
} from '../services/pm-wallet-monitor'
import type { PmCopyPosition, PmCopyLogEntry, PmWalletTrade, PmTrackedWallet } from '@shared/types/polymarket'

function mapWalletRow(row: any): PmTrackedWallet {
  return {
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
}

function mapTradeRow(row: any): PmWalletTrade {
  return {
    id: row.id,
    walletId: row.wallet_id,
    conditionId: row.condition_id,
    tokenId: row.token_id,
    side: row.side,
    outcome: row.outcome,
    price: row.price,
    size: row.size,
    marketTitle: row.market_title,
    timestamp: row.timestamp
  }
}

function mapPositionRow(row: any): PmCopyPosition {
  return {
    id: row.id,
    sourceTradeId: row.source_trade_id,
    walletId: row.wallet_id,
    tokenId: row.token_id,
    marketTitle: row.market_title,
    outcome: row.outcome,
    side: row.side,
    entryPrice: row.entry_price,
    currentPrice: row.current_price,
    size: row.size,
    costBasis: row.cost_basis,
    consensusScore: row.consensus_score,
    unrealizedPnl: row.unrealized_pnl,
    realizedPnl: row.realized_pnl,
    status: row.status,
    closeReason: row.close_reason,
    clobOrderId: row.clob_order_id,
    openedAt: row.opened_at,
    closedAt: row.closed_at
  }
}

function mapLogRow(row: any): PmCopyLogEntry {
  return {
    id: row.id,
    positionId: row.position_id,
    walletId: row.wallet_id,
    walletName: row.wallet_name,
    marketTitle: row.market_title,
    outcome: row.outcome,
    side: row.side,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    size: row.size,
    pnl: row.pnl,
    pnlPct: row.pnl_pct,
    duration: row.duration,
    closeReason: row.close_reason,
    openedAt: row.opened_at,
    closedAt: row.closed_at
  }
}

export function registerPolymarketIpc(): void {
  ipcMain.handle('pm:get-settings', async () => {
    return getPmCopyExecutor().getSettings()
  })

  ipcMain.handle('pm:set-settings', async (_event, params) => {
    const settings = z.object({
      enabled: z.boolean(),
      sizeMode: z.enum(['percentage', 'fixed']),
      sizePercentage: z.number().min(1).max(1000),
      fixedSizeUsdc: z.number().min(0.01),
      maxExposureUsdc: z.number().min(1),
      maxPositionsPerWallet: z.number().min(1).max(100),
      autoTrackTopN: z.number().min(0).max(100),
      leaderboardMinWinRate: z.number().min(0).max(1),
      leaderboardMinPnl: z.number(),
      leaderboardTimePeriod: z.enum(['DAY', 'WEEK', 'MONTH', 'ALL']),
      pollIntervalSeconds: z.number().min(5).max(300),
      copyExits: z.boolean()
    }).parse(params)
    getPmCopyExecutor().saveSettings(settings)
  })

  ipcMain.handle('pm:save-keys', async (_event, params) => {
    const { polygonPrivateKey } = z.object({
      polygonPrivateKey: z.string().min(1)
    }).parse(params)
    savePolygonPrivateKey(polygonPrivateKey)
    const adapter = getPolymarketAdapter()
    adapter.destroy()
  })

  ipcMain.handle('pm:test-connection', async () => {
    const adapter = getPolymarketAdapter()
    try {
      if (!adapter.isInitialized()) await adapter.init()
      const balance = await adapter.getBalance()
      return { ok: true, balance }
    } catch {
      return { ok: false, balance: 0 }
    }
  })

  ipcMain.handle('pm:leaderboard', async (_event, params) => {
    const { timePeriod, limit } = z.object({
      timePeriod: z.enum(['DAY', 'WEEK', 'MONTH', 'ALL']).optional(),
      limit: z.number().min(1).max(200).optional()
    }).parse(params || {})
    return fetchLeaderboard({ timePeriod, limit })
  })

  ipcMain.handle('pm:tracked-wallets', async () => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM pm_tracked_wallets ORDER BY rank ASC, added_at DESC').all()
    return rows.map(mapWalletRow)
  })

  ipcMain.handle('pm:track-wallet', async (_event, params) => {
    const { proxyWallet, displayName } = z.object({
      proxyWallet: z.string().min(1),
      displayName: z.string()
    }).parse(params)
    const db = getDb()
    db.prepare(`
      INSERT INTO pm_tracked_wallets (proxy_wallet, display_name, source, is_active)
      VALUES (?, ?, 'manual', 1)
      ON CONFLICT(proxy_wallet) DO UPDATE SET display_name = excluded.display_name, is_active = 1
    `).run(proxyWallet, displayName)
    const row = db.prepare('SELECT * FROM pm_tracked_wallets WHERE proxy_wallet = ?').get(proxyWallet)
    return mapWalletRow(row)
  })

  ipcMain.handle('pm:untrack-wallet', async (_event, params) => {
    const { walletId } = z.object({ walletId: z.number() }).parse(params)
    const db = getDb()
    db.prepare('DELETE FROM pm_tracked_wallets WHERE id = ?').run(walletId)
  })

  ipcMain.handle('pm:toggle-wallet', async (_event, params) => {
    const { walletId, isActive } = z.object({
      walletId: z.number(),
      isActive: z.boolean()
    }).parse(params)
    const db = getDb()
    db.prepare('UPDATE pm_tracked_wallets SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, walletId)
  })

  ipcMain.handle('pm:wallet-trades', async (_event, params) => {
    const { walletId, limit } = z.object({
      walletId: z.number(),
      limit: z.number().min(1).max(500).optional()
    }).parse(params)
    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM pm_wallet_trades WHERE wallet_id = ? ORDER BY timestamp DESC LIMIT ?')
      .all(walletId, limit || 50)
    return rows.map(mapTradeRow)
  })

  ipcMain.handle('pm:copy-positions', async () => {
    const db = getDb()
    const rows = db
      .prepare("SELECT * FROM pm_copy_positions ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, opened_at DESC")
      .all()
    return rows.map(mapPositionRow)
  })

  ipcMain.handle('pm:close-position', async (_event, params) => {
    const { positionId } = z.object({ positionId: z.string() }).parse(params)
    await getPmCopyExecutor().closePosition(positionId)
  })

  ipcMain.handle('pm:copy-log', async (_event, params) => {
    const { limit } = z.object({
      limit: z.number().min(1).max(500).optional()
    }).parse(params || {})
    const db = getDb()
    const rows = db.prepare('SELECT * FROM pm_copy_log ORDER BY closed_at DESC LIMIT ?').all(limit || 100)
    return rows.map(mapLogRow)
  })

  ipcMain.handle('pm:stats', async () => {
    return getPmCopyExecutor().getStats()
  })

  ipcMain.handle('pm:start', async () => {
    const settings = getPmCopyExecutor().getSettings()
    const adapter = getPolymarketAdapter()
    if (!adapter.isInitialized()) await adapter.init()
    startWalletMonitor(settings.pollIntervalSeconds)
    getPmCopyExecutor().startPriceRefresh()
    if (settings.autoTrackTopN > 0) {
      startLeaderboardScanner(60, settings)
    }
  })

  ipcMain.handle('pm:stop', async () => {
    stopWalletMonitor()
    stopLeaderboardScanner()
    getPmCopyExecutor().stopPriceRefresh()
  })

  ipcMain.handle('pm:state', async () => {
    return getWalletMonitorState()
  })
}
