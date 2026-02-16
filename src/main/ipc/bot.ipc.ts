import { ipcMain } from 'electron'
import { z } from 'zod'
import { startBundleBot, stopBot, getBotState } from '../services/bundle-bot'
import { startVolumeBot, stopVolumeBot, getVolumeBotState } from '../services/volume-bot'
import { startCopyTradeBot, stopCopyTradeBot, getCopyTradeBotState, getDetectedTrades } from '../services/copy-trade-bot'
import { getTelegramNotifier } from '../services/telegram-notifier'
import type { BotConfig } from '@shared/types'

const bundleConfigSchema = z.object({
  mode: z.literal('bundle'),
  tokenMint: z.string().min(32).max(44),
  dex: z.enum(['jupiter', 'raydium', 'pumpfun', 'bonk', 'bags']),
  walletIds: z.array(z.string().uuid()).min(1),
  direction: z.enum(['buy', 'sell']),
  amountSol: z.number().min(0),
  useMaxAmount: z.boolean(),
  slippageBps: z.number().int().min(1).max(5000),
  rounds: z.number().int().min(1).max(1000),
  delayBetweenRoundsMs: z.number().int().min(0),
  priorityFeeMicroLamports: z.number().int().min(0),
  staggerDelayMs: z.number().int().min(0)
})

const volumeConfigSchema = z.object({
  mode: z.literal('volume'),
  tokenMint: z.string().min(32).max(44),
  dex: z.enum(['jupiter', 'raydium', 'pumpfun', 'bonk', 'bags']),
  walletIds: z.array(z.string().uuid()).min(1),
  buyAmountSol: z.number().positive(),
  sellPercentage: z.number().min(50).max(100),
  slippageBps: z.number().int().min(1).max(5000),
  minDelayMs: z.number().int().min(0),
  maxDelayMs: z.number().int().min(0),
  maxRounds: z.number().int().min(0),
  priorityFeeMicroLamports: z.number().int().min(0)
})

const copyTradeConfigSchema = z.object({
  mode: z.literal('copytrade'),
  targetWallet: z.string().min(32).max(44),
  dex: z.enum(['jupiter', 'raydium', 'pumpfun', 'bonk', 'bags']),
  walletIds: z.array(z.string().uuid()).min(1),
  slippageBps: z.number().int().min(1).max(5000),
  priorityFeeMicroLamports: z.number().int().min(0),
  amountMode: z.enum(['fixed', 'proportional']),
  fixedAmountSol: z.number().positive(),
  copyBuys: z.boolean(),
  copySells: z.boolean(),
  copyDelayMs: z.number().int().min(0).max(30_000),
  pollIntervalMs: z.number().int().min(1_000).max(30_000)
})

export function registerBotIpc(): void {
  ipcMain.handle('bot:start', async (_event, params: unknown) => {
    const config = params as BotConfig

    if (config.mode === 'bundle') {
      const validated = bundleConfigSchema.parse(config)
      getTelegramNotifier().notifyBotStarted('bundle').catch(() => {})
      // Start in background (don't await)
      startBundleBot(validated).catch(console.error)
    } else if (config.mode === 'volume') {
      const validated = volumeConfigSchema.parse(config)
      getTelegramNotifier().notifyBotStarted('volume').catch(() => {})
      startVolumeBot(validated).catch(console.error)
    } else if (config.mode === 'copytrade') {
      const validated = copyTradeConfigSchema.parse(config)
      getTelegramNotifier().notifyBotStarted('copytrade').catch(() => {})
      startCopyTradeBot(validated).catch(console.error)
    } else {
      throw new Error('Invalid bot mode')
    }
  })

  ipcMain.handle('bot:stop', async () => {
    // Determine which mode was running for the notification
    const bundleState = getBotState()
    const volumeState = getVolumeBotState()
    const copyTradeState = getCopyTradeBotState()
    const runningMode = copyTradeState.status === 'running'
      ? 'copytrade'
      : volumeState.status === 'running'
        ? 'volume'
        : bundleState.status === 'running'
          ? 'bundle'
          : null

    stopBot()
    stopVolumeBot()
    stopCopyTradeBot()

    if (runningMode) {
      getTelegramNotifier().notifyBotStopped(runningMode).catch(() => {})
    }
  })

  ipcMain.handle('bot:status', async () => {
    const bundleState = getBotState()
    const volumeState = getVolumeBotState()
    const copyTradeState = getCopyTradeBotState()

    // Return whichever is active, or bundle state by default
    if (copyTradeState.status === 'running') return copyTradeState
    if (volumeState.status === 'running') return volumeState
    return bundleState
  })

  ipcMain.handle('bot:detected-trades', async (_event, params: unknown) => {
    const { limit } = z
      .object({ limit: z.number().int().min(1).max(500).optional().default(50) })
      .parse(params ?? {})
    return getDetectedTrades(limit)
  })
}
