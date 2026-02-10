import { useEffect } from 'react'
import type { IpcEventChannel, IpcEvents } from '@shared/types'

export function useIpcEvent<E extends IpcEventChannel>(
  channel: E,
  callback: (data: IpcEvents[E]) => void
): void {
  useEffect(() => {
    const unsubscribe = window.electronAPI.on(channel, callback)
    return unsubscribe
  }, [channel, callback])
}
