import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import type { ParsedTransactionWithMeta, ConfirmedSignatureInfo } from '@solana/web3.js'
import type { CopyTradeBotConfig, BotState, DetectedTrade } from '@shared/types'
import { SOL_MINT } from '@shared/constants'
import {
  JUPITER_PROGRAM_ID,
  RAYDIUM_AMM_PROGRAM_ID,
  PUMPFUN_PROGRAM_ID
} from '@shared/constants'
import { executeParallelSwaps, type SwapTask } from './transaction-engine'
import { listWallets } from './wallet-manager'
import { getConnection } from './rpc-manager'
import { getTelegramNotifier } from './telegram-notifier'
import { getDb } from '../storage/database'
import { getMainWindow } from '../index'
import { JupiterAdapter } from '../dex/jupiter-adapter'
import { RaydiumAdapter } from '../dex/raydium-adapter'
import { PumpFunAdapter } from '../dex/pumpfun-adapter'
import { BonkAdapter } from '../dex/bonk-adapter'
import { BagsAdapter } from '../dex/bags-adapter'
import type { DexAdapter } from '../dex/dex-interface'
import { getPipelineStats } from './pipeline-stats'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getDexAdapter(dex: string): DexAdapter {
  switch (dex) {
    case 'jupiter': return new JupiterAdapter()
    case 'raydium': return new RaydiumAdapter()
    case 'pumpfun': return new PumpFunAdapter()
    case 'bonk': return new BonkAdapter()
    case 'bags': return new BagsAdapter()
    default: throw new Error(`Unknown DEX: ${dex}`)
  }
}

function identifyDex(programIds: string[]): string {
  for (const id of programIds) {
    if (id === JUPITER_PROGRAM_ID) return 'jupiter'
    if (id === RAYDIUM_AMM_PROGRAM_ID) return 'raydium'
    if (id === PUMPFUN_PROGRAM_ID) return 'pumpfun'
  }
  return 'unknown'
}

// Internal tracking — mapped into BotState for the UI
let tradesDetected = 0
let tradesReplicated = 0
let tradesFailed = 0
let botStatus: BotState['status'] = 'idle'
let startedAt: number | null = null
let errorMsg: string | null = null

let abortController: AbortController | null = null
let lastSignature: string | null = null

function toBotState(): BotState {
  return {
    status: botStatus,
    mode: 'copytrade',
    currentRound: tradesDetected,   // overloaded: "detected" count
    totalRounds: 0,                 // unlimited
    tradesCompleted: tradesReplicated,
    tradesFailed,
    startedAt,
    error: errorMsg
  }
}

function emitState(): void {
  getMainWindow()?.webContents.send('bot:state-changed', toBotState())
}

function updateInternal(patch: {
  status?: BotState['status']
  detected?: number
  replicated?: number
  failed?: number
  startedAt?: number | null
  error?: string | null
}): void {
  if (patch.status !== undefined) botStatus = patch.status
  if (patch.detected !== undefined) tradesDetected = patch.detected
  if (patch.replicated !== undefined) tradesReplicated = patch.replicated
  if (patch.failed !== undefined) tradesFailed = patch.failed
  if (patch.startedAt !== undefined) startedAt = patch.startedAt
  if (patch.error !== undefined) errorMsg = patch.error
  emitState()
}

export function getCopyTradeBotState(): BotState {
  return toBotState()
}

export function getDetectedTrades(limit: number = 50): DetectedTrade[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM detected_trades ORDER BY detected_at DESC LIMIT ?')
    .all(limit) as Array<{
      id: string
      signature: string
      target_wallet: string
      token_mint: string
      direction: string
      amount_sol: number
      dex: string
      replicated: number
      detected_at: number
    }>

  return rows.map((r) => ({
    id: r.id,
    signature: r.signature,
    targetWallet: r.target_wallet,
    tokenMint: r.token_mint,
    direction: r.direction as 'buy' | 'sell',
    amountSol: r.amount_sol,
    dex: r.dex,
    replicated: r.replicated === 1,
    detectedAt: r.detected_at
  }))
}

