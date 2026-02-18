import { randomUUID } from 'crypto'
import { getDb } from '../storage/database'
import { getMainWindow } from '../index'
import { getPolymarketAdapter } from './polymarket-adapter'
import { getTelegramNotifier } from './telegram-notifier'
import type { PmCopySettings, PmCopyPosition, PmCopyStats } from '@shared/types/polymarket'

const DEFAULT_SETTINGS: PmCopySettings = {
  enabled: false,
  sizeMode: 'percentage',
  sizePercentage: 100,
  fixedSizeUsdc: 10,
  maxExposureUsdc: 500,
  maxPositionsPerWallet: 5,
  autoTrackTopN: 0,
  leaderboardMinWinRate: 0.5,
  leaderboardMinPnl: 100,
  leaderboardTimePeriod: 'WEEK',
  pollIntervalSeconds: 10,
  copyExits: true
}

export class PmCopyExecutor {
  private priceRefreshTimer: ReturnType<typeof setInterval> | null = null

  getSettings(): PmCopySettings {
    const db = getDb()
    const row = db.prepare("SELECT value FROM settings WHERE key = 'pm_copy_settings'").get() as { value: string } | undefined
    if (!row) return { ...DEFAULT_SETTINGS }
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  saveSettings(settings: PmCopySettings): void {
    const db = getDb()
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      'pm_copy_settings',
      JSON.stringify(settings)
    )
  }

  async handleNewTrade(trade: any): Promise<void> {
    const settings = this.getSettings()
    if (!settings.enabled) return

    const adapter = getPolymarketAdapter()
    if (!adapter.isInitialized()) return

    if (trade.side === 'SELL' && settings.copyExits) {
      await this.handleExit(trade, settings)
      return
    }

    if (trade.side === 'BUY') {
      await this.handleEntry(trade, settings)
    }
  }

