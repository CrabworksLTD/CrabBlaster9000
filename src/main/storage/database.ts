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

    CREATE TABLE IF NOT EXISTS pm_tracked_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proxy_wallet TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      win_rate REAL NOT NULL DEFAULT 0,
      pnl REAL NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      rank INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_trade_check INTEGER,
      added_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS pm_wallet_trades (
      id TEXT PRIMARY KEY,
      wallet_id INTEGER NOT NULL REFERENCES pm_tracked_wallets(id),
      condition_id TEXT NOT NULL DEFAULT '',
      token_id TEXT NOT NULL,
      side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
      outcome TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL,
      size REAL NOT NULL,
      market_title TEXT NOT NULL DEFAULT '',
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pm_copy_positions (
      id TEXT PRIMARY KEY,
      source_trade_id TEXT NOT NULL,
      wallet_id INTEGER NOT NULL REFERENCES pm_tracked_wallets(id),
      token_id TEXT NOT NULL,
      market_title TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL DEFAULT '',
      side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
      entry_price REAL NOT NULL,
      current_price REAL NOT NULL,
      size REAL NOT NULL,
      cost_basis REAL NOT NULL,
      consensus_score REAL NOT NULL DEFAULT 0,
      unrealized_pnl REAL NOT NULL DEFAULT 0,
      realized_pnl REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
      close_reason TEXT,
      clob_order_id TEXT,
      opened_at INTEGER NOT NULL DEFAULT (unixepoch()),
      closed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS pm_copy_log (
      id TEXT PRIMARY KEY,
      position_id TEXT NOT NULL,
      wallet_id INTEGER NOT NULL,
      wallet_name TEXT NOT NULL DEFAULT '',
      market_title TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL DEFAULT '',
      side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
      entry_price REAL NOT NULL,
      exit_price REAL NOT NULL,
      size REAL NOT NULL,
      pnl REAL NOT NULL,
      pnl_pct REAL NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0,
      close_reason TEXT NOT NULL DEFAULT '',
      opened_at INTEGER NOT NULL,
      closed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pm_wallet_trades_wallet_id ON pm_wallet_trades(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_pm_wallet_trades_timestamp ON pm_wallet_trades(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_pm_copy_positions_status ON pm_copy_positions(status);
    CREATE INDEX IF NOT EXISTS idx_pm_copy_positions_wallet_id ON pm_copy_positions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_pm_copy_log_closed_at ON pm_copy_log(closed_at DESC);
  `)

  // Migration: expand bot_mode CHECK constraint for existing databases
  migrateBotModeConstraint()

  // Migration: add consensus_score column to pm_copy_positions for existing databases
  migrateConsensusScore()
}

function migrateConsensusScore(): void {
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pm_copy_positions'").get() as { sql: string } | undefined
  if (!tableInfo) return
  if (tableInfo.sql.includes('consensus_score')) return

  db.exec(`ALTER TABLE pm_copy_positions ADD COLUMN consensus_score REAL NOT NULL DEFAULT 0`)
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
