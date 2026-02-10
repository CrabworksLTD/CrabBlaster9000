import {
  Keypair,
  SystemProgram,
  Transaction,
  PublicKey,
  LAMPORTS_PER_SOL
} from '@solana/web3.js'
import bs58 from 'bs58'
import { v4 as uuidv4 } from 'crypto'
import { getDb } from '../storage/database'
import { encryptKey, decryptKey } from '../storage/secure-storage'
import { getConnection } from './rpc-manager'
import type { WalletRecord, WalletInfo } from '@shared/types'
import { MAX_WALLETS_PER_FUND_TX } from '@shared/constants'

function generateId(): string {
  return crypto.randomUUID()
}

export function importWallet(secretKeyBase58: string, label: string): WalletInfo {
  const decoded = bs58.decode(secretKeyBase58)
  const keypair = Keypair.fromSecretKey(decoded)
  const publicKey = keypair.publicKey.toBase58()

  const db = getDb()
  const existing = db.prepare('SELECT id FROM wallets WHERE public_key = ?').get(publicKey) as
    | { id: string }
    | undefined

  if (existing) {
    throw new Error(`Wallet ${publicKey} already imported`)
  }

  const id = generateId()
  const encryptedKey = encryptKey(secretKeyBase58)

  db.prepare(
    'INSERT INTO wallets (id, public_key, label, is_main, encrypted_key, created_at) VALUES (?, ?, ?, 1, ?, ?)'
  ).run(id, publicKey, label, encryptedKey, Date.now())

  return {
    id,
    publicKey,
    label,
    isMain: true,
    balanceSol: 0,
    createdAt: Date.now()
  }
}

export function generateWallets(count: number, labelPrefix: string): WalletInfo[] {
  const db = getDb()
  const insert = db.prepare(
    'INSERT INTO wallets (id, public_key, label, is_main, encrypted_key, created_at) VALUES (?, ?, ?, 0, ?, ?)'
  )

  const wallets: WalletInfo[] = []

  const insertMany = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const keypair = Keypair.generate()
      const publicKey = keypair.publicKey.toBase58()
      const secretKeyBase58 = bs58.encode(keypair.secretKey)
      const encryptedKey = encryptKey(secretKeyBase58)
      const id = generateId()
      const now = Date.now()
      const label = `${labelPrefix} ${i + 1}`

      insert.run(id, publicKey, label, encryptedKey, now)
      wallets.push({ id, publicKey, label, isMain: false, balanceSol: 0, createdAt: now })
    }
  })

  insertMany()
  return wallets
}

export function listWallets(): WalletRecord[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM wallets ORDER BY is_main DESC, created_at ASC').all() as Array<{
    id: string
    public_key: string
    label: string
    is_main: number
    encrypted_key: string
    created_at: number
  }>

  return rows.map((r) => ({
    id: r.id,
    publicKey: r.public_key,
    label: r.label,
    isMain: r.is_main === 1,
    encryptedKey: r.encrypted_key,
    createdAt: r.created_at
  }))
}

export async function listWalletsWithBalances(): Promise<WalletInfo[]> {
  const records = listWallets()
  const connection = getConnection()

  const publicKeys = records.map((r) => new PublicKey(r.publicKey))
  const balances = await Promise.allSettled(publicKeys.map((pk) => connection.getBalance(pk)))

  return records.map((r, i) => {
    const result = balances[i]
    const balanceSol = result.status === 'fulfilled' ? result.value / LAMPORTS_PER_SOL : 0
    return {
      id: r.id,
      publicKey: r.publicKey,
      label: r.label,
      isMain: r.isMain,
      balanceSol,
      createdAt: r.createdAt
    }
  })
}

export function deleteWallet(walletId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM wallets WHERE id = ?').run(walletId)
}

export function getKeypair(walletId: string): Keypair {
  const db = getDb()
  const row = db.prepare('SELECT encrypted_key FROM wallets WHERE id = ?').get(walletId) as
    | { encrypted_key: string }
    | undefined

  if (!row) throw new Error(`Wallet ${walletId} not found`)

  const secretKeyBase58 = decryptKey(row.encrypted_key)
  const decoded = bs58.decode(secretKeyBase58)
  return Keypair.fromSecretKey(decoded)
}

export async function fundWallets(
  fromWalletId: string,
  toWalletIds: string[],
  amountSolEach: number
): Promise<string[]> {
  const connection = getConnection()
  const fromKeypair = getKeypair(fromWalletId)
  const lamportsEach = Math.floor(amountSolEach * LAMPORTS_PER_SOL)

  const signatures: string[] = []

  // Chunk into groups to avoid tx size limits
  for (let i = 0; i < toWalletIds.length; i += MAX_WALLETS_PER_FUND_TX) {
    const chunk = toWalletIds.slice(i, i + MAX_WALLETS_PER_FUND_TX)
    const tx = new Transaction()

    for (const walletId of chunk) {
      const db = getDb()
      const row = db.prepare('SELECT public_key FROM wallets WHERE id = ?').get(walletId) as
        | { public_key: string }
        | undefined
      if (!row) continue

      tx.add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey: new PublicKey(row.public_key),
          lamports: lamportsEach
        })
      )
    }

    const { blockhash } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = fromKeypair.publicKey

    const sig = await connection.sendTransaction(tx, [fromKeypair])
    await connection.confirmTransaction(sig, 'confirmed')
    signatures.push(sig)
  }

  return signatures
}

export async function reclaimWallets(walletIds: string[], toWalletId: string): Promise<string[]> {
  const connection = getConnection()
  const toDb = getDb()
  const toRow = toDb.prepare('SELECT public_key FROM wallets WHERE id = ?').get(toWalletId) as
    | { public_key: string }
    | undefined
  if (!toRow) throw new Error('Destination wallet not found')

  const toPubkey = new PublicKey(toRow.public_key)
  const signatures: string[] = []

  for (const walletId of walletIds) {
    try {
      const keypair = getKeypair(walletId)
      const balance = await connection.getBalance(keypair.publicKey)
      const fee = 5000 // estimated tx fee in lamports
      const amount = balance - fee

      if (amount <= 0) continue

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey,
          lamports: amount
        })
      )

      const { blockhash } = await connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      tx.feePayer = keypair.publicKey

      const sig = await connection.sendTransaction(tx, [keypair])
      await connection.confirmTransaction(sig, 'confirmed')
      signatures.push(sig)
    } catch {
      // Skip wallets that fail (empty balance, etc.)
    }
  }

  return signatures
}
