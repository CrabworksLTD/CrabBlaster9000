import { create } from 'zustand'
import type { TransactionRecord } from '@shared/types'

interface TransactionStore {
  transactions: TransactionRecord[]
  loading: boolean

  fetchTransactions: (limit?: number) => Promise<void>
  addTransaction: (tx: TransactionRecord) => void
  updateTransaction: (tx: TransactionRecord) => void
  clearTransactions: () => Promise<void>
  exportTransactions: () => Promise<string>
}

export const useTransactionStore = create<TransactionStore>((set, get) => ({
  transactions: [],
  loading: false,

  fetchTransactions: async (limit = 100) => {
    set({ loading: true })
    try {
      const transactions = await window.electronAPI.invoke('tx:list', { limit, offset: 0 })
      set({ transactions, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  addTransaction: (tx: TransactionRecord) => {
    set({ transactions: [tx, ...get().transactions] })
  },

  updateTransaction: (tx: TransactionRecord) => {
    set({
      transactions: get().transactions.map((t) => (t.id === tx.id ? tx : t))
    })
  },

  clearTransactions: async () => {
    await window.electronAPI.invoke('tx:clear')
    set({ transactions: [] })
  },

  exportTransactions: async () => {
    return window.electronAPI.invoke('tx:export')
  }
}))
