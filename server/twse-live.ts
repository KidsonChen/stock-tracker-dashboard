/**
 * 證交所即時/歷史資料客戶端（替代原 Supabase RPC）。
 * 使用可用端點：www.twse.com.tw/exchangeReport/STOCK_DAY
 * 免 key、免認證，直接回 OHLC 日線。
 */

const BASE = "https://www.twse.com.tw/exchangeReport";

// 台股歷史日線走 Yahoo（與美股/港股統一來源，免 key、1Y 穩定）
import { getYahooCandles } from "./yahoo";

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
 * 抓最近 N 天日 K 線（台股歷史）。
 *
 * 改用 Yahoo Finance（與美股/港股統一來源，免 key、1Y 資料完整穩定）。
 * 證交所 STOCK_DAY 只回當月、FinMind 免費 API 又不穩（常限流導致退化成當月），
 * 故台股歷史也走 Yahoo（代號補 .TW，如 2330 -> 2330.TW）。
 * 若 Yahoo 失敗，才 fallback 回證交所當月資料（僅足夠 1M 以內顯示）。
 */
export async function getTWSECandles(symbol: string, days = 90): Promise<TWSECandle[]> {
  const yahooSym = symbol.toUpperCase().endsWith(".TW")
    ? symbol.toUpperCase()
    : `${symbol.toUpperCase()}.TW`;

  try {
    const candles = await getYahooCandles(yahooSym, days);
    if (candles.length) return candles;
    throw new Error("Yahoo 無資料");
  } catch (e) {
    console.warn(`[TWSE] Yahoo 歷史失敗，fallback 證交所當月:`, (e as Error).message);
    try {
      const d = new Date();
      const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
      return await fetchMonth(symbol, yyyymm);
    } catch (e2) {
      console.error(`[TWSE] fallback 也失敗:`, (e2 as Error).message);
      return [];
    }
  }
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
