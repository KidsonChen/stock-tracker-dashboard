/**
 * R2 資料層（Cloudflare Pages Functions 環境）。
 * 取代 D1 / 本地 DuckDB：watchlist 與 analysis_cache 以 JSON 物件存於 R2 bucket。
 * - watchlist: 單一物件 key = "watchlist.json"（陣列）
 * - analysis_cache: 每筆一個 key = "analysis/<id>.json"，list 時用前綴列舉後過濾
 *
 * 介面與 db-d1.ts / db-duckdb.ts 一致，供 routers.ts 直接使用。
 * R2 binding 透過 setBucket() 在 Functions 啟動時注入（來自 context.env.BUCKET）。
 */

// Cloudflare R2 最小型別（runtime 由 workerd 提供）
interface R2ObjectBody {
  key: string;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}
interface R2Bucket {
  put(key: string, value: string | ArrayBuffer | ReadableStream | Blob): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ objects: { key: string }[]; truncated: boolean }>;
}

let _bucket: R2Bucket | null = null;
export function setBucket(b: R2Bucket): void {
  _bucket = b;
}
function getBucket(): R2Bucket {
  if (!_bucket) throw new Error("[R2] bucket 未初始化，請在 Functions 入口呼叫 setBucket(env.BUCKET)");
  return _bucket;
}

export type Watchlist = {
  id: number;
  userId: number;
  symbol: string;
  market: string;
  addedAt: string;
  updatedAt: string;
};

export type AnalysisCache = {
  id: number | string;
  userId: number;
  symbol: string;
  analysisType: string;
  result: string;
  createdAt: string;
};

const DEFAULT_USER = 0;
const WATCHLIST_KEY = "watchlist.json";

function nowISO(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---- watchlist ----
// 首次部屬 R2 自選清單為空時，自動種入一組預設台股，避免首頁空白卡死。
// 使用者新增/移除後自然覆寫，不會重複種入（因為 watchlist.json 已存在）。
const SEED_WATCHLIST: Watchlist[] = [
  { id: 1, userId: DEFAULT_USER, symbol: "2330", market: "TW", addedAt: nowISO(), updatedAt: nowISO() },
  { id: 2, userId: DEFAULT_USER, symbol: "2303", market: "TW", addedAt: nowISO(), updatedAt: nowISO() },
  { id: 3, userId: DEFAULT_USER, symbol: "2454", market: "TW", addedAt: nowISO(), updatedAt: nowISO() },
  { id: 4, userId: DEFAULT_USER, symbol: "2317", market: "TW", addedAt: nowISO(), updatedAt: nowISO() },
  { id: 5, userId: DEFAULT_USER, symbol: "3008", market: "TW", addedAt: nowISO(), updatedAt: nowISO() },
];

export async function getWatchlist(): Promise<Watchlist[]> {
  try {
    const obj = await getBucket().get(WATCHLIST_KEY);
    if (!obj) {
      // 首次：bucket 裡沒有 watchlist.json → 種入預設清單並回寫
      await getBucket().put(WATCHLIST_KEY, JSON.stringify(SEED_WATCHLIST));
      return SEED_WATCHLIST;
    }
    const arr = (await obj.json<Watchlist[]>()) as Watchlist[];
    const mine = arr.filter((w) => w.userId === DEFAULT_USER);
    if (mine.length === 0) {
      // 物件存在但本使用者沒有自選 → 也種入預設
      const merged = [...arr, ...SEED_WATCHLIST];
      await getBucket().put(WATCHLIST_KEY, JSON.stringify(merged));
      return SEED_WATCHLIST;
    }
    return mine;
  } catch (e) {
    console.error("[R2] getWatchlist failed", e);
    return [];
  }
}

export async function addToWatchlist(symbol: string, market = "TW"): Promise<void> {
  try {
    const bucket = getBucket();
    const obj = await bucket.get(WATCHLIST_KEY);
    const list: Watchlist[] = obj ? ((await obj.json()) as Watchlist[]) : [];
    const up = symbol.toUpperCase();
    if (list.some((w) => w.userId === DEFAULT_USER && w.symbol === up)) return;
    const now = nowISO();
    list.push({
      id: list.length ? Math.max(...list.map((w) => w.id)) + 1 : 1,
      userId: DEFAULT_USER,
      symbol: up,
      market,
      addedAt: now,
      updatedAt: now,
    });
    await bucket.put(WATCHLIST_KEY, JSON.stringify(list));
  } catch (e) {
    console.error("[R2] addToWatchlist failed", e);
  }
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  try {
    const bucket = getBucket();
    const obj = await bucket.get(WATCHLIST_KEY);
    if (!obj) return;
    const list: Watchlist[] = (await obj.json()) as Watchlist[];
    const up = symbol.toUpperCase();
    const next = list.filter((w) => !(w.userId === DEFAULT_USER && w.symbol === up));
    await bucket.put(WATCHLIST_KEY, JSON.stringify(next));
  } catch (e) {
    console.error("[R2] removeFromWatchlist failed", e);
  }
}

// ---- analysis cache ----
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

export async function isCacheExpired(symbol: string): Promise<boolean> {
  const latest = await getAnalysisCache(DEFAULT_USER, symbol.toUpperCase(), "detailed");
  if (!latest) return true;
  const cachedAt = new Date(latest.createdAt.replace(" ", "T") + "Z").getTime();
  return Date.now() - cachedAt > CACHE_EXPIRY_MS;
}

export async function getAnalysisCache(
  userId: number,
  symbol: string,
  analysisType: string
): Promise<AnalysisCache | null> {
  const all = await listAnalysisHistory(userId, symbol.toUpperCase(), analysisType);
  return all[0] ?? null;
}

export async function saveAnalysisCache(
  userId: number,
  symbol: string,
  analysisType: string,
  result: string
): Promise<void> {
  try {
    const id = genId();
    const rec: AnalysisCache = {
      id,
      userId,
      symbol: symbol.toUpperCase(),
      analysisType,
      result,
      createdAt: nowISO(),
    };
    await getBucket().put(`analysis/${id}.json`, JSON.stringify(rec));
  } catch (e) {
    console.error("[R2] saveAnalysisCache failed", e);
  }
}

export async function listAnalysisHistory(
  userId: number,
  symbol: string,
  analysisType?: string
): Promise<AnalysisCache[]> {
  try {
    const bucket = getBucket();
    const { objects } = await bucket.list({ prefix: "analysis/" });
    const out: AnalysisCache[] = [];
    for (const o of objects) {
      const obj = await bucket.get(o.key);
      if (!obj) continue;
      const rec = (await obj.json()) as AnalysisCache;
      if (rec.userId !== userId) continue;
      if (rec.symbol !== symbol.toUpperCase()) continue;
      if (analysisType && rec.analysisType !== analysisType) continue;
      out.push(rec);
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return out;
  } catch (e) {
    console.error("[R2] listAnalysisHistory failed", e);
    return [];
  }
}

export async function getAnalysisById(
  userId: number,
  id: number | string
): Promise<AnalysisCache | null> {
  try {
    const obj = await getBucket().get(`analysis/${id}.json`);
    if (!obj) return null;
    const rec = (await obj.json()) as AnalysisCache;
    return rec.userId === userId ? rec : null;
  } catch {
    return null;
  }
}

// ---- 相容樁位（routers 未使用）----
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
