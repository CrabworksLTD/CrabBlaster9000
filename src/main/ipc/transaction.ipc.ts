import { ipcMain } from 'electron'
import { z } from 'zod'
import { getDb } from '../storage/database'
import type { TransactionRecord } from '@shared/types'

function mapRow(row: any): TransactionRecord {
  return {
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
}

export function registerTransactionIpc(): void {
  ipcMain.handle('tx:list', async (_event, params: unknown) => {
    const { limit, offset } = z
      .object({
        limit: z.number().int().min(1).max(1000).optional().default(100),
        offset: z.number().int().min(0).optional().default(0)
      })
      .parse(params ?? {})

    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as any[]

    return rows.map(mapRow)
  })

  ipcMain.handle('tx:clear', async () => {
    const db = getDb()
    db.prepare('DELETE FROM transactions').run()
  })

  ipcMain.handle('tx:export', async () => {
    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM transactions ORDER BY created_at DESC')
      .all() as any[]

    const transactions = rows.map(mapRow)

    if (transactions.length === 0) return ''

    const headers = [
      'ID',
      'Signature',
      'Wallet',
      'Token',
      'Direction',
      'Amount SOL',
      'Amount Token',
      'DEX',
      'Status',
      'Error',
      'Bot Mode',
      'Round',
      'Time'
    ]

    const csvRows = transactions.map((tx) =>
      [
        tx.id,
        tx.signature,
        tx.walletPublicKey,
        tx.tokenMint,
        tx.direction,
        tx.amountSol,
        tx.amountToken ?? '',
        tx.dex,
        tx.status,
        tx.error ?? '',
        tx.botMode,
        tx.round,
        new Date(tx.createdAt).toISOString()
      ].join(',')
    )

    return [headers.join(','), ...csvRows].join('\n')
  })
}
