import { PublicKey, SystemProgram, VersionedTransaction, TransactionMessage } from '@solana/web3.js'
import { getConnection } from '../services/rpc-manager'

/**
 * Validates a swap transaction before signing.
 *
 * We intentionally do NOT whitelist program IDs because Jupiter (and other
 * aggregators) route through dozens of on-chain programs (Meteora, Lifinity,
 * Phoenix, Raydium CPMM, Pump.fun, etc.) and the set changes per route.
 * A static allowlist silently rejects valid swaps.
 *
 * Instead we check the properties that actually matter for safety:
 *   1. Fee payer is our wallet (not someone else's).
 *   2. No large SOL drains to unknown addresses.
 */
export function validateSwapTransaction(
  tx: VersionedTransaction,
  expectedWallet: string,
  dexName: string
): void {
  const message = tx.message
  const accountKeys = message.getAccountKeys()

  // 1. Verify the fee payer is our wallet
  const feePayer = accountKeys.get(0)
  if (!feePayer || feePayer.toBase58() !== expectedWallet) {
    throw new Error(
      `${dexName} transaction has unexpected fee payer: ${feePayer?.toBase58()}. Expected: ${expectedWallet}`
    )
  }

  // 2. Check for suspicious direct SOL transfers to unknown addresses
  const compiledInstructions = message.compiledInstructions
  for (const ix of compiledInstructions) {
    const programId = accountKeys.get(ix.programIdIndex)
    if (!programId) continue

    // Check System Program transfer instructions
    if (programId.equals(SystemProgram.programId) && ix.data.length >= 4) {
      const instructionType = ix.data.readUInt32LE(0)
      // instruction type 2 = Transfer
      if (instructionType === 2 && ix.accountKeyIndexes.length >= 2) {
        const from = accountKeys.get(ix.accountKeyIndexes[0])
        const to = accountKeys.get(ix.accountKeyIndexes[1])

        if (from && from.toBase58() === expectedWallet && to) {
          const amount = ix.data.readBigUInt64LE(4)
          const solAmount = Number(amount) / 1e9
          // Flag transfers larger than 10 SOL to a non-program address.
          // Swap routes legitimately transfer SOL (wrapping, fees, etc.)
          // but >10 SOL direct sends are suspicious.
          if (solAmount > 10) {
            throw new Error(
              `${dexName} transaction contains suspicious SOL transfer of ${solAmount.toFixed(4)} SOL ` +
              `to address ${to.toBase58()}. Transaction rejected for safety.`
            )
          }
        }
      }
    }
  }
}
