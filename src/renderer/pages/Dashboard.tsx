import { useEffect, useMemo } from 'react'
import {
  Wallet,
  TrendingUp,
  Activity,
  CircleDollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Clock
} from 'lucide-react'
import { StatCard } from '../components/common/StatCard'
import { EmptyState } from '../components/common/EmptyState'
import { useWalletStore } from '../stores/wallet-store'
import { useTransactionFeed } from '../hooks/useTransactionFeed'
import { useBotStatus } from '../hooks/useBotStatus'

export function DashboardPage() {
  const { wallets, fetchWallets } = useWalletStore()
  const transactions = useTransactionFeed()
  const botState = useBotStatus()

  useEffect(() => {
    fetchWallets()
  }, [fetchWallets])

  const totalSol = useMemo(
    () => wallets.reduce((sum, w) => sum + w.balanceSol, 0),
    [wallets]
  )

  const todayTrades = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return transactions.filter((tx) => tx.createdAt >= todayStart.getTime()).length
  }, [transactions])

  const recentTxs = transactions.slice(0, 10)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your trading activity</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Total SOL"
          value={totalSol.toFixed(4)}
          icon={CircleDollarSign}
          color="text-yellow-500"
        />
        <StatCard
          label="Active Wallets"
          value={wallets.length}
          icon={Wallet}
          color="text-blue-500"
        />
        <StatCard
          label="Trades Today"
          value={todayTrades}
          icon={TrendingUp}
          color="text-green-500"
        />
        <StatCard
          label="Bot Status"
          value={botState.status === 'running' ? 'Running' : 'Idle'}
          icon={Activity}
          color={botState.status === 'running' ? 'text-success' : 'text-gray-500'}
          subtitle={
            botState.status === 'running'
              ? `Round ${botState.currentRound}/${botState.totalRounds || '∞'}`
              : undefined
          }
        />
      </div>

      {/* Balance Overview */}
      <div className="card">
        <h2 className="text-base font-semibold text-white mb-4">Wallet Balances</h2>
        {wallets.length === 0 ? (
          <p className="text-sm text-gray-500">No wallets configured</p>
        ) : (
          <div className="space-y-2">
            {wallets.map((wallet) => (
              <div
                key={wallet.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-tertiary"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${wallet.isMain ? 'bg-accent' : 'bg-gray-600'}`}
                  />
                  <div>
                    <span className="text-sm font-medium text-white">{wallet.label}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      {wallet.publicKey.slice(0, 4)}...{wallet.publicKey.slice(-4)}
                    </span>
                  </div>
                </div>
                <span className="text-sm font-mono text-gray-300">
                  {wallet.balanceSol.toFixed(4)} SOL
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-base font-semibold text-white mb-4">Recent Activity</h2>
        {recentTxs.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No activity yet"
            description="Transactions will appear here once you start trading"
          />
        ) : (
          <div className="space-y-2">
            {recentTxs.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-surface-tertiary"
              >
                <div className="flex items-center gap-3">
                  {tx.direction === 'buy' ? (
                    <ArrowDownRight className="w-4 h-4 text-success" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4 text-danger" />
                  )}
                  <div>
                    <span className="text-sm font-medium text-white capitalize">
                      {tx.direction}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      {tx.tokenMint.slice(0, 6)}...
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-gray-300">
                    {tx.amountSol.toFixed(4)} SOL
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      tx.status === 'confirmed'
                        ? 'bg-success/15 text-success'
                        : tx.status === 'failed'
                          ? 'bg-danger/15 text-danger'
                          : 'bg-yellow-500/15 text-yellow-500'
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
    </div>
  )
}
