import { create } from 'zustand'

interface SettingsStore {
  rpcEndpoint: string
  defaultSlippageBps: number
  defaultPriorityFee: number
  loading: boolean

  fetchSettings: () => Promise<void>
  setRpcEndpoint: (endpoint: string) => Promise<void>
  testRpcEndpoint: (endpoint: string) => Promise<{ ok: boolean; latencyMs: number }>
  setSetting: (key: string, value: string) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  rpcEndpoint: '',
  defaultSlippageBps: 300,
  defaultPriorityFee: 50000,
  loading: false,

  fetchSettings: async () => {
    set({ loading: true })
    try {
      const rpcEndpoint = await window.electronAPI.invoke('settings:get-rpc')
      const slippage = await window.electronAPI.invoke('settings:get', { key: 'default_slippage_bps' })
      const priorityFee = await window.electronAPI.invoke('settings:get', { key: 'default_priority_fee' })

      set({
        rpcEndpoint,
        defaultSlippageBps: slippage ? parseInt(slippage) : 300,
        defaultPriorityFee: priorityFee ? parseInt(priorityFee) : 50000,
        loading: false
      })
    } catch {
      set({ loading: false })
    }
  },

  setRpcEndpoint: async (endpoint: string) => {
    await window.electronAPI.invoke('settings:set-rpc', { endpoint })
    set({ rpcEndpoint: endpoint })
  },

  testRpcEndpoint: async (endpoint: string) => {
    return window.electronAPI.invoke('settings:test-rpc', { endpoint })
  },

  setSetting: async (key: string, value: string) => {
    await window.electronAPI.invoke('settings:set', { key, value })
    if (key === 'default_slippage_bps') set({ defaultSlippageBps: parseInt(value) })
    if (key === 'default_priority_fee') set({ defaultPriorityFee: parseInt(value) })
  }
}))
