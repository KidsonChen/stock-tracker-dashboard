/**
 * 臺灣集中保管結算所（TDCC）OpenAPI — 集保戶股權分散表
 * 端點：https://openapi.tdcc.com.tw/v1/opendata/1-5 （免 key、每週五資料，約每週六更新）
 * 回傳為「全市場」JSON 陣列，每檔股票 17 列（持股分級 1~15 + 16差異調整 + 17合計）。
 *
 * 持股分級（股數）：
 *  1: 1-999          2: 1,000-5,000     3: 5,001-10,000    4: 10,001-15,000
 *  5: 15,001-20,000  6: 20,001-30,000   7: 30,001-40,000   8: 40,001-50,000
 *  9: 50,001-100,000 10: 100,001-200,000 11: 200,001-400,000 12: 400,001-600,000
 * 13: 600,001-800,000 14: 800,001-1,000,000 15: 1,000,001以上
 * 16: 差異數調整     17: 合  計
 *
 * ⚠️ 檔案約 9-10MB，勿在每次 getExtra 都抓 — 呼叫端須以 R2 快取（資料週更，快取 3 天即可）。
 */

export interface ShareholdingTier {
  level: number;      // 持股分級 1~15
  label: string;      // 級距說明
  holders: number;    // 人數
  shares: number;     // 股數
  percent: number;    // 占集保庫存比例 %
}

export interface ShareholdingSummary {
  symbol: string;
  date: string;             // 資料日期 yyyymmdd
  totalHolders: number;     // 總股東人數（合計列）
  totalShares: number;      // 總股數（合計列）
  bigLots1000: number;      // 千張大戶比例 %（級距15）
  bigLots400: number;       // 400張以上比例 %（級距12~15）
  retailUnder10: number;    // 10張以下散戶比例 %（級距1~3）
  retailHolders: number;    // 10張以下散戶人數
  tiers: ShareholdingTier[];
}

const TIER_LABELS: Record<number, string> = {
  1: "1-999 股", 2: "1-5 張", 3: "5-10 張", 4: "10-15 張", 5: "15-20 張",
  6: "20-30 張", 7: "30-40 張", 8: "40-50 張", 9: "50-100 張", 10: "100-200 張",
  11: "200-400 張", 12: "400-600 張", 13: "600-800 張", 14: "800-1,000 張", 15: "1,000 張以上",
};

const TDCC_URL = "https://openapi.tdcc.com.tw/v1/opendata/1-5";

/** 抓全市場股權分散表並萃取單一股票的摘要。檔案大，呼叫端務必快取結果。 */
export async function getShareholding(symbol: string): Promise<ShareholdingSummary | null> {
  const res = await fetch(TDCC_URL, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`TDCC OpenAPI HTTP ${res.status}`);
  const rows = (await res.json()) as Record<string, string>[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("TDCC 回傳空資料");

  // 欄位名可能帶 BOM（"﻿資料日期"），用 includes 找 key
  const keys = Object.keys(rows[0]);
  const kDate = keys.find((k) => k.includes("資料日期")) || "資料日期";
  const kSym = keys.find((k) => k.includes("證券代號")) || "證券代號";
  const kLevel = keys.find((k) => k.includes("持股分級")) || "持股分級";
  const kHolders = keys.find((k) => k.includes("人數")) || "人數";
  const kShares = keys.find((k) => k.includes("股數")) || "股數";
  const kPct = keys.find((k) => k.includes("比例")) || "占集保庫存數比例%";

  const sym = symbol.toUpperCase();
  const mine = rows.filter((r) => String(r[kSym]).trim() === sym);
  if (mine.length === 0) return null;

  const tiers: ShareholdingTier[] = [];
  let totalHolders = 0;
  let totalShares = 0;
  let date = "";
  for (const r of mine) {
    const level = Number(r[kLevel]);
    const holders = Number(String(r[kHolders]).replace(/,/g, "")) || 0;
    const shares = Number(String(r[kShares]).replace(/,/g, "")) || 0;
    const percent = Number(String(r[kPct]).replace(/,/g, "")) || 0;
    date = String(r[kDate]).trim() || date;
    if (level === 17) {
      totalHolders = holders;
      totalShares = shares;
    } else if (level >= 1 && level <= 15) {
      tiers.push({ level, label: TIER_LABELS[level] || String(level), holders, shares, percent });
    }
  }
  tiers.sort((a, b) => a.level - b.level);

  const pct = (lv: number[]) => tiers.filter((t) => lv.includes(t.level)).reduce((s, t) => s + t.percent, 0);
  const holdersOf = (lv: number[]) => tiers.filter((t) => lv.includes(t.level)).reduce((s, t) => s + t.holders, 0);

  return {
    symbol: sym,
    date,
    totalHolders,
    totalShares,
    bigLots1000: Number(pct([15]).toFixed(2)),
    bigLots400: Number(pct([12, 13, 14, 15]).toFixed(2)),
    retailUnder10: Number(pct([1, 2, 3]).toFixed(2)),
    retailHolders: holdersOf([1, 2, 3]),
    tiers,
  };
}
