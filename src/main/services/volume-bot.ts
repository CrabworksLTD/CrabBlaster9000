import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import type { VolumeBotConfig, BotState } from '@shared/types'
import { SOL_MINT } from '@shared/constants'
import { executeSequentialSwaps, type SwapTask } from './transaction-engine'
import { listWallets } from './wallet-manager'
import { getConnection } from './rpc-manager'
import { getMainWindow } from '../index'
import { JupiterAdapter } from '../dex/jupiter-adapter'
import { RaydiumAdapter } from '../dex/raydium-adapter'
import { PumpFunAdapter } from '../dex/pumpfun-adapter'
import type { DexAdapter } from '../dex/dex-interface'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function getDexAdapter(dex: string): DexAdapter {
  switch (dex) {
    case 'jupiter': return new JupiterAdapter()
    case 'raydium': return new RaydiumAdapter()
    case 'pumpfun': return new PumpFunAdapter()
    default: throw new Error(`Unknown DEX: ${dex}`)
  }
}

let botState: BotState = {
  status: 'idle',
  mode: null,
  currentRound: 0,
  totalRounds: 0,
  tradesCompleted: 0,
  tradesFailed: 0,
  startedAt: null,
  error: null
}

let abortController: AbortController | null = null

function emitState(): void {
  getMainWindow()?.webContents.send('bot:state-changed', botState)
}

function updateState(patch: Partial<BotState>): void {
  botState = { ...botState, ...patch }
  emitState()
}

export function getVolumeBotState(): BotState {
  return { ...botState }
}

export async function startVolumeBot(config: VolumeBotConfig): Promise<void> {
  if (botState.status === 'running') {
    throw new Error('Bot is already running')
  }

  abortController = new AbortController()
  const adapter = getDexAdapter(config.dex)
  const connection = getConnection()

  updateState({
    status: 'running',
    mode: 'volume',
    currentRound: 0,
    totalRounds: config.maxRounds,
    tradesCompleted: 0,
    tradesFailed: 0,
    startedAt: Date.now(),
    error: null
  })

  const allWallets = listWallets()
  const selectedWallets = allWallets.filter((w) => config.walletIds.includes(w.id))

  if (selectedWallets.length === 0) {
    updateState({ status: 'error', error: 'No wallets selected' })
    return
  }

  let walletIndex = 0
  let round = 0

  try {
    while (true) {
      if (abortController.signal.aborted) break
      if (config.maxRounds > 0 && round >= config.maxRounds) break

      round++
      updateState({ currentRound: round })

      const wallet = selectedWallets[walletIndex % selectedWallets.length]
      walletIndex++

      // BUY
      const buyTask: SwapTask = {
        walletId: wallet.id,
        params: {
          inputMint: SOL_MINT,
          outputMint: config.tokenMint,
          amount: Math.floor(config.buyAmountSol * LAMPORTS_PER_SOL),
          slippageBps: config.slippageBps,
          walletPublicKey: wallet.publicKey
        },
        tokenMint: config.tokenMint,
        direction: 'buy',
        amountSol: config.buyAmountSol,
        botMode: 'volume',
        round
      }

      const [buyResult] = await executeSequentialSwaps(adapter, [buyTask])

      if (buyResult.status === 'confirmed') {
        updateState({ tradesCompleted: botState.tradesCompleted + 1 })
      } else {
        updateState({ tradesFailed: botState.tradesFailed + 1 })
        // Wait and continue to next round even on failure
        await sleep(randomDelay(config.minDelayMs, config.maxDelayMs))
        continue
      }

      // Wait between buy and sell
      await sleep(randomDelay(config.minDelayMs, config.maxDelayMs))

      if (abortController.signal.aborted) break

      // Get token balance for sell
      try {
        const tokenMintPubkey = new PublicKey(config.tokenMint)
        const walletPubkey = new PublicKey(wallet.publicKey)
        const ata = await getAssociatedTokenAddress(tokenMintPubkey, walletPubkey)
        const tokenBalance = await connection.getTokenAccountBalance(ata)
        const rawBalance = Number(tokenBalance.value.amount)

        if (rawBalance <= 0) {
          await sleep(randomDelay(config.minDelayMs, config.maxDelayMs))
          continue
        }

        const sellAmount = Math.floor(rawBalance * (config.sellPercentage / 100))

        if (sellAmount <= 0) {
          await sleep(randomDelay(config.minDelayMs, config.maxDelayMs))
          continue
        }

        // SELL
        const sellTask: SwapTask = {
          walletId: wallet.id,
          params: {
            inputMint: config.tokenMint,
            outputMint: SOL_MINT,
            amount: sellAmount,
            slippageBps: config.slippageBps,
            walletPublicKey: wallet.publicKey
          },
          tokenMint: config.tokenMint,
          direction: 'sell',
          amountSol: 0, // Will be determined by swap
          botMode: 'volume',
          round
        }

        const [sellResult] = await executeSequentialSwaps(adapter, [sellTask])

        if (sellResult.status === 'confirmed') {
          updateState({ tradesCompleted: botState.tradesCompleted + 1 })
        } else {
          updateState({ tradesFailed: botState.tradesFailed + 1 })
        }
      } catch {
        updateState({ tradesFailed: botState.tradesFailed + 1 })
      }

      // Wait before next round
      await sleep(randomDelay(config.minDelayMs, config.maxDelayMs))
    }

    updateState({ status: 'idle' })
  } catch (err: any) {
    updateState({ status: 'error', error: err?.message || 'Volume bot error' })
  }
}

export function stopVolumeBot(): void {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  updateState({ status: 'idle' })
}
