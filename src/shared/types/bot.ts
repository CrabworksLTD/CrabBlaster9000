export type DexType = 'jupiter' | 'raydium' | 'pumpfun'
export type BotMode = 'bundle' | 'volume'
export type BotStatus = 'idle' | 'running' | 'stopping' | 'error'
export type TradeDirection = 'buy' | 'sell'

export interface BundleBotConfig {
  mode: 'bundle'
  tokenMint: string
  dex: DexType
  walletIds: string[]
  direction: TradeDirection
  amountSol: number
  slippageBps: number
  rounds: number
  delayBetweenRoundsMs: number
  priorityFeeMicroLamports: number
}

export interface VolumeBotConfig {
  mode: 'volume'
  tokenMint: string
  dex: DexType
  walletIds: string[]
  buyAmountSol: number
  sellPercentage: number // 50-100
  slippageBps: number
  minDelayMs: number
  maxDelayMs: number
  maxRounds: number // 0 = unlimited
  priorityFeeMicroLamports: number
}

export type BotConfig = BundleBotConfig | VolumeBotConfig

export interface BotState {
  status: BotStatus
  mode: BotMode | null
  currentRound: number
  totalRounds: number
  tradesCompleted: number
  tradesFailed: number
  startedAt: number | null
  error: string | null
}
