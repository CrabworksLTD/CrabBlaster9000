import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannels, IpcEvents, IpcChannel, IpcEventChannel } from '@shared/types'

type InvokeParams<C extends IpcChannel> = IpcChannels[C]['params']
type InvokeResult<C extends IpcChannel> = IpcChannels[C]['result']

// Runtime allowlists to prevent arbitrary IPC channel invocation
const ALLOWED_INVOKE_CHANNELS: string[] = [
  'wallet:import', 'wallet:generate', 'wallet:list', 'wallet:delete',
  'wallet:fund', 'wallet:fund-random', 'wallet:fund-hopped', 'wallet:reclaim',
  'wallet:sell', 'wallet:refresh-balances',
  'bot:start', 'bot:stop', 'bot:status', 'bot:detected-trades',
  'tx:list', 'tx:clear', 'tx:export',
  'settings:get-rpc', 'settings:set-rpc', 'settings:test-rpc',
  'settings:get', 'settings:set',
  'settings:save-telegram-keys', 'settings:get-telegram-configured',
  'settings:test-telegram', 'settings:clear-telegram-keys',
  'pm:get-settings', 'pm:set-settings', 'pm:save-keys', 'pm:test-connection',
  'pm:leaderboard', 'pm:tracked-wallets', 'pm:track-wallet', 'pm:untrack-wallet',
  'pm:toggle-wallet', 'pm:wallet-trades', 'pm:copy-positions', 'pm:close-position',
  'pm:copy-log', 'pm:stats', 'pm:start', 'pm:stop', 'pm:state'
]

const ALLOWED_EVENT_CHANNELS: string[] = [
  'bot:state-changed', 'bot:trade-detected', 'tx:event', 'wallet:balance-update',
  'pm:trade-detected', 'pm:copy-executed', 'pm:position-updated', 'pm:state-changed'
]

const electronAPI = {
  invoke: <C extends IpcChannel>(channel: C, ...args: InvokeParams<C> extends void ? [] : [InvokeParams<C>]) => {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`Blocked IPC channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<C>>
  },
  on: <E extends IpcEventChannel>(channel: E, callback: (data: IpcEvents[E]) => void) => {
    if (!ALLOWED_EVENT_CHANNELS.includes(channel)) {
      return () => {} // no-op unsubscribe for blocked channels
    }
    const handler = (_event: Electron.IpcRendererEvent, data: IpcEvents[E]) => callback(data)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
