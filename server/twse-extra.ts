/**
 * 證交所盤後公開端點（免 key、免認證）封裝。
 * 提供：個股估值（本益比/殖利率/股價淨值比）、五檔行情盤後估算、
 * 融資融券餘額、外資買賣超等「股市相關資訊」。
 *
 * 注意：這些是「盤後」資料（T 日收盤後公布），非盤中即時五檔。
 * 嚴格意義的盤中最佳五檔買賣價需要 FinMind / 即時 WebSocket（需 key），
 * 此處用當日 OHLC + 成交量做盤後近似估算並明確標註。
 */
const BASE = "https://www.twse.com.tw";
const UA = { "User-Agent": "Mozilla/5.0" };

function toMinguoDate(d: Date): string {
  return `${d.getFullYear() - 1911}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function num(s: any): number {
  if (s === null || s === undefined) return 0;
  const v = parseFloat(String(s).replace(/,/g, "").replace(/%/g, "").trim());
  return isNaN(v) ? 0 : v;
}

async function twseGet(url: string): Promise<any> {
  const res = await fetch(url, { headers: UA });
  return res.json();
}

/**
 * 產生「最近 N 個候選日期」（民國格式 yyymmdd），從指定起點往回推。
 * 用於證交所盤後資料：當天資料常未公告，需往前找最近有資料的交易日。
 * 預設從「昨天」開始（今天盤後資料通常尚未產生），回推 10 天涵蓋連假。
 */
function recentMinguoDates(days = 10, startOffset = 1): string[] {
  const out: string[] = [];
  const base = new Date();
  for (let i = startOffset; i < startOffset + days; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    // 跳過週末（六=6、日=0）
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    out.push(toMinguoDate(d));
  }
  return out;
}

export interface Valuation {
  date: string;
  dividendYield: number; // 殖利率 %
  peRatio: number; // 本益比
  pbRatio: number; // 股價淨值比
  fiscalYear: string; // 財報年/季
  rawDate: string; // 原始日期字串
}

/** 個股估值（本益比/殖利率/股價淨值比）——證交所 BWIBBU_d（個股日），往前找最近交易日 */
export async function getValuation(symbol: string): Promise<Valuation | null> {
  const sym = symbol.toUpperCase();
  for (const date of recentMinguoDates()) {
    try {
      const url = `${BASE}/exchangeReport/BWIBBU_d?response=json&date=${date}&stockNo=${sym}`;
      const json = await twseGet(url);
      if (json.stat !== "OK" || !Array.isArray(json.data) || !json.data.length) continue;
      const fields: string[] = json.fields || [];
      // BWIBBU_d 回全市場，需找該股那一列（欄位0=證券代號）
      const row: string[] | undefined = json.data.find(
        (r: string[]) => String(r[0]).trim() === sym
      );
      if (!row) continue;
      const idx = (name: string) => fields.findIndex((f) => f.includes(name));
      const get = (name: string) => {
        const i = idx(name);
        return i >= 0 ? row[i] : undefined;
      };
      return {
        date: String(json.date || date),
        dividendYield: num(get("殖利率")),
        peRatio: num(get("本益比")),
        pbRatio: num(get("股價淨值比")),
        fiscalYear: String(get("財報年") || get("股利年度") || ""),
        rawDate: String(json.date || date),
      };
    } catch (e) {
      console.error(`[TWSE-extra] getValuation ${sym} ${date} failed:`, (e as Error).message);
    }
  }
  return null;
}

export interface OrderBookLevel {
  bidPrice: number; // 買價
  bidVol: number; // 買量(張)
  askPrice: number; // 賣價
  askVol: number; // 賣量(張)
}

export interface OrderBookEstimate {
  symbol: string;
  isEstimate: true;
  note: string;
  levels: OrderBookLevel[]; // 5 檔
  avgPrice: number;
  totalVol: number;
}

/**
 * 五檔行情盤後估算：嚴格意義的最佳五檔是盤中即時資料（證交所盤後端點不含）。
 * 此處用當日 OHLC + 成交量，以收盤價為中心、依當日高低區間推算 5 檔買賣價位，
 * 並把成交量均攤到 5 檔。標註為「盤後估算」，僅供參考。
 */
export function estimateOrderBook(
  symbol: string,
  lastClose: number,
  open: number,
  high: number,
  low: number,
  volume: number
): OrderBookEstimate {
  const px = lastClose > 0 ? lastClose : (high + low) / 2 || open || 0;
  const tick = px >= 1000 ? 5 : px >= 100 ? 1 : px >= 10 ? 0.5 : 0.1;
  const perLevelVol = Math.max(1, Math.round(volume / 5));
  const levels: OrderBookLevel[] = [];
  for (let i = 0; i < 5; i++) {
    const bidPrice = +(px - tick * (i + 1)).toFixed(2);
    const askPrice = +(px + tick * (i + 1)).toFixed(2);
    levels.push({
      bidPrice: Math.max(0, bidPrice),
      bidVol: perLevelVol,
      askPrice: Math.max(0, askPrice),
      askVol: perLevelVol,
    });
  }
  return {
    symbol,
    isEstimate: true,
    note: "盤後估算（證交所盤後端點不含即時五檔，此為依當日高低推算之近似值）",
    levels,
    avgPrice: +px.toFixed(2),
    totalVol: volume,
  };
}

export interface MarginInfo {
  symbol: string;
  marginBalance: number; // 融資今日餘額
  marginBuy: number; // 融資買進
  marginSell: number; // 融資賣出
  shortBalance: number; // 融券今日餘額
  shortBuy: number; // 融券買進
  shortSell: number; // 融券賣出
}

/** 融資融券餘額（個股）——證交所 MI_MARGN，往前找最近交易日 */
export async function getMargin(symbol: string): Promise<MarginInfo | null> {
  const sym = symbol.toUpperCase();
  for (const date of recentMinguoDates()) {
    try {
      const url = `${BASE}/exchangeReport/MI_MARGN?response=json&date=${date}&selectType=ALLBUT0999`;
      const json = await twseGet(url);
      if (json.stat !== "OK" || !json.tables) continue;
      // 找含個股資料的 table（欄位含證券代號）
      const table = json.tables.find(
        (t: any) => Array.isArray(t.data) && t.data.length > 5
      ) || json.tables[0];
      if (!table || !Array.isArray(table.data)) continue;
      const rows = table.data.filter(
        (r: any[]) => String(r[0] || "").trim() === sym
      );
      if (!rows.length) continue;
      const r = rows[0];
      return {
        symbol: sym,
        marginBuy: num(r[2]),
        marginSell: num(r[3]),
        marginBalance: num(r[6]),
        shortBuy: num(r[8]),
        shortSell: num(r[9]),
        shortBalance: num(r[11]),
      };
    } catch (e) {
      console.error(`[TWSE-extra] getMargin ${sym} ${date} failed:`, (e as Error).message);
    }
  }
  return null;
}

export interface IndustryIndex {
  name: string; // 產業名稱（如 半導體、金融保險）
  index: number; // 收盤指數
  change: number; // 漲跌點數
  changePercent: number; // 漲跌百分比
}

/** 產業類股指數排行（證交所 MI_INDEX 價格指數表）——真實盤後資料 */
export async function getIndustryIndices(): Promise<IndustryIndex[]> {
  try {
    const date = toMinguoDate(new Date());
    const url = `${BASE}/exchangeReport/MI_INDEX?response=json&date=${date}&type=ALL`;
    const json = await twseGet(url);
    if (json.stat !== "OK" || !json.tables) {
      console.error(`[TWSE-extra] getIndustryIndices: stat=${json.stat} tablesLen=${json.tables?.length}`);
      return [];
    }
    const table = json.tables[0];
    if (!table || !Array.isArray(table.data)) {
      console.error(`[TWSE-extra] getIndustryIndices: table0 undefined, tables=${json.tables.length}`);
      return [];
    }
    return table.data
      .map((r: any[]) => ({
        name: String(r[0] || "").trim(),
        index: num(r[1]),
        change: num(r[3]),
        changePercent: num(r[4]),
      }))
      .filter((x: IndustryIndex) => x.name);
  } catch (e) {
    console.error(`[TWSE-extra] getIndustryIndices failed:`, (e as Error).message);
    return [];
  }
}

/** 外資/投信/自營商買賣超（個股）——證交所 TWTB4U（外資+投信）+ TWT44U（自營商） */
export interface ForeignTradeInfo {
  symbol: string;
  foreignBuy: number;
  foreignSell: number;
  foreignNet: number;
  trustNet: number;
  dealerNet: number;
}

export async function getForeignTrade(symbol: string): Promise<ForeignTradeInfo | null> {
  const sym = symbol.toUpperCase();
  for (const date of recentMinguoDates()) {
    try {
      let foreignBuy = 0, foreignSell = 0, foreignNet = 0, trustNet = 0, dealerNet = 0;

      // 外資 + 投信：TWTB4U，遍歷所有 tables 找該股
      try {
        const url = `${BASE}/exchangeReport/TWTB4U?response=json&date=${date}&selectType=ALL`;
        const json = await twseGet(url);
        if (json.stat === "OK" && json.tables) {
          for (const t of json.tables) {
            if (!t || !Array.isArray(t.data)) continue;
            const r = t.data.find((row: any[]) => String(row[0]).trim() === sym);
            if (!r) continue;
            const title = String(t.title || "");
            // fields: ["證券代號","證券名稱","買進股數","賣出股數","買賣超股數",...]
            if (title.includes("外資") || title.includes("陸資")) {
              foreignBuy = num(r[2]); foreignSell = num(r[3]); foreignNet = num(r[4]);
            } else if (title.includes("投信")) {
              trustNet = num(r[4]);
            }
          }
        }
      } catch (e) {
        console.error(`[TWSE-extra] getForeignTrade TWTB4U ${sym} ${date} failed:`, (e as Error).message);
      }

      // 自營商：TWT44U（data 直接陣列）
      try {
        const url2 = `${BASE}/fund/TWT44U?response=json&date=${date}&selectType=ALL`;
        const j2 = await twseGet(url2);
        if (j2.stat === "OK" && Array.isArray(j2.data)) {
          const r = j2.data.find((row: any[]) => String(row[0]).trim() === sym);
          if (r) dealerNet = num(r[4]);
        }
      } catch (e) {
        console.error(`[TWSE-extra] getForeignTrade TWT44U ${sym} ${date} failed:`, (e as Error).message);
      }

      if (!foreignNet && !trustNet && !dealerNet) continue;
      return { symbol: sym, foreignBuy, foreignSell, foreignNet, trustNet, dealerNet };
    } catch (e) {
      console.error(`[TWSE-extra] getForeignTrade ${sym} ${date} failed:`, (e as Error).message);
    }
  }
  return null;
}
