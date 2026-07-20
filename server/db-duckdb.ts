import { createRequire } from "module";
import * as fs from "fs";
import * as path from "path";
import type { User } from "../drizzle/schema";

// duckdb 是 CommonJS（export = duckdb），ESM 下無 default/named export，
// 須用 createRequire 取得整包後解構。型別統一用 any（thin shim，不依賴嚴格型別）。
const require = createRequire(process.cwd() + "/_db_shim.js");
const duckdb = require("duckdb");
const { Database } = duckdb as any;

/**
 * DuckDB 本地資料層（替代原 Supabase）。
 * 單一檔案嵌入式 DB，零伺服器、零 API key。
 * 路徑：./data/stock.db（不存在則自動建表）
 *
 * 注意：duckdb@1.4.4 的 API 為 callback 風格：
 *   db.exec(sql, cb)
 *   conn = db.connect()
 *   conn.prepare(sql).run(...params, cb)
 *   conn.prepare(sql).all(...params, cb)
 */

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = process.env.DUCKDB_PATH || path.join(DATA_DIR, "stock.db");

let _db: any = null;
let _conn: any = null;
let _initPromise: Promise<any> | null = null;
// 序列化所有 SQL 執行，避免 duckdb 1.4.4 在並發 statement 時觸發
// "unique_ptr is NULL" 內部錯誤（單一連線 + 佇列最穩）。
let _chain: Promise<any> = Promise.resolve();
// init 完成閘門：確保所有 SQL 都在 _conn 就緒後才執行
let _ready: Promise<void> | null = null;

export function getDB(): Promise<any> {
  if (_db && _conn && _ready) return Promise.resolve(_db);
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    // 既有 DB 檔 → 先健全度檢查（開檔 + SELECT 1）。
    // 若檔案已損毀（unique_ptr is NULL / WAL replay 失敗 / 連線建立失敗等），
    // 將其隔離為 stock.db.corrupt.<ts> 後重建空白 DB，否則每次查詢都會崩潰
    // （getWatchlist 會一直噴 INTERNAL Error: unique_ptr is NULL）。
    // 注意：若檔案被其他程序鎖定（EBUSY），不擅自重建，直接往上拋錯。
    if (fs.existsSync(DB_PATH)) {
      try {
        const probe = new Database(DB_PATH);
        await new Promise<void>((resolve, reject) => {
          let conn: any;
          try {
            conn = probe.connect();
          } catch (e) {
            return reject(e);
          }
          conn.all("SELECT 1", (e: any) => (e ? reject(e) : resolve()));
        });
        await new Promise<void>((resolve) => probe.close(() => resolve()));
      } catch (e: any) {
        const msg = (e && (e.message ? String(e.message) : String(e))) || "";
        const isLock =
          msg.includes("being used by another process") ||
          msg.includes("EBUSY") ||
          msg.includes("resource busy or locked");
        if (isLock) throw e; // 鎖定錯誤：讓持有者繼續使用，不重建
        // 其餘開檔/查詢失敗一律視為損毀，隔離後重建空白 DB
        const ts = Date.now();
        const damaged = `${DB_PATH}.corrupt.${ts}`;
        try {
          fs.renameSync(DB_PATH, damaged);
          const wal = `${DB_PATH}.wal`;
          if (fs.existsSync(wal)) fs.renameSync(wal, `${wal}.corrupt.${ts}`);
          console.error(
            `[DB] 既有資料庫已損毀，已隔離至 ${damaged}，將重建空白資料庫。`
          );
        } catch (renameErr) {
          console.error(`[DB] 無法隔離損毀資料庫：`, renameErr);
        }
      }
    }

    const db = new Database(DB_PATH);
    // 建立單一持久連線（全程只使用這條 _conn，絕不混用 db.exec 的
    // 內部 default connection —— 同檔雙連線併發是 duckdb 1.4.4
    // unique_ptr is NULL 檔案損毀的根源）。DDL 與查詢都走 _conn，
    // 並統一經由 _chain 串行，避免啟動期 DDL 與查詢在同一連線上併發。
    _conn = db.connect();
    _db = db;
    _ready = Promise.resolve();

    // 所有 DDL 也經由 _conn + _chain 執行（與查詢共用同一串行佇列）
    const connExec = (sql: string) =>
      withConn<void>((conn) =>
        new Promise<void>((resolve, reject) => {
          conn.exec(sql, (e: any) => (e ? reject(e) : resolve()));
        })
      );

    await connExec(
      `CREATE TABLE IF NOT EXISTS watchlist (
          id INTEGER PRIMARY KEY,
          symbol VARCHAR NOT NULL,
          market VARCHAR DEFAULT 'TW',
          addedAt TIMESTAMP DEFAULT now(),
          updatedAt TIMESTAMP DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS stock_data (
          id INTEGER PRIMARY KEY,
          symbol VARCHAR NOT NULL,
          date VARCHAR NOT NULL,
          open DOUBLE,
          high DOUBLE,
          low DOUBLE,
          close DOUBLE,
          volume VARCHAR,
          cachedAt TIMESTAMP DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS analysis_cache (
          id INTEGER PRIMARY KEY,
          userId INTEGER NOT NULL,
          symbol VARCHAR NOT NULL,
          analysisType VARCHAR NOT NULL,
          result TEXT,
          createdAt TIMESTAMP DEFAULT now()
        );
        CREATE SEQUENCE IF NOT EXISTS watchlist_seq START 1;
        CREATE SEQUENCE IF NOT EXISTS stock_data_seq START 1;
        CREATE SEQUENCE IF NOT EXISTS analysis_cache_seq START 1;`
    );
    // 向後相容：舊資料庫的 watchlist 可能沒有 market 欄，補上（已存在則忽略）
    try {
      await connExec(`ALTER TABLE watchlist ADD COLUMN market VARCHAR DEFAULT 'TW'`);
    } catch {
      // 欄位已存在，忽略
    }
    return db;
  })();

  return _initPromise;
}

