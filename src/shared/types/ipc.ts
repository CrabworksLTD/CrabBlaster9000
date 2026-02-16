import type { WalletInfo, FundWalletParams, ReclaimParams, ImportWalletParams, GenerateWalletsParams, FundWalletRandomParams, SellWalletsParams } from './wallet'
import type { BotConfig, BotState, DetectedTrade } from './bot'
import type { TransactionRecord } from './transaction'
// Request/Response channels (invoke/handle)
export interface IpcChannels {
  // Wallet
  'wallet:import': { params: ImportWalletParams; result: WalletInfo }
  'wallet:generate': { params: GenerateWalletsParams; result: WalletInfo[] }
  'wallet:list': { params: void; result: WalletInfo[] }
  'wallet:delete': { params: { walletId: string }; result: void }
  'wallet:fund': { params: FundWalletParams; result: { success: boolean; signatures: string[] } }
  'wallet:fund-random': { params: FundWalletRandomParams; result: { success: boolean; signatures: string[] } }
  'wallet:fund-hopped': { params: FundWalletRandomParams; result: { success: boolean; signatures: string[] } }
  'wallet:reclaim': { params: ReclaimParams; result: { success: boolean; signatures: string[] } }
  'wallet:sell': { params: SellWalletsParams; result: { success: boolean; results: { walletId: string; status: string; signature: string }[] } }
  'wallet:refresh-balances': { params: void; result: WalletInfo[] }

  // Bot
  'bot:start': { params: BotConfig; result: void }
  'bot:stop': { params: void; result: void }
  'bot:status': { params: void; result: BotState }
  'bot:detected-trades': { params: { limit?: number }; result: DetectedTrade[] }

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

  // Telegram
  'settings:save-telegram-keys': { params: { botToken: string; chatId: string }; result: void }
  'settings:get-telegram-configured': { params: void; result: boolean }
  'settings:test-telegram': { params: { botToken: string; chatId: string }; result: { ok: boolean } }
  'settings:clear-telegram-keys': { params: void; result: void }
}

// Push event channels (send/on)
export interface IpcEvents {
  'bot:state-changed': BotState
  'bot:trade-detected': DetectedTrade
  'tx:event': TransactionRecord
  'wallet:balance-update': { walletId: string; balanceSol: number }
}

export type IpcChannel = keyof IpcChannels
export type IpcEventChannel = keyof IpcEvents
