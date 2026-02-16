import { Keypair, ComputeBudgetProgram, TransactionMessage, VersionedTransaction, SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getConnection } from './rpc-manager'
import { getKeypair } from './wallet-manager'
import { getTelegramNotifier } from './telegram-notifier'
import { getDb } from '../storage/database'
import { getMainWindow } from '../index'
import type { DexAdapter } from '../dex/dex-interface'
import type { SwapParams, TransactionRecord } from '@shared/types'
import { TX_RETRY_COUNT, TX_RETRY_DELAY_MS, PLATFORM_FEE_BPS, PLATFORM_FEE_WALLET } from '@shared/constants'

function generateId(): string {
  return crypto.randomUUID()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function recordTransaction(tx: TransactionRecord): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO transactions (id, signature, wallet_id, wallet_public_key, token_mint, direction, amount_sol, amount_token, dex, status, error, bot_mode, round, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tx.id,
    tx.signature,
    tx.walletId,
    tx.walletPublicKey,
    tx.tokenMint,
    tx.direction,
    tx.amountSol,
    tx.amountToken,
    tx.dex,
    tx.status,
    tx.error,
    tx.botMode,
    tx.round,
    tx.createdAt
  )

  // Push to renderer
  getMainWindow()?.webContents.send('tx:event', tx)
}

function updateTransactionStatus(id: string, status: string, error: string | null, signature?: string, amountToken?: number): void {
  const db = getDb()
  const updates: string[] = ['status = ?', 'error = ?']
  const values: (string | number | null)[] = [status, error]

  if (signature) {
    updates.push('signature = ?')
    values.push(signature)
  }
  if (amountToken !== undefined) {
    updates.push('amount_token = ?')
    values.push(amountToken)
  }

  values.push(id)
  db.prepare(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  // Fetch updated record and push to renderer
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as any
  if (row) {
    const tx: TransactionRecord = {
      id: row.id,
      signature: row.signature,
      walletId: row.wallet_id,
      walletPublicKey: row.wallet_public_key,
      tokenMint: row.token_mint,
      direction: row.direction,
      amountSol: row.amount_sol,
      amountToken: row.amount_token,
      dex: row.dex,
      status: row.status,
      error: row.error,
      botMode: row.bot_mode,
      round: row.round,
      createdAt: row.created_at
    }
    getMainWindow()?.webContents.send('tx:event', tx)
  }
}

async function sendPlatformFee(signer: Keypair, amountSol: number): Promise<void> {
  try {
    const feeLamports = Math.floor(amountSol * LAMPORTS_PER_SOL * PLATFORM_FEE_BPS / 10_000)
    if (feeLamports <= 0) return

    const connection = getConnection()
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: new PublicKey(PLATFORM_FEE_WALLET),
        lamports: feeLamports
      })
    )

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = signer.publicKey

    const sig = await connection.sendTransaction(tx, [signer])
    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      'confirmed'
    )
  } catch {
    // Fee transfer failure should not block the user's trade
  }
}

export interface SwapTask {
  walletId: string
  params: SwapParams
  tokenMint: string
  direction: 'buy' | 'sell'
  amountSol: number
  botMode: 'bundle' | 'volume' | 'manual' | 'copytrade'
  round: number
}

async function executeSwapWithRetry(
  adapter: DexAdapter,
  task: SwapTask,
  retries: number = TX_RETRY_COUNT
): Promise<TransactionRecord> {
  const keypair = getKeypair(task.walletId)
  const txId = generateId()

  const pendingTx: TransactionRecord = {
    id: txId,
    signature: '',
    walletId: task.walletId,
    walletPublicKey: task.params.walletPublicKey,
    tokenMint: task.tokenMint,
    direction: task.direction,
    amountSol: task.amountSol,
    amountToken: null,
    dex: adapter.name,
    status: 'pending',
    error: null,
    botMode: task.botMode,
    round: task.round,
    createdAt: Date.now()
  }

  recordTransaction(pendingTx)

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await adapter.executeSwap(task.params, keypair)

      updateTransactionStatus(txId, 'confirmed', null, result.signature, result.outputAmount)

      // Collect platform fee (1.5%) — non-blocking
      sendPlatformFee(keypair, task.amountSol)

      // Telegram notification — non-blocking
      getTelegramNotifier().notifyTxConfirmed({
        direction: task.direction,
        amountSol: task.amountSol,
        tokenMint: task.tokenMint,
        dex: adapter.name,
        signature: result.signature,
        botMode: task.botMode
      }).catch(() => {})

      return {
        ...pendingTx,
        signature: result.signature,
        amountToken: result.outputAmount,
        status: 'confirmed',
        error: null
      }
    } catch (err: any) {
      if (attempt < retries) {
        await sleep(TX_RETRY_DELAY_MS * Math.pow(2, attempt))
        continue
      }

      const errorMsg = err?.message || 'Unknown error'
      updateTransactionStatus(txId, 'failed', errorMsg)

      // Telegram notification — non-blocking
      getTelegramNotifier().notifyTxFailed({
        direction: task.direction,
        amountSol: task.amountSol,
        tokenMint: task.tokenMint,
        dex: adapter.name,
        error: errorMsg,
        botMode: task.botMode
      }).catch(() => {})

      return {
        ...pendingTx,
        status: 'failed',
        error: errorMsg
      }
    }
  }

  // Should not reach here
  return { ...pendingTx, status: 'failed', error: 'Exhausted retries' }
}

export async function executeParallelSwaps(
  adapter: DexAdapter,
  tasks: SwapTask[]
): Promise<TransactionRecord[]> {
  const results = await Promise.allSettled(
    tasks.map((task) => executeSwapWithRetry(adapter, task))
  )

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    return {
      id: generateId(),
      signature: '',
      walletId: tasks[i].walletId,
      walletPublicKey: tasks[i].params.walletPublicKey,
      tokenMint: tasks[i].tokenMint,
      direction: tasks[i].direction,
      amountSol: tasks[i].amountSol,
      amountToken: null,
      dex: adapter.name,
      status: 'failed' as const,
      error: r.reason?.message || 'Unknown error',
      botMode: tasks[i].botMode,
      round: tasks[i].round,
      createdAt: Date.now()
    }
  })
}

export async function executeSequentialSwaps(
  adapter: DexAdapter,
  tasks: SwapTask[],
  delayMs: number = 0
): Promise<TransactionRecord[]> {
  const results: TransactionRecord[] = []

  for (const task of tasks) {
    const result = await executeSwapWithRetry(adapter, task)
    results.push(result)

    if (delayMs > 0) {
      await sleep(delayMs)
    }
  }

  return results
}
