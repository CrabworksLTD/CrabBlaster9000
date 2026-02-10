import { Keypair, VersionedTransaction } from '@solana/web3.js'
import type { DexAdapter } from './dex-interface'
import type { SwapQuote, SwapParams } from '@shared/types'
import { getConnection } from '../services/rpc-manager'

const RAYDIUM_API_BASE = 'https://transaction-v1.raydium.io/v2'

export class RaydiumAdapter implements DexAdapter {
  name = 'raydium'

  async getQuote(params: SwapParams): Promise<SwapQuote> {
    const url = new URL(`${RAYDIUM_API_BASE}/main/swap/compute`)
    url.searchParams.set('inputMint', params.inputMint)
    url.searchParams.set('outputMint', params.outputMint)
    url.searchParams.set('amount', params.amount.toString())
    url.searchParams.set('slippageBps', params.slippageBps.toString())

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Raydium quote failed: ${res.statusText}`)

    const data = await res.json()

    if (!data.success) throw new Error(`Raydium quote error: ${data.msg || 'Unknown'}`)

    return {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      inputAmount: Number(data.data.inputAmount),
      outputAmount: Number(data.data.outputAmount),
      priceImpactPct: Number(data.data.priceImpact || 0),
      dex: 'raydium'
    }
  }

  async buildSwapTransaction(params: SwapParams, _quote: SwapQuote): Promise<VersionedTransaction> {
    // Step 1: Get compute data
    const computeUrl = new URL(`${RAYDIUM_API_BASE}/main/swap/compute`)
    computeUrl.searchParams.set('inputMint', params.inputMint)
    computeUrl.searchParams.set('outputMint', params.outputMint)
    computeUrl.searchParams.set('amount', params.amount.toString())
    computeUrl.searchParams.set('slippageBps', params.slippageBps.toString())

    const computeRes = await fetch(computeUrl.toString())
    if (!computeRes.ok) throw new Error(`Raydium compute failed: ${computeRes.statusText}`)
    const computeData = await computeRes.json()

    if (!computeData.success) throw new Error(`Raydium compute error: ${computeData.msg}`)

    // Step 2: Get swap transaction
    const txRes = await fetch(`${RAYDIUM_API_BASE}/main/swap/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        computeResponse: computeData.data,
        wallet: params.walletPublicKey,
        wrapSol: true,
        unwrapSol: true
      })
    })

    if (!txRes.ok) throw new Error(`Raydium tx build failed: ${txRes.statusText}`)
    const txData = await txRes.json()

    if (!txData.success) throw new Error(`Raydium tx error: ${txData.msg}`)

    const txBuf = Buffer.from(txData.data.transaction, 'base64')
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
