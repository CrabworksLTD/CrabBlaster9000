export interface PmCopySettings {
  enabled: boolean
  sizeMode: 'percentage' | 'fixed'
  sizePercentage: number
  fixedSizeUsdc: number
  maxExposureUsdc: number
  maxPositionsPerWallet: number
  autoTrackTopN: number
  leaderboardMinWinRate: number
  leaderboardMinPnl: number
  leaderboardTimePeriod: 'DAY' | 'WEEK' | 'MONTH' | 'ALL'
  pollIntervalSeconds: number
  copyExits: boolean
}

export interface PmTrackedWallet {
  id: number
  proxyWallet: string
  displayName: string
  source: string
  winRate: number
  pnl: number
  volume: number
  rank: number
  isActive: boolean
  lastTradeCheck: number | null
  addedAt: number
}

export interface PmWalletTrade {
  id: string
  walletId: number
  conditionId: string
  tokenId: string
  side: 'BUY' | 'SELL'
  outcome: string
  price: number
  size: number
  marketTitle: string
  timestamp: number
}

export interface PmCopyPosition {
  id: string
  sourceTradeId: string
  walletId: number
  tokenId: string
  marketTitle: string
  outcome: string
  side: 'BUY' | 'SELL'
  entryPrice: number
  currentPrice: number
  size: number
  costBasis: number
  consensusScore: number
  unrealizedPnl: number
  realizedPnl: number
  status: 'open' | 'closed'
  closeReason: string | null
  clobOrderId: string | null
  openedAt: number
  closedAt: number | null
}

export interface PmCopyLogEntry {
  id: string
  positionId: string
  walletId: number
  walletName: string
  marketTitle: string
  outcome: string
  side: 'BUY' | 'SELL'
  entryPrice: number
  exitPrice: number
  size: number
  pnl: number
  pnlPct: number
  duration: number
  closeReason: string
  openedAt: number
  closedAt: number
}

export interface PmLeaderboardEntry {
  rank: number
  proxyWallet: string
  displayName: string
  pnl: number
  volume: number
  winRate: number
}

export interface PmCopyStats {
  totalPnl: number
  winRate: number
  openPositions: number
  totalExposure: number
  totalTrades: number
  wins: number
  losses: number
}

export interface PmServiceState {
  running: boolean
  lastPoll: number | null
  error: string | null
}
