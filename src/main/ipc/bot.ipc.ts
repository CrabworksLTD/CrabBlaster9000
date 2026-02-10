import { ipcMain } from 'electron'
import { z } from 'zod'
import { startBundleBot, stopBot, getBotState } from '../services/bundle-bot'
import { startVolumeBot, stopVolumeBot, getVolumeBotState } from '../services/volume-bot'
import type { BotConfig } from '@shared/types'

const bundleConfigSchema = z.object({
  mode: z.literal('bundle'),
  tokenMint: z.string().min(32).max(44),
  dex: z.enum(['jupiter', 'raydium', 'pumpfun']),
  walletIds: z.array(z.string().uuid()).min(1),
  direction: z.enum(['buy', 'sell']),
  amountSol: z.number().positive(),
  slippageBps: z.number().int().min(1).max(5000),
  rounds: z.number().int().min(1).max(1000),
  delayBetweenRoundsMs: z.number().int().min(0),
  priorityFeeMicroLamports: z.number().int().min(0)
})

const volumeConfigSchema = z.object({
  mode: z.literal('volume'),
  tokenMint: z.string().min(32).max(44),
  dex: z.enum(['jupiter', 'raydium', 'pumpfun']),
  walletIds: z.array(z.string().uuid()).min(1),
  buyAmountSol: z.number().positive(),
  sellPercentage: z.number().min(50).max(100),
  slippageBps: z.number().int().min(1).max(5000),
  minDelayMs: z.number().int().min(0),
  maxDelayMs: z.number().int().min(0),
  maxRounds: z.number().int().min(0),
  priorityFeeMicroLamports: z.number().int().min(0)
})

export function registerBotIpc(): void {
  ipcMain.handle('bot:start', async (_event, params: unknown) => {
    const config = params as BotConfig

    if (config.mode === 'bundle') {
      const validated = bundleConfigSchema.parse(config)
      // Start in background (don't await)
      startBundleBot(validated).catch(console.error)
    } else if (config.mode === 'volume') {
      const validated = volumeConfigSchema.parse(config)
      startVolumeBot(validated).catch(console.error)
    } else {
      throw new Error('Invalid bot mode')
    }
  })

  ipcMain.handle('bot:stop', async () => {
    stopBot()
    stopVolumeBot()
  })

  ipcMain.handle('bot:status', async () => {
    const bundleState = getBotState()
    const volumeState = getVolumeBotState()

    // Return whichever is active, or bundle state by default
    if (volumeState.status === 'running') return volumeState
    return bundleState
  })
}
