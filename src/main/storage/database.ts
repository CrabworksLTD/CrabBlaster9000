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
      bot_mode TEXT NOT NULL CHECK(bot_mode IN ('bundle', 'volume', 'manual', 'copytrade')),
      round INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS detected_trades (
      id TEXT PRIMARY KEY,
      signature TEXT NOT NULL,
      target_wallet TEXT NOT NULL,
      token_mint TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('buy', 'sell')),
      amount_sol REAL NOT NULL,
      dex TEXT NOT NULL,
      replicated INTEGER NOT NULL DEFAULT 0,
      detected_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_detected_trades_detected_at ON detected_trades(detected_at DESC);
  `)

  // Migration: expand bot_mode CHECK constraint for existing databases
  migrateBotModeConstraint()
}

function migrateBotModeConstraint(): void {
  // Check if the transactions table has the old CHECK constraint (without 'copytrade')
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'").get() as { sql: string } | undefined
  if (!tableInfo) return

  // If 'copytrade' is already in the constraint, no migration needed
  if (tableInfo.sql.includes('copytrade')) return

  // Recreate table with updated constraint
  db.exec(`
    ALTER TABLE transactions RENAME TO transactions_old;

    CREATE TABLE transactions (
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
      bot_mode TEXT NOT NULL CHECK(bot_mode IN ('bundle', 'volume', 'manual', 'copytrade')),
      round INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    INSERT INTO transactions SELECT * FROM transactions_old;
    DROP TABLE transactions_old;

    CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
  `)
}
