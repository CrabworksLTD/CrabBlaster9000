import { getDb } from '../storage/database'
import { encryptKey, decryptKey } from '../storage/secure-storage'

class TelegramNotifier {
  private botToken: string | null = null
  private chatId: string | null = null
  private enabled = false

  init(): void {
    try {
      const db = getDb()
      const tokenRow = db
        .prepare("SELECT value FROM settings WHERE key = 'telegram_bot_token'")
        .get() as { value: string } | undefined
      const chatRow = db
        .prepare("SELECT value FROM settings WHERE key = 'telegram_chat_id'")
        .get() as { value: string } | undefined

      if (tokenRow && chatRow) {
        this.botToken = decryptKey(tokenRow.value)
        this.chatId = decryptKey(chatRow.value)
        this.enabled = true
      }
    } catch (err) {
      console.error('TelegramNotifier init failed:', err)
      this.enabled = false
    }
  }

  reload(): void {
    this.botToken = null
    this.chatId = null
    this.enabled = false
    this.init()
  }

  isConfigured(): boolean {
    return this.enabled
  }

  async send(text: string): Promise<boolean> {
    if (!this.enabled || !this.botToken || !this.chatId) return false

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.chatId,
            text,
            parse_mode: 'HTML'
          })
        }
      )
      return res.ok
    } catch (err) {
      console.error('Telegram send failed:', err)
      return false
    }
  }

  async notifyTradeDetected(trade: {
    tokenMint: string
    direction: string
    amountSol: number
    dex: string
    targetWallet: string
  }): Promise<void> {
    const mintShort = trade.tokenMint.slice(0, 8) + '...'
    const dir = trade.direction.toUpperCase()
    await this.send(
      `🔍 <b>TRADE DETECTED</b>\n` +
        `${dir} on ${trade.dex}\n` +
        `Token: <code>${mintShort}</code>\n` +
        `Amount: ${trade.amountSol.toFixed(4)} SOL\n` +
        `Target: <code>${trade.targetWallet.slice(0, 8)}...</code>`
    )
  }

  async notifyTxConfirmed(tx: {
    direction: string
    amountSol: number
    tokenMint: string
    dex: string
    signature: string
    botMode: string
  }): Promise<void> {
    const mintShort = tx.tokenMint.slice(0, 8) + '...'
    const dir = tx.direction.toUpperCase()
    const sigShort = tx.signature.slice(0, 12) + '...'
    await this.send(
      `✅ <b>TX CONFIRMED</b>\n` +
        `${dir} ${tx.amountSol.toFixed(4)} SOL\n` +
        `Token: <code>${mintShort}</code>\n` +
        `DEX: ${tx.dex} | Mode: ${tx.botMode}\n` +
        `Sig: <code>${sigShort}</code>`
    )
  }

  async notifyTxFailed(tx: {
    direction: string
    amountSol: number
    tokenMint: string
    dex: string
    error: string | null
    botMode: string
  }): Promise<void> {
    const mintShort = tx.tokenMint.slice(0, 8) + '...'
    const dir = tx.direction.toUpperCase()
    await this.send(
      `❌ <b>TX FAILED</b>\n` +
        `${dir} ${tx.amountSol.toFixed(4)} SOL\n` +
        `Token: <code>${mintShort}</code>\n` +
        `DEX: ${tx.dex} | Mode: ${tx.botMode}\n` +
        `Error: ${tx.error || 'Unknown'}`
    )
  }

  async notifyBotStarted(mode: string): Promise<void> {
    await this.send(`🚀 <b>BOT STARTED</b>\nMode: ${mode}`)
  }

  async notifyBotStopped(mode: string): Promise<void> {
    await this.send(`🛑 <b>BOT STOPPED</b>\nMode: ${mode}`)
  }

  async notifyBotError(mode: string, error: string): Promise<void> {
    await this.send(
      `⚠️ <b>BOT ERROR</b>\nMode: ${mode}\nError: ${error}`
    )
  }
}

let instance: TelegramNotifier | null = null

export function getTelegramNotifier(): TelegramNotifier {
  if (!instance) {
    instance = new TelegramNotifier()
  }
  return instance
}

// Standalone helpers for IPC handlers (no singleton needed)

export async function testTelegramConnection(
  botToken: string,
  chatId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '🦀 CrabBlaster9000 connected!',
          parse_mode: 'HTML'
        })
      }
    )
    return res.ok
  } catch {
    return false
  }
}

export function saveTelegramKeys(botToken: string, chatId: string): void {
  const db = getDb()
  const encToken = encryptKey(botToken)
  const encChat = encryptKey(chatId)
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'telegram_bot_token',
    encToken
  )
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'telegram_chat_id',
    encChat
  )
}

export function clearTelegramKeys(): void {
  const db = getDb()
  db.prepare("DELETE FROM settings WHERE key IN ('telegram_bot_token', 'telegram_chat_id')").run()
}

export function isTelegramConfigured(): boolean {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM settings WHERE key IN ('telegram_bot_token', 'telegram_chat_id')"
    )
    .get() as { cnt: number }
  return row.cnt === 2
}
