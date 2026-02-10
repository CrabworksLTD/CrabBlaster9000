import { useCallback, useRef, useEffect } from 'react'
import {
  Play,
  Square,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { useBotStore } from '../stores/bot-store'
import { useTransactionStore } from '../stores/transaction-store'
import { useBotStatus } from '../hooks/useBotStatus'
import { useTransactionFeed } from '../hooks/useTransactionFeed'
import { StatCard } from '../components/common/StatCard'
import { EmptyState } from '../components/common/EmptyState'

export function BotControlPage() {
  const botState = useBotStatus()
  const transactions = useTransactionFeed()
  const { stopBot } = useBotStore()
  const { clearTransactions, exportTransactions } = useTransactionStore()
  const feedRef = useRef<HTMLDivElement>(null)

  const isRunning = botState.status === 'running'

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0
    }
  }, [transactions.length])

  const handleStop = useCallback(async () => {
    try {
      await stopBot()
      toast.success('Bot stopped')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to stop bot')
    }
  }, [stopBot])

  const handleClear = useCallback(async () => {
    await clearTransactions()
    toast.success('Transaction history cleared')
  }, [clearTransactions])

  const handleExport = useCallback(async () => {
    const csv = await exportTransactions()
    if (!csv) {
      toast.error('No transactions to export')
      return
    }
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `solana-bot-transactions-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Transactions exported')
  }, [exportTransactions])

  const elapsed = botState.startedAt
    ? Math.floor((Date.now() - botState.startedAt) / 1000)
    : 0
  const elapsedStr = `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bot Control</h1>
          <p className="text-sm text-gray-500 mt-1">Monitor and control your active bot</p>
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button onClick={handleStop} className="btn-danger">
              <Square className="w-4 h-4 mr-2 inline" />
              Stop Bot
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="w-2 h-2 rounded-full bg-gray-600" />
              Bot idle — configure and start from Bot Config
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Status"
          value={botState.status === 'running' ? 'Running' : botState.status === 'error' ? 'Error' : 'Idle'}
          icon={Activity}
          color={isRunning ? 'text-success' : botState.status === 'error' ? 'text-danger' : 'text-gray-500'}
        />
        <StatCard
          label="Round"
          value={`${botState.currentRound}/${botState.totalRounds || '∞'}`}
          icon={Clock}
          color="text-blue-500"
          subtitle={isRunning ? elapsedStr : undefined}
        />
        <StatCard
          label="Completed"
          value={botState.tradesCompleted}
          icon={CheckCircle}
          color="text-success"
        />
        <StatCard
          label="Failed"
          value={botState.tradesFailed}
          icon={XCircle}
          color="text-danger"
        />
      </div>

      {/* Error Banner */}
      {botState.error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4">
          <p className="text-sm text-danger">{botState.error}</p>
        </div>
      )}

      {/* Transaction Feed */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Transaction Feed</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="btn-secondary text-xs">
              Export CSV
            </button>
            <button onClick={handleClear} className="btn-secondary text-xs">
              <Trash2 className="w-3.5 h-3.5 mr-1 inline" />
              Clear
            </button>
          </div>
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No transactions"
            description="Transactions will appear here in real-time as the bot executes trades"
          />
        ) : (
          <div ref={feedRef} className="space-y-1.5 max-h-[450px] overflow-y-auto">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors ${
                  tx.status === 'pending'
                    ? 'bg-yellow-500/5 border border-yellow-500/20'
                    : tx.status === 'confirmed'
                      ? 'bg-surface-tertiary border border-transparent'
                      : 'bg-danger/5 border border-danger/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  {tx.direction === 'buy' ? (
                    <ArrowDownRight
                      className={`w-4 h-4 ${tx.status === 'failed' ? 'text-danger' : 'text-success'}`}
                    />
                  ) : (
                    <ArrowUpRight
                      className={`w-4 h-4 ${tx.status === 'failed' ? 'text-danger' : 'text-orange-400'}`}
                    />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white capitalize">
                        {tx.direction}
                      </span>
                      <span className="text-xs text-gray-500">
                        R{tx.round} · {tx.dex}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 font-mono">
                        {tx.walletPublicKey.slice(0, 4)}...{tx.walletPublicKey.slice(-4)}
                      </span>
                      {tx.signature && (
                        <a
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-accent hover:underline inline-flex items-center gap-0.5"
                        >
                          {tx.signature.slice(0, 8)}...
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-sm font-mono text-gray-300">
                      {tx.amountSol.toFixed(4)} SOL
                    </span>
                    {tx.amountToken && (
                      <p className="text-xs text-gray-500 font-mono">
                        {tx.amountToken.toLocaleString()} tokens
                      </p>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full min-w-[70px] text-center ${
                      tx.status === 'confirmed'
                        ? 'bg-success/15 text-success'
                        : tx.status === 'failed'
                          ? 'bg-danger/15 text-danger'
                          : 'bg-yellow-500/15 text-yellow-500 animate-pulse'
                    }`}
                  >
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log Console */}
      {botState.status === 'running' && (
        <div className="card">
          <h2 className="text-base font-semibold text-white mb-3">Status</h2>
          <div className="bg-surface rounded-lg p-3 font-mono text-xs text-gray-400 space-y-1">
            <p>
              Mode: <span className="text-white">{botState.mode}</span>
            </p>
            <p>
              Round: <span className="text-white">{botState.currentRound}</span> /{' '}
              {botState.totalRounds || '∞'}
            </p>
            <p>
              Trades:{' '}
              <span className="text-success">{botState.tradesCompleted} confirmed</span>,{' '}
              <span className="text-danger">{botState.tradesFailed} failed</span>
            </p>
            <p>
              Elapsed: <span className="text-white">{elapsedStr}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
