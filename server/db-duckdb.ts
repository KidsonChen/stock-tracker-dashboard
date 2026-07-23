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

function getDBPath(): string {
  return process.env.DUCKDB_PATH || path.join(DATA_DIR, "stock.db");
}

function getRecoveryDBPath(basePath: string): string {
  const ext = path.extname(basePath);
  const stem = path.basename(basePath, ext);
  const dir = path.dirname(basePath);
  return path.join(dir, `${stem}.recovered.${Date.now()}${ext}`);
}

let _db: any = null;
let _conn: any = null;
let _initPromise: Promise<any> | null = null;
// 序列化所有 SQL 執行，避免 duckdb 1.4.4 在並發 statement 時觸發
// "unique_ptr is NULL" 內部錯誤（單一連線 + 佇列最穩）。
let _chain: Promise<any> = Promise.resolve();
// init 完成閘門：確保所有 SQL 都在 _conn 就緒後才執行
let _ready: Promise<void> | null = null;

async function closeDuckDBHandle(handle: any): Promise<void> {
  if (!handle) return;
  try {
    if (typeof handle.close === "function") {
      await new Promise<void>((resolve) => {
        try {
          handle.close(() => resolve());
        } catch {
          resolve();
        }
      });
    }
  } catch {
    // Ignore close failures; the connection is already broken or unavailable.
  }
}

async function resetDuckDBState(): Promise<void> {
  _chain = Promise.resolve();
  _ready = null;
  _initPromise = null;
  const previousDb = _db;
  const previousConn = _conn;
  _db = null;
  _conn = null;
  await Promise.allSettled([closeDuckDBHandle(previousConn), closeDuckDBHandle(previousDb)]);
}

