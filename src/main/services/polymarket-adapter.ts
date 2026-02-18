import { ClobClient, Side, OrderType } from '@polymarket/clob-client'
import { Wallet } from 'ethers'
import { getDb } from '../storage/database'
import { decryptKey, encryptKey } from '../storage/secure-storage'

const CLOB_HOST = 'https://clob.polymarket.com'
const CHAIN_ID = 137

class PolymarketAdapter {
  private client: ClobClient | null = null
  private signer: Wallet | null = null
  private creds: any = null
  private _initialized = false

  async init(): Promise<void> {
    const db = getDb()
    const row = db.prepare("SELECT value FROM settings WHERE key = 'polygon_private_key'").get() as { value: string } | undefined
    if (!row) throw new Error('Polygon private key not configured')
    const privateKey = decryptKey(row.value)
    this.signer = new Wallet(privateKey)
    const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, this.signer)
    this.creds = await tempClient.createOrDeriveApiKey()
    this.client = new ClobClient(CLOB_HOST, CHAIN_ID, this.signer, this.creds)
    this._initialized = true
  }

  isInitialized(): boolean {
    return this._initialized
  }

  private getClient(): ClobClient {
    if (!this.client) throw new Error('PolymarketAdapter not initialized')
    return this.client
  }

  async placeMarketOrder(params: { tokenId: string; side: 'BUY' | 'SELL'; amount: number }): Promise<{ orderId: string }> {
    const client = this.getClient()
    const side = params.side === 'BUY' ? Side.BUY : Side.SELL
    const result = await client.createAndPostMarketOrder(
      { tokenID: params.tokenId, amount: params.amount, side },
      undefined,
      OrderType.FOK
    )
    return { orderId: (result as any)?.orderID || (result as any)?.id || 'unknown' }
  }

  async placeLimitOrder(params: { tokenId: string; side: 'BUY' | 'SELL'; price: number; size: number }): Promise<{ orderId: string }> {
    const client = this.getClient()
    const side = params.side === 'BUY' ? Side.BUY : Side.SELL
    const result = await client.createAndPostOrder(
      { tokenID: params.tokenId, price: params.price, size: params.size, side },
      undefined,
      OrderType.GTC
    )
    return { orderId: (result as any)?.orderID || (result as any)?.id || 'unknown' }
  }

  async cancelOrder(orderId: string): Promise<void> {
    const client = this.getClient()
    await client.cancelOrder({ orderID: orderId })
  }

  async getMidpointPrice(tokenId: string): Promise<number> {
    const client = this.getClient()
    const result = await client.getMidpoint(tokenId)
    return parseFloat((result as any)?.mid ?? result ?? '0')
  }

  async getBalance(): Promise<number> {
    const client = this.getClient()
    const result = await client.getBalanceAllowance()
    const balance = (result as any)?.balance ?? '0'
    return parseFloat(balance) / 1e6
  }

  destroy(): void {
    this.client = null
    this.signer = null
    this.creds = null
    this._initialized = false
  }
}

let instance: PolymarketAdapter | null = null

export function getPolymarketAdapter(): PolymarketAdapter {
  if (!instance) {
    instance = new PolymarketAdapter()
  }
  return instance
}

export function savePolygonPrivateKey(privateKey: string): void {
  const db = getDb()
  const encrypted = encryptKey(privateKey)
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    'polygon_private_key',
    encrypted
  )
}
