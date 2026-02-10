import { create } from 'zustand'
import type { BotState, BotConfig } from '@shared/types'

interface BotStore {
  state: BotState
  config: BotConfig | null

  startBot: (config: BotConfig) => Promise<void>
  stopBot: () => Promise<void>
  fetchStatus: () => Promise<void>
  setState: (state: BotState) => void
  setConfig: (config: BotConfig) => void
}

const initialState: BotState = {
  status: 'idle',
  mode: null,
  currentRound: 0,
  totalRounds: 0,
  tradesCompleted: 0,
  tradesFailed: 0,
  startedAt: null,
  error: null
}

export const useBotStore = create<BotStore>((set) => ({
  state: initialState,
  config: null,

  startBot: async (config: BotConfig) => {
    set({ config })
    await window.electronAPI.invoke('bot:start', config)
  },

  stopBot: async () => {
    await window.electronAPI.invoke('bot:stop')
  },

  fetchStatus: async () => {
    const state = await window.electronAPI.invoke('bot:status')
    set({ state })
  },

  setState: (state: BotState) => set({ state }),
  setConfig: (config: BotConfig) => set({ config })
}))
