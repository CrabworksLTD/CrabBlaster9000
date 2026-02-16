import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useSettingsStore } from '../stores/settings-store'
import { Spinner } from '../components/common/Spinner'

export function SettingsPage() {
  const {
    rpcEndpoint, defaultSlippageBps, defaultPriorityFee,
    fetchSettings, setRpcEndpoint, testRpcEndpoint, setSetting
  } = useSettingsStore()

  const [rpcInput, setRpcInput] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [slippage, setSlippage] = useState(defaultSlippageBps)
  const [priority, setPriority] = useState(defaultPriorityFee)

  // Telegram state
  const [tgBotToken, setTgBotToken] = useState('')
  const [tgChatId, setTgChatId] = useState('')
  const [tgConfigured, setTgConfigured] = useState(false)
  const [tgTesting, setTgTesting] = useState(false)
  const [tgSaving, setTgSaving] = useState(false)

  useEffect(() => { fetchSettings() }, [fetchSettings])
  useEffect(() => {
    setRpcInput(rpcEndpoint); setSlippage(defaultSlippageBps); setPriority(defaultPriorityFee)
  }, [rpcEndpoint, defaultSlippageBps, defaultPriorityFee])

  // Fetch Telegram configured status on mount
  useEffect(() => {
    window.electronAPI.invoke('settings:get-telegram-configured')
      .then(setTgConfigured)
      .catch(() => {})
  }, [])

  const handleTestRpc = async () => {
    setTesting(true); setTestResult(null)
    try {
      const result = await testRpcEndpoint(rpcInput)
      setTestResult(result)
      toast[result.ok ? 'success' : 'error'](result.ok ? `Connected (${result.latencyMs}ms)` : 'Connection failed')
    } catch { setTestResult({ ok: false, latencyMs: -1 }); toast.error('Connection failed') }
    setTesting(false)
  }

  const handleSaveRpc = async () => {
    setSaving(true)
    try { await setRpcEndpoint(rpcInput); toast.success('RPC endpoint saved') } catch (err: any) { toast.error(err?.message || 'Failed') }
    setSaving(false)
  }

  const handleSaveDefaults = async () => {
    setSaving(true)
    try {
      await setSetting('default_slippage_bps', slippage.toString())
      await setSetting('default_priority_fee', priority.toString())
      toast.success('Defaults saved')
    } catch (err: any) { toast.error(err?.message || 'Failed') }
    setSaving(false)
  }

  const handleTestTelegram = async () => {
    if (!tgBotToken || !tgChatId) return
    setTgTesting(true)
    try {
      const result = await window.electronAPI.invoke('settings:test-telegram', { botToken: tgBotToken, chatId: tgChatId })
      toast[result.ok ? 'success' : 'error'](result.ok ? 'Test message sent!' : 'Failed — check token and chat ID')
    } catch { toast.error('Test failed') }
    setTgTesting(false)
  }

  const handleSaveTelegram = async () => {
    if (!tgBotToken || !tgChatId) return
    setTgSaving(true)
    try {
      await window.electronAPI.invoke('settings:save-telegram-keys', { botToken: tgBotToken, chatId: tgChatId })
      setTgConfigured(true)
      setTgBotToken('')
      setTgChatId('')
      toast.success('Telegram keys saved')
    } catch (err: any) { toast.error(err?.message || 'Failed') }
    setTgSaving(false)
  }

  const handleClearTelegram = async () => {
    try {
      await window.electronAPI.invoke('settings:clear-telegram-keys')
      setTgConfigured(false)
      toast.success('Telegram disconnected')
    } catch (err: any) { toast.error(err?.message || 'Failed') }
  }

  return (
    <div className="space-y-3 max-w-lg">
      {/* RPC */}
      <div className="win-groupbox">
        <span className="win-groupbox-label">RPC Endpoint</span>
        <div className="mt-2 space-y-2">
          <div>
            <label className="label">Endpoint URL:</label>
            <div className="flex gap-1">
              <input className="input flex-1" value={rpcInput} onChange={(e) => { setRpcInput(e.target.value); setTestResult(null) }} placeholder="https://api.mainnet-beta.solana.com" />
              <button onClick={handleTestRpc} disabled={testing || !rpcInput} className="btn-secondary">
                {testing ? <Spinner /> : 'Test'}
              </button>
            </div>
          </div>
          {testResult && (
            <p className={`text-[11px] ${testResult.ok ? 'text-success' : 'text-danger'}`}>
              {testResult.ok ? `OK - ${testResult.latencyMs}ms latency` : 'FAILED - Could not connect'}
            </p>
          )}
          <button onClick={handleSaveRpc} disabled={saving || !rpcInput} className="btn-primary">
            {saving ? <Spinner /> : 'Save'}
          </button>
        </div>
      </div>

      {/* Defaults */}
      <div className="win-groupbox">
        <span className="win-groupbox-label">Default Trading Settings</span>
        <div className="mt-2 space-y-2">
          <div>
            <label className="label">Default Slippage: {slippage / 100}%</label>
            <input type="range" className="w-full" value={slippage} onChange={(e) => setSlippage(parseInt(e.target.value))} min={50} max={5000} step={50} />
          </div>
          <div>
            <label className="label">Default Priority Fee (microLamports):</label>
            <input type="number" className="input" value={priority} onChange={(e) => setPriority(parseInt(e.target.value) || 0)} min={0} />
          </div>
          <button onClick={handleSaveDefaults} disabled={saving} className="btn-primary">
            {saving ? <Spinner /> : 'Save Defaults'}
          </button>
        </div>
      </div>

      {/* Telegram */}
      <div className="win-groupbox">
        <span className="win-groupbox-label">Telegram Notifications</span>
        <div className="mt-2 space-y-2">
          {tgConfigured ? (
            <>
              <p className="text-[11px] text-success">Connected — notifications will be sent to your Telegram chat.</p>
              <button onClick={handleClearTelegram} className="btn-secondary">Disconnect</button>
            </>
          ) : (
            <>
              <div>
                <label className="label">Bot Token:</label>
                <input className="input w-full" type="password" value={tgBotToken} onChange={(e) => setTgBotToken(e.target.value)} placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" />
              </div>
              <div>
                <label className="label">Chat ID:</label>
                <input className="input w-full" value={tgChatId} onChange={(e) => setTgChatId(e.target.value)} placeholder="-1001234567890" />
              </div>
              <div className="flex gap-1">
                <button onClick={handleSaveTelegram} disabled={tgSaving || !tgBotToken || !tgChatId} className="btn-primary">
                  {tgSaving ? <Spinner /> : 'Save'}
                </button>
                <button onClick={handleTestTelegram} disabled={tgTesting || !tgBotToken || !tgChatId} className="btn-secondary">
                  {tgTesting ? <Spinner /> : 'Test'}
                </button>
              </div>
              <div className="shadow-win-field bg-white p-2 text-[11px] space-y-1">
                <p><b>Setup:</b></p>
                <p>1. Message <b>@BotFather</b> on Telegram to create a bot.</p>
                <p>2. Copy the bot token.</p>
                <p>3. Start a chat with your bot, then get your chat ID from <b>@userinfobot</b>.</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Security */}
      <div className="win-groupbox">
        <span className="win-groupbox-label">Security Information</span>
        <div className="mt-2 shadow-win-field bg-white p-2 text-[11px] space-y-1">
          <p>Private keys encrypted via OS Keychain (Electron safeStorage API).</p>
          <p>Keys decrypted only in main process for transaction signing.</p>
          <p>Renderer: contextIsolation=true, sandbox=true, nodeIntegration=false.</p>
        </div>
      </div>
    </div>
  )
}
