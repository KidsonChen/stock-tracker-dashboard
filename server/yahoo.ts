/**
 * Yahoo Finance 客戶端（美股 / 港股）。
 * 免 key、免認證，統一支援多市場：
 *   - 美股：AAPL、TSLA ...
 *   - 港股：0700.HK、9999.HK ...
 * 台股因證交所/FinMind 已處理，本模組僅供 US / HK 使用。
 *
 * 回傳格式刻意對映成與 twse-live 相同的結構（date 為西元 YYYY/MM/DD），
 * 使 routers.ts 與前端 StockChart 不用針對市場寫特殊邏輯。
 */

export interface YahooCandle {
  date: string; // 西元 YYYY/MM/DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface YahooQuote {
  symbol: string;
  name: string; // 公司名（shortName / longName）
  currentPrice: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  timestamp: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  currency: string;
  exchange: string;
}

export interface YahooValuation {
  marketCap: number | null;
  peRatio: number | null; // 本益比 (trailingPE)
  forwardPE: number | null;
  dividendYield: number | null; // 殖利率 (trailingAnnualDividendYield %)
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

// Yahoo 回傳 UTC 秒級 timestamp；轉成西元 YYYY/MM/DD 字串（與前端解析一致）
function toDateStr(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10).replace(/-/g, "/");
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && !isNaN(v) ? v : 0;
}

/**
 * 即時報價（取最近一交易日）
 */
export async function getYahooQuote(symbol: string): Promise<YahooQuote> {
  const url = `${BASE}/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo 無 ${symbol} 資料`);
  const meta = result.meta;

  // 歷史陣列取最後一筆作為當日 OHLC
  const quotes = result.indicators?.quote?.[0];
  const ts: number[] = result.timestamp || [];
  const lastIdx = ts.length - 1;
  const open = num(quotes?.open?.[lastIdx]);
  const high = num(quotes?.high?.[lastIdx]);
  const low = num(quotes?.low?.[lastIdx]);
  const close = num(quotes?.close?.[lastIdx]);

  return {
    symbol: symbol.toUpperCase(),
    name: String(meta?.shortName || meta?.longName || symbol).trim(),
    currentPrice: num(meta?.regularMarketPrice) || close,
    open: open || num(meta?.regularMarketOpen),
    high: high || num(meta?.regularMarketDayHigh),
    low: low || num(meta?.regularMarketDayLow),
    previousClose: num(meta?.chartPreviousClose) || num(meta?.previousClose),
    volume: num(quotes?.volume?.[lastIdx]),
    timestamp: Date.now(),
    fiftyTwoWeekHigh: num(meta?.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(meta?.fiftyTwoWeekLow),
    currency: String(meta?.currency || ""),
    exchange: String(meta?.exchangeName || ""),
  };
}

/**
 * 歷史日 K 線（預設一年，interval=1d）
 */
export async function getYahooCandles(
  symbol: string,
  days = 365
): Promise<YahooCandle[]> {
  // Yahoo range 不直接吃天數；用 1y 抓滿再裁切
  const range = days > 180 ? "1y" : days > 60 ? "6mo" : days > 20 ? "3mo" : "1mo";
  const url = `${BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo 無 ${symbol} 歷史資料`);

  const ts: number[] = result.timestamp || [];
  const q = result.indicators?.quote?.[0];
  if (!q) return [];

  const candles: YahooCandle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = num(q.close?.[i]);
    if (!close) continue; // 跳過休市空值
    candles.push({
      date: toDateStr(ts[i]),
      open: num(q.open?.[i]),
      high: num(q.high?.[i]),
      low: num(q.low?.[i]),
      close,
      volume: num(q.volume?.[i]),
    });
  }
  // 由舊到新排序並取最近 N 筆
  candles.sort((a, b) => (a.date < b.date ? -1 : 1));
  return candles.slice(-days);
}

const SUMMARY_BASE = "https://query1.finance.yahoo.com/v10/finance/quoteSummary";

/** 估值/基本面（本益比、市值、殖利率、52週高低）——免 key */
export async function getYahooValuation(symbol: string): Promise<YahooValuation> {
  try {
    const url = `${SUMMARY_BASE}/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`Yahoo summary HTTP ${res.status}`);
    const json = await res.json();
    const price = json?.quoteSummary?.result?.[0]?.price || {};
    const summary = json?.quoteSummary?.result?.[0]?.summaryDetail || {};
    return {
      marketCap: num(price.marketCap?.raw ?? price.marketCap),
      peRatio: num(summary.trailingPE?.raw ?? summary.trailingPE),
      forwardPE: num(summary.forwardPE?.raw ?? summary.forwardPE),
      dividendYield: num(summary.dividendYield?.raw ?? summary.dividendYield),
      fiftyTwoWeekHigh: num(price.fiftyTwoWeekHigh?.raw ?? price.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: num(price.fiftyTwoWeekLow?.raw ?? price.fiftyTwoWeekLow),
    };
  } catch (e) {
    console.error(`[Yahoo] getYahooValuation failed for ${symbol}:`, (e as Error).message);
    return {
      marketCap: null, peRatio: null, forwardPE: null,
      dividendYield: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null,
    };
  }
}
