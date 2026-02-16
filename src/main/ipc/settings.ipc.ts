import { ipcMain } from 'electron'
import { z } from 'zod'
import { getDb } from '../storage/database'
import { encryptKey } from '../storage/secure-storage'
import { getRpcEndpoint, setRpcEndpoint, testRpcEndpoint } from '../services/rpc-manager'
import {
  getTelegramNotifier,
  testTelegramConnection,
  saveTelegramKeys,
  clearTelegramKeys,
  isTelegramConfigured
} from '../services/telegram-notifier'

// Keys whose values should be encrypted before storage
const ENCRYPTED_SETTINGS_KEYS = new Set(['bags_api_key'])

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get-rpc', async () => {
    return getRpcEndpoint()
  })

  ipcMain.handle('settings:set-rpc', async (_event, params: unknown) => {
    const { endpoint } = z.object({
      endpoint: z.string().url().refine(
        (url) => url.startsWith('https://'),
        { message: 'RPC endpoint must use HTTPS' }
      )
    }).parse(params)
    setRpcEndpoint(endpoint)
  })

  ipcMain.handle('settings:test-rpc', async (_event, params: unknown) => {
    const { endpoint } = z.object({
      endpoint: z.string().url().refine(
        (url) => url.startsWith('https://'),
        { message: 'RPC endpoint must use HTTPS' }
      )
    }).parse(params)
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
    const storedValue = ENCRYPTED_SETTINGS_KEYS.has(key) ? encryptKey(value) : value
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, storedValue)
  })

  // Telegram
  ipcMain.handle('settings:save-telegram-keys', async (_event, params: unknown) => {
    const { botToken, chatId } = z.object({
      botToken: z.string().min(1),
      chatId: z.string().min(1)
    }).parse(params)
    saveTelegramKeys(botToken, chatId)
    getTelegramNotifier().reload()
  })

  ipcMain.handle('settings:get-telegram-configured', async () => {
    return isTelegramConfigured()
  })

  ipcMain.handle('settings:test-telegram', async (_event, params: unknown) => {
    const { botToken, chatId } = z.object({
      botToken: z.string().min(1),
      chatId: z.string().min(1)
    }).parse(params)
    const ok = await testTelegramConnection(botToken, chatId)
    return { ok }
  })

  ipcMain.handle('settings:clear-telegram-keys', async () => {
    clearTelegramKeys()
    getTelegramNotifier().reload()
  })
}
