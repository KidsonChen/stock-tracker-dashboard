/**
 * D1 資料層（Cloudflare Pages Functions 環境）。
 * 取代 server/db-duckdb.ts 的本地 DuckDB，介面保持一致，供 routers.ts 直接使用。
 * D1 binding 透過 setDB() 在 Functions 啟動時注入（來自 context.env.DB）。
 */

// Cloudflare D1Database 型別（runtime 由 workerd 提供，這裡用最小結構避免依賴）
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(col?: string): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: any }>;
}

// ---- module-level D1 binding（Functions 啟動時注入）----
let _db: D1Database | null = null;
export function setDB(db: D1Database): void {
  _db = db;
}
function getDB(): D1Database {
  if (!_db) throw new Error("[D1] DB binding 未初始化，請在 Functions 入口呼叫 setDB(env.DB)");
  return _db;
}

// ---- 型別（與 db-duckdb.ts 對齊）----
export type Watchlist = {
  id: number;
  userId: number;
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

const DEFAULT_USER = 0;

// ---- watchlist ----
export async function getWatchlist(): Promise<Watchlist[]> {
  try {
    const { results } = await getDB()
      .prepare("SELECT * FROM watchlist WHERE userId = ? ORDER BY addedAt ASC")
      .bind(DEFAULT_USER)
      .all<Watchlist>();
    return results;
  } catch (e) {
    console.error("[D1] getWatchlist failed", e);
    return [];
  }
}

export async function addToWatchlist(symbol: string, market = "TW"): Promise<void> {
  try {
    await getDB()
      .prepare(
        "INSERT OR IGNORE INTO watchlist (userId, symbol, market, addedAt, updatedAt) VALUES (?, ?, ?, datetime('now'), datetime('now'))"
      )
      .bind(DEFAULT_USER, symbol.toUpperCase(), market)
      .run();
  } catch (e) {
    console.error("[D1] addToWatchlist failed", e);
  }
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  try {
    await getDB()
      .prepare("DELETE FROM watchlist WHERE userId = ? AND symbol = ?")
      .bind(DEFAULT_USER, symbol.toUpperCase())
      .run();
  } catch (e) {
    console.error("[D1] removeFromWatchlist failed", e);
  }
}

// ---- analysis cache ----
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h

export async function isCacheExpired(symbol: string): Promise<boolean> {
  try {
    const row = await getDB()
      .prepare("SELECT createdAt FROM analysis_cache WHERE userId = ? AND symbol = ? ORDER BY createdAt DESC LIMIT 1")
      .bind(DEFAULT_USER, symbol.toUpperCase())
      .first<{ createdAt: string }>();
    if (!row) return true;
    const cachedAt = new Date(row.createdAt.replace(" ", "T") + "Z").getTime();
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
    const row = await getDB()
      .prepare(
        "SELECT * FROM analysis_cache WHERE userId = ? AND symbol = ? AND analysisType = ? ORDER BY createdAt DESC LIMIT 1"
      )
      .bind(userId, symbol.toUpperCase(), analysisType)
      .first<AnalysisCache>();
    return row || null;
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
    await getDB()
      .prepare(
        "INSERT INTO analysis_cache (userId, symbol, analysisType, result, createdAt) VALUES (?, ?, ?, ?, datetime('now'))"
      )
      .bind(userId, symbol.toUpperCase(), analysisType, result)
      .run();
  } catch (e) {
    console.error("[D1] saveAnalysisCache failed", e);
  }
}

export async function listAnalysisHistory(
  userId: number,
  symbol: string,
  analysisType?: string
): Promise<AnalysisCache[]> {
  try {
    const db = getDB();
    const sql = analysisType
      ? "SELECT * FROM analysis_cache WHERE userId = ? AND symbol = ? AND analysisType = ? ORDER BY createdAt DESC"
      : "SELECT * FROM analysis_cache WHERE userId = ? AND symbol = ? ORDER BY createdAt DESC";
    const params = analysisType
      ? [userId, symbol.toUpperCase(), analysisType]
      : [userId, symbol.toUpperCase()];
    const { results } = await db.prepare(sql).bind(...params).all<AnalysisCache>();
    return results;
  } catch (e) {
    console.error("[D1] listAnalysisHistory failed", e);
    return [];
  }
}

export async function getAnalysisById(
  userId: number,
  id: number
): Promise<AnalysisCache | null> {
  try {
    const row = await getDB()
      .prepare("SELECT * FROM analysis_cache WHERE userId = ? AND id = ?")
      .bind(userId, id)
      .first<AnalysisCache>();
    return row || null;
  } catch {
    return null;
  }
}

// ---- 以下為 DuckDB 版相容樁位（routers 未使用，保留以通過 import）----
export async function getStockDataBySymbol(_symbol: string, _limit = 100): Promise<any[]> {
  return [];
}
export async function saveStockData(_rows: any[]): Promise<void> {}
export async function getUserByOpenId(_openId: string): Promise<null> {
  return null;
}
export async function upsertUser(_user: any): Promise<null> {
  return null;
}
