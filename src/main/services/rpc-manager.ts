import { Connection } from '@solana/web3.js'
import { getDb } from '../storage/database'
import { DEFAULT_RPC_ENDPOINT } from '@shared/constants'

let connection: Connection | null = null
let currentEndpoint: string | null = null

export function getConnection(): Connection {
  const endpoint = getRpcEndpoint()
  if (!connection || currentEndpoint !== endpoint) {
    connection = new Connection(endpoint, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60_000
    })
    currentEndpoint = endpoint
  }
  return connection
}

export function getRpcEndpoint(): string {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('rpc_endpoint') as
    | { value: string }
    | undefined
  return row?.value ?? DEFAULT_RPC_ENDPOINT
}

export function setRpcEndpoint(endpoint: string): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('rpc_endpoint', endpoint)
  // Force reconnect on next getConnection()
  connection = null
  currentEndpoint = null
}

export async function testRpcEndpoint(endpoint: string): Promise<{ ok: boolean; latencyMs: number }> {
  try {
    const conn = new Connection(endpoint, { commitment: 'confirmed' })
    const start = Date.now()
    await conn.getSlot()
    const latencyMs = Date.now() - start
    return { ok: true, latencyMs }
  } catch {
    return { ok: false, latencyMs: -1 }
  }
}
