import { useCallback, useEffect } from 'react'
import { useBotStore } from '../stores/bot-store'
import { useIpcEvent } from './useIpcEvent'
import type { BotState } from '@shared/types'

export function useBotStatus() {
  const { state, fetchStatus, setState } = useBotStore()

  const handleStateChange = useCallback(
    (newState: BotState) => {
      setState(newState)
    },
    [setState]
  )

  useIpcEvent('bot:state-changed', handleStateChange)

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  return state
}