export function getDB(): Promise<any> {
  if (_db && _conn && _ready) return Promise.resolve(_db);
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    let DB_PATH = getDBPath();
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    // 開檔策略（關鍵修正）：
    // 舊邏輯會先開一個「臨時」Database 句柄做 SELECT 1 probe，再關掉、再開
    // 正式句柄。在 Windows + DuckDB 1.4.4 下，這種「開→關→再開同一檔案」
    // 極易因檔案鎖釋放延遲而自我鎖定（EBUSY），被誤判成「檔案損毀」，
    // 進而 rename 隔離失敗 → 切到空的 *.recovered.* 檔 → 讀到空資料、查詢全炸。
    // 修正：直接開「正式」db，並用同一個 db 的 conn 做 SELECT 1 驗證，
    // 絕不再開第二個 Database 句柄。
    //   - 鎖定類錯誤（EBUSY / being used by another process / resource busy）：
    //     一律「不隔離、不切 recovered」，改為 sleep 後重試開檔（鎖通常是
    //     暫時的，延遲釋放後即可成功）。只有真的重試多次仍失敗才放棄。
    //   - 真正損毀（corrupt / not a database / unable to read）：才隔離重建。
    // 說明：本專案已用 data/.server.lock 保證單一 process 開檔，不會有跨
    // process 長期併發；會遇到的鎖幾乎都是上一個句柄釋放延遲，重試即可。
    const isLockError = (msg: string) =>
      msg.includes("EBUSY") ||
      msg.includes("being used by another process") ||
      msg.includes("resource busy or locked") ||
      msg.includes("database is locked") ||
      msg.includes("Conflicting lock");

    const isCorruptError = (msg: string) =>
      msg.includes("corrupt") ||
      msg.includes("not a database") ||
      msg.includes("unable to read") ||
      msg.includes("magic number") ||
      msg.includes("Checksum") ||
      msg.includes("unique_ptr is NULL");

    let db: any = null;
    let opened = false;
    const MAX_OPEN_RETRY = 5;
    for (let attempt = 1; attempt <= MAX_OPEN_RETRY && !opened; attempt++) {
      try {
        db = new Database(DB_PATH);
        _conn = db.connect();
        // 用同一個 db 的 conn 驗證（不再開新 Database 句柄）
        await new Promise<void>((resolve, reject) => {
          _conn.all("SELECT 1", (e: any) => (e ? reject(e) : resolve()));
        });
        opened = true;
      } catch (e: any) {
        const msg = (e && (e.message ? String(e.message) : String(e))) || "";
        await resetDuckDBState();
        if (isLockError(msg) && attempt < MAX_OPEN_RETRY) {
          console.warn(
            `[DB] 開檔遇到鎖定（${msg}），第 ${attempt} 次重試（${MAX_OPEN_RETRY - attempt} 次剩餘）...`
          );
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        if (isCorruptError(msg)) {
          const ts = Date.now();
          const damaged = `${DB_PATH}.corrupt.${ts}`;
          const wal = `${DB_PATH}.wal`;
          const damagedWal = `${wal}.corrupt.${ts}`;
          try {
            fs.renameSync(DB_PATH, damaged);
            if (fs.existsSync(wal)) fs.renameSync(wal, damagedWal);
            console.error(
              `[DB] 既有資料庫已損毀（${msg || "未知錯誤"}），已隔離至 ${damaged}，將重建空白資料庫。`
            );
          } catch (renameErr) {
            console.warn(`[DB] 無法隔離損毀資料庫，將切換到新的檔案：`, renameErr);
          }
          DB_PATH = getRecoveryDBPath(DB_PATH);
          process.env.DUCKDB_PATH = DB_PATH;
          console.warn(`[DB] 使用新的資料庫路徑：${DB_PATH}`);
          // 用新路徑再試一次開檔
          attempt = 0;
          continue;
        }
        // 其他未知錯誤：放棄，拋出
        throw e;
      }
    }
    if (!opened || !db) {
      throw new Error(`[DB] 無法開啟資料庫（路徑 ${DB_PATH}），已重試 ${MAX_OPEN_RETRY} 次仍失敗。`);
    }
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
  if (!_conn) await getDB();
  if (!_conn) throw new Error("DuckDB connection unavailable");

  const attempt = async (conn: any): Promise<T> => {
    try {
      return await fn(conn);
    } catch (e: any) {
      const msg = (e && (e.message ? String(e.message) : String(e))) || "";
      if (
        msg.includes("Connection was never established") ||
        msg.includes("Connection has been closed")
      ) {
        console.warn("[DB] 連線遺失（%s），嘗試重建...", msg);
        try {
          await resetDuckDBState();
          await getDB();
          return await fn(_conn);
        } catch (reconnectErr) {
          console.error("[DB] 重建連線失敗：", reconnectErr);
          throw e;
        }
      }
      throw e;
    }
  };

  const task = _chain.then(() => attempt(_conn));
  _chain = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

// DuckDB 1.4.4 會把整數/序列值以 JS BigInt 回傳，而 tRPC + superjson
// 在序列化 BigInt 時會拋 "Do not know how to serialize a BigInt"，
// 導致所有讀取/寫入的結果在回傳前端時炸成 500（前端誤以為失敗、
// 不切換到選中狀態、K 線圖永遠不出現）。這裡在統一出口把 BigInt
// 轉成 Number（安全，本專案所有 id/count/price 都在 Number 範圍內）。
function serializeRow(row: any): any {
  if (row === null || row === undefined) return row;
  if (typeof row === "bigint") return Number(row);
  if (Array.isArray(row)) return row.map(serializeRow);
  if (typeof row === "object") {
    const out: any = {};
    for (const k of Object.keys(row)) out[k] = serializeRow(row[k]);
    return out;
  }
  return row;
}

function all<T = any>(_db: any, sql: string, params: any[] = []): Promise<T[]> {
  return withConn<T[]>((conn) => {
    return new Promise<T[]>((resolve, reject) => {
      const stmt = conn.prepare(sql, (e: any) => (e ? reject(e) : null));
      stmt.all(...params, (e: any, rows: T[]) => {
        if (e) return reject(e);
        const safe = (rows || []).map(serializeRow);
        resolve(safe as T[]);
      });
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

/**
 * 列出某 symbol 的分析歷史紀錄（所有版本，新→舊），供前端「歷史紀錄」下拉使用。
 */
export async function listAnalysisHistory(
  userId: number,
  symbol: string,
  analysisType?: string
): Promise<AnalysisCache[]> {
  try {
    const db = await getDB();
    const sql = analysisType
      ? "SELECT * FROM analysis_cache WHERE userId = ? AND symbol = ? AND analysisType = ? ORDER BY createdAt DESC"
      : "SELECT * FROM analysis_cache WHERE userId = ? AND symbol = ? ORDER BY createdAt DESC";
    const params = analysisType
      ? [userId, symbol.toUpperCase(), analysisType]
      : [userId, symbol.toUpperCase()];
    return await all<AnalysisCache>(db, sql, params);
  } catch (e) {
    console.error("[DB] listAnalysisHistory failed", e);
    return [];
  }
}

/**
 * 依 id 取單筆分析紀錄（使用者從歷史下拉選了某一筆）。
 */
export async function getAnalysisById(
  userId: number,
  id: number
): Promise<AnalysisCache | null> {
  try {
    const db = await getDB();
    const rows = await all<AnalysisCache>(
      db,
      "SELECT * FROM analysis_cache WHERE userId = ? AND id = ?",
      [userId, id]
    );
    return rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

// --- 以下原 Supabase 專用（users），本 DuckDB 版不用，保留樁位以兼容 import ---
export async function getUserByOpenId(_openId: string): Promise<User | null> {
  return null;
}
export async function upsertUser(_user: Partial<User>): Promise<User | null> {
  return null;
}
