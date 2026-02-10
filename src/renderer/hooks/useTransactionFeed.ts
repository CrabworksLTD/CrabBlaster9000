import { useCallback, useEffect } from 'react'
import { useTransactionStore } from '../stores/transaction-store'
import { useIpcEvent } from './useIpcEvent'
import type { TransactionRecord } from '@shared/types'

export function useTransactionFeed() {
  const { transactions, fetchTransactions, addTransaction, updateTransaction } = useTransactionStore()

  const handleTxEvent = useCallback(
    (tx: TransactionRecord) => {
      const existing = transactions.find((t) => t.id === tx.id)
      if (existing) {
        updateTransaction(tx)
      } else {
        addTransaction(tx)
      }
    },
    [transactions, addTransaction, updateTransaction]
  )

  useIpcEvent('tx:event', handleTxEvent)

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  return transactions
}
