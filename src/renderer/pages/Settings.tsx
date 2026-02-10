import { useEffect, useState } from 'react'
import { Globe, Zap, Shield, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useSettingsStore } from '../stores/settings-store'
import { Spinner } from '../components/common/Spinner'

export function SettingsPage() {
  const {
    rpcEndpoint,
    defaultSlippageBps,
    defaultPriorityFee,
    fetchSettings,
    setRpcEndpoint,
    testRpcEndpoint,
    setSetting
  } = useSettingsStore()

  const [rpcInput, setRpcInput] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const [slippage, setSlippage] = useState(defaultSlippageBps)
  const [priority, setPriority] = useState(defaultPriorityFee)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    setRpcInput(rpcEndpoint)
    setSlippage(defaultSlippageBps)
    setPriority(defaultPriorityFee)
  }, [rpcEndpoint, defaultSlippageBps, defaultPriorityFee])

  const handleTestRpc = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testRpcEndpoint(rpcInput)
      setTestResult(result)
      if (result.ok) {
        toast.success(`RPC connected (${result.latencyMs}ms)`)
      } else {
        toast.error('RPC connection failed')
      }
    } catch {
      setTestResult({ ok: false, latencyMs: -1 })
      toast.error('RPC connection failed')
    }
    setTesting(false)
  }

  const handleSaveRpc = async () => {
    setSaving(true)
    try {
      await setRpcEndpoint(rpcInput)
      toast.success('RPC endpoint saved')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save')
    }
    setSaving(false)
  }

  const handleSaveDefaults = async () => {
    setSaving(true)
    try {
      await setSetting('default_slippage_bps', slippage.toString())
      await setSetting('default_priority_fee', priority.toString())
      toast.success('Default settings saved')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save')
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure RPC, defaults, and preferences</p>
      </div>

      {/* RPC Configuration */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-accent" />
          <h2 className="text-base font-semibold text-white">RPC Endpoint</h2>
        </div>

        <div>
          <label className="label">Endpoint URL</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={rpcInput}
              onChange={(e) => {
                setRpcInput(e.target.value)
                setTestResult(null)
              }}
              placeholder="https://api.mainnet-beta.solana.com"
            />
            <button onClick={handleTestRpc} disabled={testing || !rpcInput} className="btn-secondary">
              {testing ? <Spinner size="sm" /> : 'Test'}
            </button>
          </div>
        </div>

        {testResult && (
          <div
            className={`flex items-center gap-2 text-sm ${
              testResult.ok ? 'text-success' : 'text-danger'
            }`}
          >
            {testResult.ok ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Connected ({testResult.latencyMs}ms latency)
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                Connection failed
              </>
            )}
          </div>
        )}

        <button onClick={handleSaveRpc} disabled={saving || !rpcInput} className="btn-primary">
          {saving ? <Spinner size="sm" /> : 'Save RPC Endpoint'}
        </button>
      </div>

      {/* Default Trading Settings */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          <h2 className="text-base font-semibold text-white">Default Trading Settings</h2>
        </div>

        <div>
          <label className="label">Default Slippage: {slippage / 100}%</label>
          <input
            type="range"
            className="w-full accent-accent"
            value={slippage}
            onChange={(e) => setSlippage(parseInt(e.target.value))}
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
          <label className="label">Default Priority Fee (microLamports)</label>
          <input
            type="number"
            className="input"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
            min={0}
          />
        </div>

        <button onClick={handleSaveDefaults} disabled={saving} className="btn-primary">
          {saving ? <Spinner size="sm" /> : 'Save Defaults'}
        </button>
      </div>

      {/* Security Info */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent" />
          <h2 className="text-base font-semibold text-white">Security</h2>
        </div>
        <div className="space-y-2 text-sm text-gray-400">
          <p>
            Private keys are encrypted using your OS Keychain (macOS Keychain / Windows DPAPI)
            via Electron's safeStorage API.
          </p>
          <p>
            Keys are only decrypted in the main process when signing transactions. They never
            cross the IPC boundary to the renderer.
          </p>
          <p>
            The renderer runs with <code className="text-xs bg-surface-tertiary px-1.5 py-0.5 rounded">contextIsolation: true</code>,{' '}
            <code className="text-xs bg-surface-tertiary px-1.5 py-0.5 rounded">sandbox: true</code>, and{' '}
            <code className="text-xs bg-surface-tertiary px-1.5 py-0.5 rounded">nodeIntegration: false</code>.
          </p>
        </div>
      </div>
    </div>
  )
}
