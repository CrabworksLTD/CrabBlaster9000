import { create } from 'zustand'
import type { WalletInfo } from '@shared/types'

interface WalletStore {
  wallets: WalletInfo[]
  loading: boolean
  error: string | null

  fetchWallets: () => Promise<void>
  importWallet: (secretKey: string, label: string) => Promise<WalletInfo>
  generateWallets: (count: number, labelPrefix: string) => Promise<WalletInfo[]>
  deleteWallet: (walletId: string) => Promise<void>
  fundWallets: (fromId: string, toIds: string[], amountEach: number) => Promise<void>
  reclaimWallets: (walletIds: string[], toId: string) => Promise<void>
  refreshBalances: () => Promise<void>
}

export const useWalletStore = create<WalletStore>((set, get) => ({
  wallets: [],
  loading: false,
  error: null,

  fetchWallets: async () => {
    set({ loading: true, error: null })
    try {
      const wallets = await window.electronAPI.invoke('wallet:list')
      set({ wallets, loading: false })
    } catch (err: any) {
      set({ error: err?.message || 'Failed to fetch wallets', loading: false })
    }
  },

  importWallet: async (secretKey: string, label: string) => {
    const wallet = await window.electronAPI.invoke('wallet:import', {
      secretKeyBase58: secretKey,
      label
    })
    await get().fetchWallets()
    return wallet
  },

  generateWallets: async (count: number, labelPrefix: string) => {
    const wallets = await window.electronAPI.invoke('wallet:generate', {
      count,
      labelPrefix
    })
    await get().fetchWallets()
    return wallets
  },

  deleteWallet: async (walletId: string) => {
    await window.electronAPI.invoke('wallet:delete', { walletId })
    set({ wallets: get().wallets.filter((w) => w.id !== walletId) })
  },

  fundWallets: async (fromId: string, toIds: string[], amountEach: number) => {
    await window.electronAPI.invoke('wallet:fund', {
      fromWalletId: fromId,
      toWalletIds: toIds,
      amountSolEach: amountEach
    })
    await get().refreshBalances()
  },

  reclaimWallets: async (walletIds: string[], toId: string) => {
    await window.electronAPI.invoke('wallet:reclaim', {
      walletIds,
      toWalletId: toId
    })
    await get().refreshBalances()
  },

  refreshBalances: async () => {
    try {
      const wallets = await window.electronAPI.invoke('wallet:refresh-balances')
      set({ wallets })
    } catch (err: any) {
      set({ error: err?.message || 'Failed to refresh balances' })
    }
  }
}))
