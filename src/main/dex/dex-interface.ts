import { Keypair, VersionedTransaction } from '@solana/web3.js'
import type { SwapQuote, SwapParams } from '@shared/types'

export interface DexAdapter {
  name: string

  /** Get a swap quote (estimated output, price impact) */
  getQuote(params: SwapParams): Promise<SwapQuote>

  /** Build an unsigned swap transaction */
  buildSwapTransaction(params: SwapParams, quote: SwapQuote): Promise<VersionedTransaction>

  /** Full flow: quote → build → sign → send → confirm */
  executeSwap(params: SwapParams, signer: Keypair): Promise<{
    signature: string
    inputAmount: number
    outputAmount: number
  }>
}
