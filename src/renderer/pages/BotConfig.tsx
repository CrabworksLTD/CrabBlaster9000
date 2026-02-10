import { useEffect, useState } from 'react'
import { Settings2, Zap, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { useWalletStore } from '../stores/wallet-store'
import { useBotStore } from '../stores/bot-store'
import { useSettingsStore } from '../stores/settings-store'
import type { BundleBotConfig, VolumeBotConfig, DexType } from '@shared/types'

type TabMode = 'bundle' | 'volume'

export function BotConfigPage() {
  const { wallets, fetchWallets } = useWalletStore()
  const { startBot } = useBotStore()
  const { defaultSlippageBps, defaultPriorityFee, fetchSettings } = useSettingsStore()

  const [tab, setTab] = useState<TabMode>('bundle')

  // Shared fields
  const [tokenMint, setTokenMint] = useState('')
  const [dex, setDex] = useState<DexType>('jupiter')
  const [selectedWalletIds, setSelectedWalletIds] = useState<string[]>([])
  const [slippageBps, setSlippageBps] = useState(defaultSlippageBps)
  const [priorityFee, setPriorityFee] = useState(defaultPriorityFee)

  // Bundle fields
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy')
  const [amountSol, setAmountSol] = useState('0.01')
  const [rounds, setRounds] = useState(1)
  const [delayBetweenRounds, setDelayBetweenRounds] = useState(1000)

  // Volume fields
  const [buyAmountSol, setBuyAmountSol] = useState('0.01')
  const [sellPercentage, setSellPercentage] = useState(100)
  const [minDelay, setMinDelay] = useState(3000)
  const [maxDelay, setMaxDelay] = useState(10000)
  const [maxRounds, setMaxRounds] = useState(10)

  useEffect(() => {
    fetchWallets()
    fetchSettings()
  }, [fetchWallets, fetchSettings])

  useEffect(() => {
    setSlippageBps(defaultSlippageBps)
    setPriorityFee(defaultPriorityFee)
  }, [defaultSlippageBps, defaultPriorityFee])

  const subWallets = wallets.filter((w) => !w.isMain)

  const toggleWallet = (id: string) => {
    setSelectedWalletIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    setSelectedWalletIds(subWallets.map((w) => w.id))
  }

  const selectNone = () => {
    setSelectedWalletIds([])
  }

  const handleStart = async () => {
    if (!tokenMint) {
      toast.error('Please enter a token mint address')
      return
    }
    if (selectedWalletIds.length === 0) {
      toast.error('Please select at least one wallet')
      return
    }

    try {
      if (tab === 'bundle') {
        const config: BundleBotConfig = {
          mode: 'bundle',
          tokenMint,
          dex,
          walletIds: selectedWalletIds,
          direction,
          amountSol: parseFloat(amountSol),
          slippageBps,
          rounds,
          delayBetweenRoundsMs: delayBetweenRounds,
          priorityFeeMicroLamports: priorityFee
        }
        await startBot(config)
        toast.success('Bundle bot started')
      } else {
        const config: VolumeBotConfig = {
          mode: 'volume',
          tokenMint,
          dex,
          walletIds: selectedWalletIds,
          buyAmountSol: parseFloat(buyAmountSol),
          sellPercentage,
          slippageBps,
          minDelayMs: minDelay,
          maxDelayMs: maxDelay,
          maxRounds,
          priorityFeeMicroLamports: priorityFee
        }
        await startBot(config)
        toast.success('Volume bot started')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start bot')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Bot Configuration</h1>
        <p className="text-sm text-gray-500 mt-1">Configure and start your trading bot</p>
      </div>

      {/* Tab Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('bundle')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'bundle'
              ? 'bg-accent text-white'
              : 'bg-surface-tertiary text-gray-400 hover:text-white'
          }`}
        >
          <Zap className="w-4 h-4" />
          Bundle Bot
        </button>
        <button
          onClick={() => setTab('volume')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'volume'
              ? 'bg-accent text-white'
              : 'bg-surface-tertiary text-gray-400 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Volume Bot
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left Column - Config */}
        <div className="space-y-5">
          {/* Token & DEX */}
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Token & DEX
            </h3>
            <div>
              <label className="label">Token Mint Address</label>
              <input
                className="input"
                value={tokenMint}
                onChange={(e) => setTokenMint(e.target.value)}
                placeholder="Enter Solana token mint address"
              />
            </div>
            <div>
              <label className="label">DEX</label>
              <select
                className="select"
                value={dex}
                onChange={(e) => setDex(e.target.value as DexType)}
              >
                <option value="jupiter">Jupiter (Aggregator)</option>
                <option value="raydium">Raydium</option>
                <option value="pumpfun">Pump.fun</option>
              </select>
            </div>
          </div>

          {/* Mode-specific config */}
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              {tab === 'bundle' ? 'Bundle Settings' : 'Volume Settings'}
            </h3>

            {tab === 'bundle' ? (
              <>
                <div>
                  <label className="label">Direction</label>
                  <select
                    className="select"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as 'buy' | 'sell')}
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>
                <div>
                  <label className="label">Amount (SOL per wallet)</label>
                  <input
                    type="number"
                    className="input"
                    value={amountSol}
                    onChange={(e) => setAmountSol(e.target.value)}
                    step="0.001"
                    min="0.001"
                  />
                </div>
                <div>
                  <label className="label">Rounds</label>
                  <input
                    type="number"
                    className="input"
                    value={rounds}
                    onChange={(e) => setRounds(parseInt(e.target.value) || 1)}
                    min={1}
                    max={1000}
                  />
                </div>
                <div>
                  <label className="label">Delay Between Rounds (ms)</label>
                  <input
                    type="number"
                    className="input"
                    value={delayBetweenRounds}
                    onChange={(e) => setDelayBetweenRounds(parseInt(e.target.value) || 0)}
                    min={0}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="label">Buy Amount (SOL)</label>
                  <input
                    type="number"
                    className="input"
                    value={buyAmountSol}
                    onChange={(e) => setBuyAmountSol(e.target.value)}
                    step="0.001"
                    min="0.001"
                  />
                </div>
                <div>
                  <label className="label">Sell Percentage: {sellPercentage}%</label>
                  <input
                    type="range"
                    className="w-full accent-accent"
                    value={sellPercentage}
                    onChange={(e) => setSellPercentage(parseInt(e.target.value))}
                    min={50}
                    max={100}
                    step={5}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Min Delay (ms)</label>
                    <input
                      type="number"
                      className="input"
                      value={minDelay}
                      onChange={(e) => setMinDelay(parseInt(e.target.value) || 0)}
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="label">Max Delay (ms)</label>
                    <input
                      type="number"
                      className="input"
                      value={maxDelay}
                      onChange={(e) => setMaxDelay(parseInt(e.target.value) || 0)}
                      min={0}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Max Rounds (0 = unlimited)</label>
                  <input
                    type="number"
                    className="input"
                    value={maxRounds}
                    onChange={(e) => setMaxRounds(parseInt(e.target.value) || 0)}
                    min={0}
                  />
                </div>
              </>
            )}
          </div>

          {/* Advanced */}
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Advanced
            </h3>
            <div>
              <label className="label">Slippage (bps): {slippageBps / 100}%</label>
              <input
                type="range"
                className="w-full accent-accent"
                value={slippageBps}
                onChange={(e) => setSlippageBps(parseInt(e.target.value))}
                min={50}
                max={5000}
                step={50}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0.5%</span>
                <span>50%</span>
              </div>
            </div>
            <div>
              <label className="label">Priority Fee (microLamports)</label>
              <input
                type="number"
                className="input"
                value={priorityFee}
                onChange={(e) => setPriorityFee(parseInt(e.target.value) || 0)}
                min={0}
              />
            </div>
          </div>
        </div>

        {/* Right Column - Wallet Selection */}
        <div className="space-y-5">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Select Wallets ({selectedWalletIds.length}/{subWallets.length})
              </h3>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-accent hover:underline">
                  Select All
                </button>
                <button onClick={selectNone} className="text-xs text-gray-500 hover:underline">
                  Clear
                </button>
              </div>
            </div>

            {subWallets.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                No sub-wallets available. Generate some first.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                {subWallets.map((wallet) => (
                  <label
                    key={wallet.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                      selectedWalletIds.includes(wallet.id)
                        ? 'bg-accent/10 border border-accent/30'
                        : 'bg-surface-tertiary border border-transparent hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedWalletIds.includes(wallet.id)}
                        onChange={() => toggleWallet(wallet.id)}
                        className="rounded border-border text-accent focus:ring-accent"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-200">{wallet.label}</p>
                        <p className="text-xs text-gray-500 font-mono">
                          {wallet.publicKey.slice(0, 6)}...{wallet.publicKey.slice(-4)}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-gray-400">
                      {wallet.balanceSol.toFixed(4)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Start Button */}
          <button
            onClick={handleStart}
            disabled={!tokenMint || selectedWalletIds.length === 0}
            className="btn-primary w-full py-3 text-base"
          >
            <Settings2 className="w-5 h-5 mr-2 inline" />
            Start {tab === 'bundle' ? 'Bundle' : 'Volume'} Bot
          </button>
        </div>
      </div>
    </div>
  )
}
