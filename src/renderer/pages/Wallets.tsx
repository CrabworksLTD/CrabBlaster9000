import { useEffect, useState } from 'react'
import {
  Wallet,
  Plus,
  Import,
  RefreshCw,
  Trash2,
  Send,
  ArrowDownToLine,
  Copy,
  Check
} from 'lucide-react'
import { toast } from 'sonner'
import { useWalletStore } from '../stores/wallet-store'
import { Modal } from '../components/common/Modal'
import { EmptyState } from '../components/common/EmptyState'
import { Spinner } from '../components/common/Spinner'

export function WalletsPage() {
  const {
    wallets,
    loading,
    fetchWallets,
    importWallet,
    generateWallets,
    deleteWallet,
    fundWallets,
    reclaimWallets,
    refreshBalances
  } = useWalletStore()

  const [showImport, setShowImport] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [showFund, setShowFund] = useState(false)
  const [showReclaim, setShowReclaim] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Import form
  const [importKey, setImportKey] = useState('')
  const [importLabel, setImportLabel] = useState('')

  // Generate form
  const [genCount, setGenCount] = useState(5)
  const [genPrefix, setGenPrefix] = useState('Sub')

  // Fund form
  const [fundAmount, setFundAmount] = useState('0.01')
  const [fundWalletIds, setFundWalletIds] = useState<string[]>([])

  // Processing state
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    fetchWallets()
  }, [fetchWallets])

  const mainWallet = wallets.find((w) => w.isMain)
  const subWallets = wallets.filter((w) => !w.isMain)

  const handleImport = async () => {
    setProcessing(true)
    try {
      await importWallet(importKey, importLabel)
      toast.success('Wallet imported successfully')
      setShowImport(false)
      setImportKey('')
      setImportLabel('')
    } catch (err: any) {
      toast.error(err?.message || 'Import failed')
    }
    setProcessing(false)
  }

  const handleGenerate = async () => {
    setProcessing(true)
    try {
      await generateWallets(genCount, genPrefix)
      toast.success(`Generated ${genCount} wallets`)
      setShowGenerate(false)
    } catch (err: any) {
      toast.error(err?.message || 'Generation failed')
    }
    setProcessing(false)
  }

  const handleFund = async () => {
    if (!mainWallet) return
    setProcessing(true)
    try {
      const targets = fundWalletIds.length > 0 ? fundWalletIds : subWallets.map((w) => w.id)
      await fundWallets(mainWallet.id, targets, parseFloat(fundAmount))
      toast.success('Wallets funded successfully')
      setShowFund(false)
    } catch (err: any) {
      toast.error(err?.message || 'Funding failed')
    }
    setProcessing(false)
  }

  const handleReclaim = async () => {
    if (!mainWallet) return
    setProcessing(true)
    try {
      const targets = subWallets.map((w) => w.id)
      await reclaimWallets(targets, mainWallet.id)
      toast.success('SOL reclaimed successfully')
      setShowReclaim(false)
    } catch (err: any) {
      toast.error(err?.message || 'Reclaim failed')
    }
    setProcessing(false)
  }

  const handleCopy = (publicKey: string, id: string) => {
    navigator.clipboard.writeText(publicKey)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDelete = async (walletId: string) => {
    try {
      await deleteWallet(walletId)
      toast.success('Wallet deleted')
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Wallet Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your main and sub-wallets</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refreshBalances()} className="btn-secondary" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 inline ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => setShowImport(true)} className="btn-secondary">
            <Import className="w-4 h-4 mr-2 inline" />
            Import
          </button>
          <button onClick={() => setShowGenerate(true)} className="btn-primary">
            <Plus className="w-4 h-4 mr-2 inline" />
            Generate
          </button>
        </div>
      </div>

      {/* Main Wallet */}
      <div className="card">
        <h2 className="text-base font-semibold text-white mb-3">Main Wallet</h2>
        {mainWallet ? (
          <div className="flex items-center justify-between p-3 rounded-lg bg-surface-tertiary">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-accent/20 rounded-lg flex items-center justify-center">
                <Wallet className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{mainWallet.label}</p>
                <p className="text-xs text-gray-500 font-mono">
                  {mainWallet.publicKey.slice(0, 8)}...{mainWallet.publicKey.slice(-8)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-lg font-bold font-mono text-white">
                {mainWallet.balanceSol.toFixed(4)} SOL
              </span>
              <button
                onClick={() => handleCopy(mainWallet.publicKey, mainWallet.id)}
                className="p-2 rounded-lg hover:bg-border text-gray-400 hover:text-white transition-colors"
              >
                {copiedId === mainWallet.id ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No main wallet imported.{' '}
            <button onClick={() => setShowImport(true)} className="text-accent hover:underline">
              Import one
            </button>
          </p>
        )}
      </div>

      {/* Sub Wallets */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white">
            Sub-Wallets ({subWallets.length})
          </h2>
          {subWallets.length > 0 && mainWallet && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowFund(true)} className="btn-secondary text-xs">
                <Send className="w-3.5 h-3.5 mr-1.5 inline" />
                Fund All
              </button>
              <button onClick={() => setShowReclaim(true)} className="btn-danger text-xs">
                <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5 inline" />
                Reclaim All
              </button>
            </div>
          )}
        </div>

        {subWallets.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No sub-wallets"
            description="Generate sub-wallets to use with the bundle and volume bots"
            action={{ label: 'Generate Wallets', onClick: () => setShowGenerate(true) }}
          />
        ) : (
          <div className="space-y-1.5">
            {subWallets.map((wallet) => (
              <div
                key={wallet.id}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-surface-tertiary hover:bg-border/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-surface rounded-md flex items-center justify-center">
                    <Wallet className="w-3.5 h-3.5 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">{wallet.label}</p>
                    <p className="text-xs text-gray-500 font-mono">
                      {wallet.publicKey.slice(0, 6)}...{wallet.publicKey.slice(-6)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-gray-300">
                    {wallet.balanceSol.toFixed(4)} SOL
                  </span>
                  <button
                    onClick={() => handleCopy(wallet.publicKey, wallet.id)}
                    className="p-1.5 rounded hover:bg-border text-gray-500 hover:text-white transition-colors"
                  >
                    {copiedId === wallet.id ? (
                      <Check className="w-3.5 h-3.5 text-success" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(wallet.id)}
                    className="p-1.5 rounded hover:bg-danger/20 text-gray-500 hover:text-danger transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import Modal */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Main Wallet">
        <div className="space-y-4">
          <div>
            <label className="label">Label</label>
            <input
              className="input"
              value={importLabel}
              onChange={(e) => setImportLabel(e.target.value)}
              placeholder="Main Wallet"
            />
          </div>
          <div>
            <label className="label">Secret Key (Base58)</label>
            <input
              type="password"
              className="input"
              value={importKey}
              onChange={(e) => setImportKey(e.target.value)}
              placeholder="Enter your base58 secret key"
            />
          </div>
          <p className="text-xs text-gray-500">
            Your key is encrypted via OS Keychain and never leaves this device.
          </p>
          <button
            onClick={handleImport}
            disabled={!importKey || !importLabel || processing}
            className="btn-primary w-full"
          >
            {processing ? <Spinner size="sm" /> : 'Import Wallet'}
          </button>
        </div>
      </Modal>

      {/* Generate Modal */}
      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="Generate Sub-Wallets">
        <div className="space-y-4">
          <div>
            <label className="label">Number of Wallets</label>
            <input
              type="number"
              className="input"
              value={genCount}
              onChange={(e) => setGenCount(parseInt(e.target.value) || 1)}
              min={1}
              max={50}
            />
          </div>
          <div>
            <label className="label">Label Prefix</label>
            <input
              className="input"
              value={genPrefix}
              onChange={(e) => setGenPrefix(e.target.value)}
              placeholder="Sub"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={processing}
            className="btn-primary w-full"
          >
            {processing ? <Spinner size="sm" /> : `Generate ${genCount} Wallets`}
          </button>
        </div>
      </Modal>

      {/* Fund Modal */}
      <Modal open={showFund} onClose={() => setShowFund(false)} title="Fund Sub-Wallets">
        <div className="space-y-4">
          <div>
            <label className="label">SOL per Wallet</label>
            <input
              type="number"
              className="input"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              step="0.001"
              min="0.001"
            />
          </div>
          <p className="text-sm text-gray-400">
            Total cost: ~{(parseFloat(fundAmount || '0') * subWallets.length).toFixed(4)} SOL for{' '}
            {subWallets.length} wallets
          </p>
          <button
            onClick={handleFund}
            disabled={processing || !mainWallet}
            className="btn-primary w-full"
          >
            {processing ? <Spinner size="sm" /> : 'Fund All Sub-Wallets'}
          </button>
        </div>
      </Modal>

      {/* Reclaim Modal */}
      <Modal open={showReclaim} onClose={() => setShowReclaim(false)} title="Reclaim SOL">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            This will send all SOL (minus tx fees) from {subWallets.length} sub-wallets back to the
            main wallet.
          </p>
          <button
            onClick={handleReclaim}
            disabled={processing || !mainWallet}
            className="btn-danger w-full"
          >
            {processing ? <Spinner size="sm" /> : 'Reclaim All SOL'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
