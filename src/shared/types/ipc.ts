import type { WalletInfo, FundWalletParams, ReclaimParams, ImportWalletParams, GenerateWalletsParams } from './wallet'
import type { BotConfig, BotState } from './bot'
import type { TransactionRecord } from './transaction'

// Request/Response channels (invoke/handle)
export interface IpcChannels {
  // Wallet
  'wallet:import': { params: ImportWalletParams; result: WalletInfo }
  'wallet:generate': { params: GenerateWalletsParams; result: WalletInfo[] }
  'wallet:list': { params: void; result: WalletInfo[] }
  'wallet:delete': { params: { walletId: string }; result: void }
  'wallet:fund': { params: FundWalletParams; result: { success: boolean; signatures: string[] } }
  'wallet:reclaim': { params: ReclaimParams; result: { success: boolean; signatures: string[] } }
  'wallet:refresh-balances': { params: void; result: WalletInfo[] }

  // Bot
  'bot:start': { params: BotConfig; result: void }
  'bot:stop': { params: void; result: void }
  'bot:status': { params: void; result: BotState }

  // Transactions
  'tx:list': { params: { limit?: number; offset?: number }; result: TransactionRecord[] }
  'tx:clear': { params: void; result: void }
  'tx:export': { params: void; result: string } // CSV string

  // Settings
  'settings:get-rpc': { params: void; result: string }
  'settings:set-rpc': { params: { endpoint: string }; result: void }
  'settings:test-rpc': { params: { endpoint: string }; result: { ok: boolean; latencyMs: number } }
  'settings:get': { params: { key: string }; result: string | null }
  'settings:set': { params: { key: string; value: string }; result: void }
}

// Push event channels (send/on)
export interface IpcEvents {
  'bot:state-changed': BotState
  'tx:event': TransactionRecord
  'wallet:balance-update': { walletId: string; balanceSol: number }
}

export type IpcChannel = keyof IpcChannels
export type IpcEventChannel = keyof IpcEvents
