import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannels, IpcEvents, IpcChannel, IpcEventChannel } from '@shared/types'

type InvokeParams<C extends IpcChannel> = IpcChannels[C]['params']
type InvokeResult<C extends IpcChannel> = IpcChannels[C]['result']

const electronAPI = {
  invoke: <C extends IpcChannel>(channel: C, ...args: InvokeParams<C> extends void ? [] : [InvokeParams<C>]) => {
    return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<C>>
  },
  on: <E extends IpcEventChannel>(channel: E, callback: (data: IpcEvents[E]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: IpcEvents[E]) => callback(data)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
