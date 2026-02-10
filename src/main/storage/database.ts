import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'solana-bot.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations()
}

function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      is_main INTEGER NOT NULL DEFAULT 0,
      encrypted_key TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      signature TEXT,
      wallet_id TEXT NOT NULL,
      wallet_public_key TEXT NOT NULL,
      token_mint TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('buy', 'sell')),
      amount_sol REAL NOT NULL,
      amount_token REAL,
      dex TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'failed')),
      error TEXT,
      bot_mode TEXT NOT NULL CHECK(bot_mode IN ('bundle', 'volume', 'manual')),
      round INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
  `)
}
