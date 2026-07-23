-- D1 schema：取代本地 DuckDB 的 watchlist + analysis_cache
-- 在 Cloudflare 上執行：wrangler d1 execute stock-tracker-db --local --file=./migrations/0001_init.sql
-- 部屬後：        wrangler d1 execute stock-tracker-db --remote --file=./migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL DEFAULT 0,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT 'TW',
  addedAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(userId, symbol, market)
);

CREATE TABLE IF NOT EXISTS analysis_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL DEFAULT 0,
  symbol TEXT NOT NULL,
  analysisType TEXT NOT NULL,
  result TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_lookup
  ON analysis_cache(userId, symbol, analysisType, createdAt);

CREATE INDEX IF NOT EXISTS idx_watchlist_user
  ON watchlist(userId);
