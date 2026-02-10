export type TransactionStatus = 'pending' | 'confirmed' | 'failed'

export interface TransactionRecord {
  id: string
  signature: string
  walletId: string
  walletPublicKey: string
  tokenMint: string
  direction: 'buy' | 'sell'
  amountSol: number
  amountToken: number | null
  dex: string
  status: TransactionStatus
  error: string | null
  botMode: 'bundle' | 'volume' | 'manual'
  round: number
  createdAt: number
}

export interface TransactionEvent {
  type: 'tx:new' | 'tx:update'
  transaction: TransactionRecord
}
