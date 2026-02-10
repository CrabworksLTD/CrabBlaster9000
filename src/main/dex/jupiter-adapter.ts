import { Keypair, VersionedTransaction } from '@solana/web3.js'
import type { DexAdapter } from './dex-interface'
import type { SwapQuote, SwapParams } from '@shared/types'
import { getConnection } from '../services/rpc-manager'

const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6'

export class JupiterAdapter implements DexAdapter {
  name = 'jupiter'

  async getQuote(params: SwapParams): Promise<SwapQuote> {
    const url = new URL(`${JUPITER_API_BASE}/quote`)
    url.searchParams.set('inputMint', params.inputMint)
    url.searchParams.set('outputMint', params.outputMint)
    url.searchParams.set('amount', params.amount.toString())
    url.searchParams.set('slippageBps', params.slippageBps.toString())

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Jupiter quote failed: ${res.statusText}`)

    const data = await res.json()

    return {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      inputAmount: Number(data.inAmount),
      outputAmount: Number(data.outAmount),
      priceImpactPct: Number(data.priceImpactPct),
      dex: 'jupiter'
    }
  }

  async buildSwapTransaction(params: SwapParams, _quote: SwapQuote): Promise<VersionedTransaction> {
    // First get a fresh quote to pass to the swap endpoint
    const url = new URL(`${JUPITER_API_BASE}/quote`)
    url.searchParams.set('inputMint', params.inputMint)
    url.searchParams.set('outputMint', params.outputMint)
    url.searchParams.set('amount', params.amount.toString())
    url.searchParams.set('slippageBps', params.slippageBps.toString())

    const quoteRes = await fetch(url.toString())
    if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${quoteRes.statusText}`)
    const quoteData = await quoteRes.json()

    const swapRes = await fetch(`${JUPITER_API_BASE}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: params.walletPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto'
      })
    })

    if (!swapRes.ok) throw new Error(`Jupiter swap build failed: ${swapRes.statusText}`)
    const swapData = await swapRes.json()

    const txBuf = Buffer.from(swapData.swapTransaction, 'base64')
    return VersionedTransaction.deserialize(txBuf)
  }

  async executeSwap(
    params: SwapParams,
    signer: Keypair
  ): Promise<{ signature: string; inputAmount: number; outputAmount: number }> {
    const quote = await this.getQuote(params)
    const tx = await this.buildSwapTransaction(params, quote)

    tx.sign([signer])

    const connection = getConnection()
    const rawTx = tx.serialize()

    const signature = await connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      maxRetries: 3
    })

    await connection.confirmTransaction(signature, 'confirmed')

    return {
      signature,
      inputAmount: quote.inputAmount,
      outputAmount: quote.outputAmount
    }
  }
}