// ---- callback -> Promise 封裝（經由 _chain 嚴格串行，prepare + 展開參數）----

async function withConn<T>(fn: (conn: any) => Promise<T>): Promise<T> {
  // 確保 init（_conn）完成
  if (!_conn) await getDB();
  const task = _chain.then(() => fn(_conn));
  // 保證鏈不中斷（錯誤也接住，往下走）
  _chain = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

function all<T = any>(_db: any, sql: string, params: any[] = []): Promise<T[]> {
  return withConn<T[]>((conn) => {
    return new Promise<T[]>((resolve, reject) => {
      const stmt = conn.prepare(sql, (e: any) => (e ? reject(e) : null));
      stmt.all(...params, (e: any, rows: T[]) =>
        e ? reject(e) : resolve(rows || [])
      );
    });
  });
}

function run(_db: any, sql: string, params: any[] = []): Promise<void> {
  return withConn<void>((conn) => {
    return new Promise<void>((resolve, reject) => {
      const stmt = conn.prepare(sql, (e: any) => (e ? reject(e) : null));
      stmt.run(...params, (e: any) => (e ? reject(e) : resolve()));
    });
  });
}

export type Watchlist = {
  id: number;
  symbol: string;
  market: string;
  addedAt: string;
  updatedAt: string;
};

export type AnalysisCache = {
  id: number;
  userId: number;
  symbol: string;
  analysisType: string;
  result: string;
  createdAt: string;
};

export type QuoteData = {
  c: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
};

export type CandleRow = {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

export async function getWatchlist(): Promise<Watchlist[]> {
  try {
    const db = await getDB();
    return await all<Watchlist>(db, "SELECT * FROM watchlist ORDER BY addedAt ASC");
  } catch (e) {
    console.error("[DB] getWatchlist failed", e);
    return [];
  }
}

export async function addToWatchlist(
  symbol: string,
  market = "TW"
): Promise<Watchlist> {
  const db = await getDB();
  const sym = symbol.toUpperCase();
  const mkt = (market || "TW").toUpperCase();
  const existing = await all<Watchlist>(
    db,
    "SELECT * FROM watchlist WHERE symbol = ? AND market = ?",
    [sym, mkt]
  );
  if (existing.length > 0) return existing[0];
  await run(
    db,
    "INSERT INTO watchlist (id, symbol, market, addedAt, updatedAt) VALUES (nextval('watchlist_seq'), ?, ?, now(), now())",
    [sym, mkt]
  );
  const row = await all<Watchlist>(
    db,
    "SELECT * FROM watchlist WHERE symbol = ? AND market = ?",
    [sym, mkt]
  );
  return row[0];
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  const db = await getDB();
  await run(db, "DELETE FROM watchlist WHERE symbol = ?", [symbol.toUpperCase()]);
}

export async function getStockDataBySymbol(symbol: string, limit = 100): Promise<CandleRow[]> {
  try {
    const db = await getDB();
    return (await all<CandleRow>(
      db,
      "SELECT * FROM stock_data WHERE symbol = ? ORDER BY date DESC LIMIT ?",
      [symbol.toUpperCase(), limit]
    )).map((row) => ({
      symbol: row.symbol,
      date: row.date,
      open: Number(row.open ?? 0),
      high: Number(row.high ?? 0),
      low: Number(row.low ?? 0),
      close: Number(row.close ?? 0),
      volume: Number(row.volume ?? 0),
    }));
  } catch (e) {
    console.error("[DB] getStockDataBySymbol failed", e);
    return [];
  }
}

export async function saveStockData(rows: CandleRow[]): Promise<void> {
  if (!rows.length) return;
  const db = await getDB();
  for (const row of rows) {
    await run(db, "DELETE FROM stock_data WHERE symbol = ? AND date = ?", [row.symbol.toUpperCase(), row.date]);
    await run(
      db,
      "INSERT INTO stock_data (id, symbol, date, open, high, low, close, volume, cachedAt) VALUES (nextval('stock_data_seq'), ?, ?, ?, ?, ?, ?, ?, now())",
      [
        row.symbol.toUpperCase(),
        row.date,
        row.open,
        row.high,
        row.low,
        row.close,
        String(row.volume),
      ]
    );
  }
}

export async function isCacheExpired(symbol: string): Promise<boolean> {
  try {
    const db = await getDB();
    const rows = await all<{ cachedAt: string }>(
      db,
      "SELECT cachedAt FROM stock_data WHERE symbol = ? ORDER BY cachedAt DESC LIMIT 1",
      [symbol.toUpperCase()]
    );
    if (!rows.length) return true;
    const cachedAt = new Date(rows[0].cachedAt).getTime();
    return Date.now() - cachedAt > CACHE_EXPIRY_MS;
  } catch {
    return true;
  }
}

export async function getAnalysisCache(
  userId: number,
  symbol: string,
  analysisType: string
): Promise<AnalysisCache | null> {
  try {
    const db = await getDB();
    const rows = await all<AnalysisCache>(
      db,
      "SELECT * FROM analysis_cache WHERE userId = ? AND symbol = ? AND analysisType = ? ORDER BY createdAt DESC LIMIT 1",
      [userId, symbol.toUpperCase(), analysisType]
    );
    return rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function saveAnalysisCache(
  userId: number,
  symbol: string,
  analysisType: string,
  result: string
): Promise<void> {
  try {
    const db = await getDB();
    await run(
      db,
      "INSERT INTO analysis_cache (id, userId, symbol, analysisType, result, createdAt) VALUES (nextval('analysis_cache_seq'), ?, ?, ?, ?, now())",
      [userId, symbol.toUpperCase(), analysisType, result]
    );
  } catch (e) {
    console.error("[DB] saveAnalysisCache failed", e);
  }
}

// --- 以下原 Supabase 專用（users），本 DuckDB 版不用，保留樁位以兼容 import ---
export async function getUserByOpenId(_openId: string): Promise<User | null> {
  return null;
}
export async function upsertUser(_user: Partial<User>): Promise<User | null> {
  return null;
}
