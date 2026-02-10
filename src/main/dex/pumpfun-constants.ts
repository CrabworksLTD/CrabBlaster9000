import { PublicKey } from '@solana/web3.js'

export const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')
export const PUMP_FUN_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf')
export const PUMP_FUN_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCJ2kUKYhDLby')
export const PUMP_FUN_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1')

// Bonding curve constants
export const PUMP_FUN_INITIAL_VIRTUAL_SOL_RESERVES = 30_000_000_000 // 30 SOL in lamports
export const PUMP_FUN_INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000_000_000 // ~1.073B tokens
export const PUMP_FUN_FEE_BASIS_POINTS = 100 // 1%
