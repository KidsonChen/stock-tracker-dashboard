/**
 * 證交所即時/歷史資料客戶端（替代原 Supabase RPC）。
 * 使用可用端點：www.twse.com.tw/exchangeReport/STOCK_DAY
 * 免 key、免認證，直接回 OHLC 日線。
 */

const BASE = "https://www.twse.com.tw/exchangeReport";

export interface TWSECandle {
  date: string; // YYYY/MM/DD 民國格式 -> 轉西元
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TWSEQuote {
  symbol: string;
  currentPrice: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  timestamp: number;
}

// 民國年 (115/07/14) -> 西元 (2026/07/14)
function toWesternDate(minguo: string): string {
  const [y, m, d] = minguo.split("/");
  return `${parseInt(y) + 1911}/${m}/${d}`;
}

function num(s: string): number {
  return parseFloat(s.replace(/,/g, "")) || 0;
}

/**
 * 抓取單月日線（STOCK_DAY 回整個月的每日 OHLC）
 */
async function fetchMonth(symbol: string, yyyymm: string): Promise<TWSECandle[]> {
  const url = `${BASE}/STOCK_DAY?response=json&date=${yyyymm}&stockNo=${symbol}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`TWSE HTTP ${res.status}`);
  const json = await res.json() as { stat?: string; data?: any[] };
  if (json.stat !== "OK" || !json.data) return [];
  return json.data.map((row) => ({
    date: toWesternDate(row[0]),
    open: num(row[3]),
    high: num(row[4]),
    low: num(row[5]),
    close: num(row[6]),
    volume: num((row[8] || "").replace(/,/g, "")),
  }));
}

/**
 * 抓最近 N 天日 K 線（跨月自動併接）
 */
export async function getTWSECandles(symbol: string, days = 90): Promise<TWSECandle[]> {
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  const all: TWSECandle[] = [];
  for (const m of months) {
    try {
      const c = await fetchMonth(symbol, m);
      all.push(...c);
    } catch (e) {
      console.warn(`[TWSE] ${m} 抓取失敗:`, (e as Error).message);
    }
  }
  // 由舊到新排序，取最近 N 筆
  all.sort((a, b) => (a.date < b.date ? -1 : 1));
  return all.slice(-days);
}

/**
 * 抓最新一筆（即時報價近似：本日最新收盤/成交）
 */
export async function getTWSEQuote(symbol: string): Promise<TWSEQuote> {
  // 抓當月，取最後一筆
  const d = new Date();
  const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const candles = await fetchMonth(symbol, yyyymm);
  if (!candles.length) throw new Error(`TWSE 無 ${symbol} 資料`);
  const last = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2] : last;
  return {
    symbol: symbol.toUpperCase(),
    currentPrice: last.close,
    open: last.open,
    high: last.high,
    low: last.low,
    previousClose: prev.close,
    timestamp: Date.now(),
  };
}
