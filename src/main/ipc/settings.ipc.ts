import { ipcMain } from 'electron'
import { z } from 'zod'
import { getDb } from '../storage/database'
import { getRpcEndpoint, setRpcEndpoint, testRpcEndpoint } from '../services/rpc-manager'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get-rpc', async () => {
    return getRpcEndpoint()
  })

  ipcMain.handle('settings:set-rpc', async (_event, params: unknown) => {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(params)
    setRpcEndpoint(endpoint)
  })

  ipcMain.handle('settings:test-rpc', async (_event, params: unknown) => {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(params)
    return testRpcEndpoint(endpoint)
  })

  ipcMain.handle('settings:get', async (_event, params: unknown) => {
    const { key } = z.object({ key: z.string().min(1) }).parse(params)
    const db = getDb()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  })

  ipcMain.handle('settings:set', async (_event, params: unknown) => {
    const { key, value } = z.object({ key: z.string().min(1), value: z.string() }).parse(params)
    const db = getDb()
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  })
}