  private async handleEntry(trade: any, settings: PmCopySettings): Promise<void> {
    const db = getDb()
    const adapter = getPolymarketAdapter()
    const mainWindow = getMainWindow()

    // Calculate consensus score: how many active tracked wallets recently bought the same token
    const consensusScore = this.calculateConsensusScore(trade.tokenId, trade.walletId)

    const openPositions = db
      .prepare("SELECT SUM(cost_basis) as total FROM pm_copy_positions WHERE status = 'open'")
      .get() as { total: number | null }
    const currentExposure = openPositions?.total || 0

    if (currentExposure >= settings.maxExposureUsdc) {
      // Smart liquidation: close profitable low-conviction positions to make room
      let amount: number
      if (settings.sizeMode === 'percentage') {
        amount = trade.size * trade.price * (settings.sizePercentage / 100)
      } else {
        amount = settings.fixedSizeUsdc
      }
      const neededCapital = Math.min(amount, settings.maxExposureUsdc)

      const allOpenPositions = db
        .prepare("SELECT * FROM pm_copy_positions WHERE status = 'open'")
        .all() as any[]

      const candidates = allOpenPositions
        .filter((p: any) => p.unrealized_pnl > 0)
        .filter((p: any) => p.consensus_score < consensusScore)
        .sort((a: any, b: any) => a.consensus_score - b.consensus_score)

      let freedCapital = 0
      const toClose: any[] = []
      for (const pos of candidates) {
        toClose.push(pos)
        freedCapital += pos.cost_basis
        if (freedCapital >= neededCapital) break
      }

      if (freedCapital < neededCapital) {
        console.log(
          `Max exposure: can't free enough capital ($${freedCapital.toFixed(2)} < $${neededCapital.toFixed(2)} needed)`
        )
        return
      }

      // Close the weak positions
      for (const pos of toClose) {
        console.log(
          `Smart liquidation: closing ${pos.market_title} (consensus ${pos.consensus_score.toFixed(1)}, P&L $${pos.unrealized_pnl.toFixed(2)}) for higher-conviction trade`
        )
        await this.closePosition(pos.id, 'smart_liquidation')
      }

      // Telegram summary
      getTelegramNotifier().send(
        `♻️ <b>SMART LIQUIDATION</b>\nClosed ${toClose.length} position(s) to free $${freedCapital.toFixed(2)}\nFor: ${(trade.marketTitle || '').slice(0, 40)}`
      )
    }

    const walletPositions = db
      .prepare("SELECT COUNT(*) as cnt FROM pm_copy_positions WHERE wallet_id = ? AND status = 'open'")
      .get(trade.walletId) as { cnt: number }
    if (walletPositions.cnt >= settings.maxPositionsPerWallet) return

    let amount: number
    if (settings.sizeMode === 'percentage') {
      amount = trade.size * trade.price * (settings.sizePercentage / 100)
    } else {
      amount = settings.fixedSizeUsdc
    }

    // Re-check remaining exposure after possible liquidations
    const updatedExposure = db
      .prepare("SELECT COALESCE(SUM(cost_basis), 0) as total FROM pm_copy_positions WHERE status = 'open'")
      .get() as { total: number }
    const remaining = settings.maxExposureUsdc - updatedExposure.total
    amount = Math.min(amount, remaining)
    if (amount < 0.01) return

    try {
      const result = await adapter.placeMarketOrder({
        tokenId: trade.tokenId,
        side: 'BUY',
        amount
      })

      const positionId = randomUUID()
      const costBasis = amount
      db.prepare(`
        INSERT INTO pm_copy_positions (id, source_trade_id, wallet_id, token_id, market_title, outcome, side, entry_price, current_price, size, cost_basis, consensus_score, clob_order_id, opened_at)
        VALUES (?, ?, ?, ?, ?, ?, 'BUY', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        positionId,
        trade.id,
        trade.walletId,
        trade.tokenId,
        trade.marketTitle,
        trade.outcome,
        trade.price,
        trade.price,
        amount / trade.price,
        costBasis,
        consensusScore,
        result.orderId,
        Math.floor(Date.now() / 1000)
      )

      const position = this.getPosition(positionId)
      if (position) {
        mainWindow?.webContents.send('pm:copy-executed', position)
        getTelegramNotifier().notifyPmCopyTrade(position, trade)
      }
    } catch (err) {
      console.error('Copy trade entry failed:', err)
    }
  }

  private calculateConsensusScore(tokenId: string, currentWalletId: number): number {
    const db = getDb()
    // Count how many distinct active tracked wallets have bought this token in the last hour
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600
    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT t.wallet_id) as cnt
         FROM pm_wallet_trades t
         JOIN pm_tracked_wallets w ON w.id = t.wallet_id
         WHERE t.token_id = ? AND t.side = 'BUY' AND t.timestamp > ? AND w.is_active = 1`
      )
      .get(tokenId, oneHourAgo) as { cnt: number }

    return row.cnt
  }

  private async handleExit(trade: any, settings: PmCopySettings): Promise<void> {
    const db = getDb()
    const adapter = getPolymarketAdapter()

    const position = db
      .prepare("SELECT * FROM pm_copy_positions WHERE wallet_id = ? AND token_id = ? AND status = 'open' LIMIT 1")
      .get(trade.walletId, trade.tokenId) as any | undefined
    if (!position) return

    try {
      await adapter.placeMarketOrder({
        tokenId: trade.tokenId,
        side: 'SELL',
        amount: position.size
      })
      this.closePositionInternal(position, trade.price, 'copy_exit')
    } catch (err) {
      console.error('Copy trade exit failed:', err)
    }
  }

  async closePosition(positionId: string, closeReason = 'manual'): Promise<void> {
    const db = getDb()
    const adapter = getPolymarketAdapter()
    const position = db
      .prepare("SELECT * FROM pm_copy_positions WHERE id = ? AND status = 'open'")
      .get(positionId) as any | undefined
    if (!position) throw new Error('Position not found or already closed')

    const currentPrice = await adapter.getMidpointPrice(position.token_id)
    await adapter.placeMarketOrder({
      tokenId: position.token_id,
      side: 'SELL',
      amount: position.size
    })
    this.closePositionInternal(position, currentPrice, closeReason)
  }

  private closePositionInternal(position: any, exitPrice: number, closeReason: string): void {
    const db = getDb()
    const mainWindow = getMainWindow()

    const pnl = (exitPrice - position.entry_price) * position.size
    const pnlPct = position.entry_price > 0
      ? ((exitPrice - position.entry_price) / position.entry_price) * 100
      : 0
    const duration = Math.floor(Date.now() / 1000) - position.opened_at
    const closedAt = Math.floor(Date.now() / 1000)

    db.prepare(`
      UPDATE pm_copy_positions SET
        status = 'closed',
        current_price = ?,
        realized_pnl = ?,
        unrealized_pnl = 0,
        close_reason = ?,
        closed_at = ?
      WHERE id = ?
    `).run(exitPrice, pnl, closeReason, closedAt, position.id)

    const wallet = db.prepare('SELECT display_name FROM pm_tracked_wallets WHERE id = ?').get(position.wallet_id) as { display_name: string } | undefined
    const logId = randomUUID()

    db.prepare(`
      INSERT INTO pm_copy_log (id, position_id, wallet_id, wallet_name, market_title, outcome, side, entry_price, exit_price, size, pnl, pnl_pct, duration, close_reason, opened_at, closed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      position.id,
      position.wallet_id,
      wallet?.display_name || '',
      position.market_title,
      position.outcome,
      position.side,
      position.entry_price,
      exitPrice,
      position.size,
      pnl,
      pnlPct,
      duration,
      closeReason,
      position.opened_at,
      closedAt
    )

    const updated = this.getPosition(position.id)
    if (updated) {
      mainWindow?.webContents.send('pm:position-updated', updated)
      getTelegramNotifier().notifyPmPositionClosed(updated, pnl, pnlPct)
    }
  }

  getPosition(positionId: string): PmCopyPosition | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM pm_copy_positions WHERE id = ?').get(positionId) as any
    if (!row) return null
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

  async refreshPositionPrices(): Promise<void> {
    const db = getDb()
    const adapter = getPolymarketAdapter()
    if (!adapter.isInitialized()) return
    const mainWindow = getMainWindow()

    const positions = db.prepare("SELECT * FROM pm_copy_positions WHERE status = 'open'").all() as any[]
    for (const pos of positions) {
      try {
        const currentPrice = await adapter.getMidpointPrice(pos.token_id)
        const unrealizedPnl = (currentPrice - pos.entry_price) * pos.size
        db.prepare('UPDATE pm_copy_positions SET current_price = ?, unrealized_pnl = ? WHERE id = ?').run(
          currentPrice,
          unrealizedPnl,
          pos.id
        )
        const updated = this.getPosition(pos.id)
        if (updated) {
          mainWindow?.webContents.send('pm:position-updated', updated)
        }
      } catch {}
    }
  }

  startPriceRefresh(): void {
    this.stopPriceRefresh()
    this.priceRefreshTimer = setInterval(() => this.refreshPositionPrices(), 30000)
  }

  stopPriceRefresh(): void {
    if (this.priceRefreshTimer) {
      clearInterval(this.priceRefreshTimer)
      this.priceRefreshTimer = null
    }
  }

  getStats(): PmCopyStats {
    const db = getDb()
    const openPos = db
      .prepare(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(cost_basis), 0) as exposure, COALESCE(SUM(unrealized_pnl), 0) as unrealizedPnl FROM pm_copy_positions WHERE status = 'open'"
      )
      .get() as { cnt: number; exposure: number; unrealizedPnl: number }

    const closedStats = db
      .prepare(
        "SELECT COUNT(*) as total, COALESCE(SUM(pnl), 0) as totalPnl, SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins, SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losses FROM pm_copy_log"
      )
      .get() as { total: number; totalPnl: number; wins: number; losses: number }

    const totalTrades = closedStats.total
    const winRate = totalTrades > 0 ? closedStats.wins / totalTrades : 0

    return {
      totalPnl: closedStats.totalPnl + openPos.unrealizedPnl,
      winRate,
      openPositions: openPos.cnt,
      totalExposure: openPos.exposure,
      totalTrades,
      wins: closedStats.wins,
      losses: closedStats.losses
    }
  }
}

let executor: PmCopyExecutor | null = null

export function getPmCopyExecutor(): PmCopyExecutor {
  if (!executor) {
    executor = new PmCopyExecutor()
  }
  return executor
}