function recordDetectedTrade(trade: DetectedTrade): void {
  const db = getDb()
  db.prepare(
    `INSERT OR IGNORE INTO detected_trades (id, signature, target_wallet, token_mint, direction, amount_sol, dex, replicated, detected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    trade.id,
    trade.signature,
    trade.targetWallet,
    trade.tokenMint,
    trade.direction,
    trade.amountSol,
    trade.dex,
    trade.replicated ? 1 : 0,
    trade.detectedAt
  )

  getMainWindow()?.webContents.send('bot:trade-detected', trade)
}

function updateDetectedTradeReplicated(id: string, replicated: boolean): void {
  const db = getDb()
  db.prepare('UPDATE detected_trades SET replicated = ? WHERE id = ?').run(replicated ? 1 : 0, id)
}

interface ParsedSwap {
  tokenMint: string
  direction: 'buy' | 'sell'
  amountSol: number
  dex: string
}

type ParseSwapResult =
  | { swap: ParsedSwap }
  | { reason: 'meta_error' | 'unknown_dex' | 'no_swap' }

function parseSwapFromTransaction(
  tx: ParsedTransactionWithMeta,
  targetWallet: string
): ParseSwapResult {
  if (!tx.meta || tx.meta.err) return { reason: 'meta_error' }

  const programIds = (tx.transaction.message.accountKeys || []).map((k) =>
    typeof k === 'string' ? k : k.pubkey.toBase58()
  )
  const dex = identifyDex(programIds)
  if (dex === 'unknown') return { reason: 'unknown_dex' }

  const preBalances = tx.meta.preTokenBalances || []
  const postBalances = tx.meta.postTokenBalances || []

  const balanceChanges = new Map<string, number>()

  for (const post of postBalances) {
    if (post.owner !== targetWallet) continue
    const mint = post.mint
    const postAmount = Number(post.uiTokenAmount.uiAmount || 0)

    const pre = preBalances.find(
      (p) => p.owner === targetWallet && p.mint === mint && p.accountIndex === post.accountIndex
    )
    const preAmount = pre ? Number(pre.uiTokenAmount.uiAmount || 0) : 0
    const change = postAmount - preAmount

    if (change !== 0) {
      balanceChanges.set(mint, change)
    }
  }

  for (const pre of preBalances) {
    if (pre.owner !== targetWallet) continue
    const mint = pre.mint
    if (!balanceChanges.has(mint)) {
      const post = postBalances.find(
        (p) => p.owner === targetWallet && p.mint === mint && p.accountIndex === pre.accountIndex
      )
      const postAmount = post ? Number(post.uiTokenAmount.uiAmount || 0) : 0
      const preAmount = Number(pre.uiTokenAmount.uiAmount || 0)
      const change = postAmount - preAmount
      if (change !== 0) {
        balanceChanges.set(mint, change)
      }
    }
  }

  let tokenMint: string | null = null
  let direction: 'buy' | 'sell' | null = null

  for (const [mint, change] of balanceChanges) {
    if (mint === SOL_MINT) continue
    tokenMint = mint
    direction = change > 0 ? 'buy' : 'sell'
    break
  }

  if (!tokenMint || !direction) return { reason: 'no_swap' }

  const targetAccountIndex = tx.transaction.message.accountKeys.findIndex((k) => {
    const key = typeof k === 'string' ? k : k.pubkey.toBase58()
    return key === targetWallet
  })

  let amountSol = 0
  if (targetAccountIndex >= 0 && tx.meta.preBalances && tx.meta.postBalances) {
    const preLamports = tx.meta.preBalances[targetAccountIndex]
    const postLamports = tx.meta.postBalances[targetAccountIndex]
    amountSol = Math.abs(postLamports - preLamports) / LAMPORTS_PER_SOL
  }

  if (amountSol < 0.001) amountSol = 0.001

  return { swap: { tokenMint, direction, amountSol, dex } }
}

export async function startCopyTradeBot(config: CopyTradeBotConfig): Promise<void> {
  if (botStatus === 'running') {
    throw new Error('Copy trade bot is already running')
  }

  abortController = new AbortController()
  lastSignature = null
  getPipelineStats().reset()

  const connection = getConnection()
  const targetPubkey = new PublicKey(config.targetWallet)
  const adapter = getDexAdapter(config.dex)

  const allWallets = listWallets()
  const walletMap = new Map(allWallets.map((w) => [w.id, w]))

  updateInternal({
    status: 'running',
    detected: 0,
    replicated: 0,
    failed: 0,
    startedAt: Date.now(),
    error: null
  })

  // First poll: just set the cursor, don't replay history
  try {
    const initialSigs = await connection.getSignaturesForAddress(targetPubkey, { limit: 1 })
    if (initialSigs.length > 0) {
      lastSignature = initialSigs[0].signature
    }
  } catch (err: any) {
    updateInternal({ status: 'error', error: `Failed to fetch initial signatures: ${err?.message}` })
    return
  }

  // Polling loop
  try {
    while (!abortController.signal.aborted) {
      await sleep(config.pollIntervalMs)
      if (abortController.signal.aborted) break

      try {
        const sigOptions: { limit: number; until?: string } = { limit: 10 }
        if (lastSignature) {
          sigOptions.until = lastSignature
        }

        const signatures: ConfirmedSignatureInfo[] = await connection.getSignaturesForAddress(
          targetPubkey,
          sigOptions
        )

        const ps = getPipelineStats()
        ps.incr('totalPolls')
        ps.setLastCycleAt(new Date().toISOString())

        if (signatures.length === 0) continue

        ps.incrBy('signaturesFetched', signatures.length)
        lastSignature = signatures[0].signature

        const reversedSigs = [...signatures].reverse()

        for (const sigInfo of reversedSigs) {
          if (abortController.signal.aborted) break
          if (sigInfo.err) {
            ps.incr('failedTx')
            continue
          }

          let parsedTx: ParsedTransactionWithMeta | null = null
          try {
            parsedTx = await connection.getParsedTransaction(sigInfo.signature, {
              maxSupportedTransactionVersion: 0
            })
          } catch {
            ps.incr('parseError')
            continue
          }

          if (!parsedTx) {
            ps.incr('parseError')
            continue
          }

          const parseResult = parseSwapFromTransaction(parsedTx, config.targetWallet)
          if ('reason' in parseResult) {
            if (parseResult.reason === 'meta_error') ps.incr('failedTx')
            else if (parseResult.reason === 'unknown_dex') ps.incr('unknownDex')
            else if (parseResult.reason === 'no_swap') ps.incr('noSwapDetected')
            continue
          }
          const swap = parseResult.swap

          if (
            (swap.direction === 'buy' && !config.copyBuys) ||
            (swap.direction === 'sell' && !config.copySells)
          ) {
            ps.incr('directionSkipped')
            continue
          }

          const detectedTrade: DetectedTrade = {
            id: crypto.randomUUID(),
            signature: sigInfo.signature,
            targetWallet: config.targetWallet,
            tokenMint: swap.tokenMint,
            direction: swap.direction,
            amountSol: swap.amountSol,
            dex: swap.dex,
            replicated: false,
            detectedAt: Date.now()
          }

          recordDetectedTrade(detectedTrade)
          ps.incr('tradesDetected')
          updateInternal({ detected: tradesDetected + 1 })

          // Telegram notification — non-blocking
          getTelegramNotifier().notifyTradeDetected({
            tokenMint: swap.tokenMint,
            direction: swap.direction,
            amountSol: swap.amountSol,
            dex: swap.dex,
            targetWallet: config.targetWallet
          }).catch(() => {})

          if (config.copyDelayMs > 0) {
            await sleep(config.copyDelayMs)
          }
          if (abortController.signal.aborted) break

          const amountSolPerWallet =
            config.amountMode === 'fixed'
              ? config.fixedAmountSol
              : swap.amountSol / config.walletIds.length

          const isBuy = swap.direction === 'buy'
          const tasks: SwapTask[] = config.walletIds
            .map((walletId) => {
              const wallet = walletMap.get(walletId)
              if (!wallet) return null

              return {
                walletId,
                params: {
                  inputMint: isBuy ? SOL_MINT : swap.tokenMint,
                  outputMint: isBuy ? swap.tokenMint : SOL_MINT,
                  amount: Math.floor(amountSolPerWallet * LAMPORTS_PER_SOL),
                  slippageBps: config.slippageBps,
                  walletPublicKey: wallet.publicKey
                },
                tokenMint: swap.tokenMint,
                direction: swap.direction,
                amountSol: amountSolPerWallet,
                botMode: 'copytrade' as const,
                round: 0
              }
            })
            .filter((t): t is SwapTask => t !== null)

          if (tasks.length === 0) continue

          try {
            const results = await executeParallelSwaps(adapter, tasks)
            const succeeded = results.filter((r) => r.status === 'confirmed').length
            const failed = results.filter((r) => r.status === 'failed').length

            updateDetectedTradeReplicated(detectedTrade.id, succeeded > 0)
            if (succeeded > 0) ps.incrBy('tradesReplicated', succeeded)
            if (failed > 0) ps.incrBy('tradesFailed', failed)
            updateInternal({
              replicated: tradesReplicated + succeeded,
              failed: tradesFailed + failed
            })
          } catch {
            ps.incrBy('tradesFailed', tasks.length)
            updateInternal({ failed: tradesFailed + tasks.length })
          }
        }
      } catch (err: any) {
        console.error('Copy trade poll error:', err?.message)
      }
    }

    updateInternal({ status: 'idle' })
  } catch (err: any) {
    updateInternal({ status: 'error', error: err?.message || 'Copy trade bot error' })
  }
}

export function stopCopyTradeBot(): void {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  updateInternal({ status: 'idle' })
}
