export interface SwapQuote {
  inputMint: string
  outputMint: string
  inputAmount: number  // lamports or smallest unit
  outputAmount: number // estimated output
  priceImpactPct: number
  dex: string
}

export interface SwapParams {
  inputMint: string
  outputMint: string
  amount: number // lamports
  slippageBps: number
  walletPublicKey: string
}

export interface SwapResult {
  signature: string
  inputAmount: number
  outputAmount: number
  confirmed: boolean
  error: string | null
}
