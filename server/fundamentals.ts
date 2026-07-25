/**
 * 台股基本面資料 — TWSE OpenAPI（免 key、全市場 JSON）
 * - 月營收：https://openapi.twse.com.tw/v1/opendata/t187ap05_L（上市公司當月/累計營收 + YoY/MoM）
 * - 季 EPS：https://openapi.twse.com.tw/v1/opendata/t187ap14_L（綜合損益：EPS、營收、營益、稅後淨利）
 * 兩檔各 ~1000 列（全上市公司），呼叫端應以 R2 快取（月更/季更，快取 1 天綽綽有餘）。
 */

export interface MonthlyRevenue {
  yearMonth: string;      // 民國 yyymm，如 11506
  revenue: number;        // 當月營收（千元）
  lastMonthRevenue: number;
  lastYearRevenue: number;
  momPct: number;         // 上月比較增減 %
  yoyPct: number;         // 去年同月增減 %
  ytdRevenue: number;     // 當月累計營收
  ytdYoyPct: number;      // 累計前期比較增減 %
  note: string;           // 公司備註（營收變化原因）
}

export interface QuarterlyEps {
  year: string;           // 民國年
  quarter: string;        // 季別
  eps: number;            // 基本每股盈餘（元）
  revenue: number;        // 營業收入（千元）
  operatingIncome: number;// 營業利益
  netIncome: number;      // 稅後淨利
  netMarginPct: number;   // 淨利率 %（稅後淨利/營收）
  opMarginPct: number;    // 營益率 %
}

export interface Fundamentals {
  symbol: string;
  companyName: string;
  industry: string;
  monthlyRevenue: MonthlyRevenue | null;
  quarterlyEps: QuarterlyEps | null;
}

const REV_URL = "https://openapi.twse.com.tw/v1/opendata/t187ap05_L";
const EPS_URL = "https://openapi.twse.com.tw/v1/opendata/t187ap14_L";

const num = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

async function fetchJson(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`TWSE OpenAPI HTTP ${res.status}`);
  const j = await res.json();
  if (!Array.isArray(j)) throw new Error("TWSE OpenAPI 非陣列回傳");
  return j as Record<string, string>[];
}

/** 抓單一上市公司的基本面（月營收 + 最新季 EPS）。上櫃股票不在此資料集，回 null 欄位。 */
export async function getFundamentals(symbol: string): Promise<Fundamentals | null> {
  const sym = symbol.toUpperCase();
  const [revRows, epsRows] = await Promise.allSettled([fetchJson(REV_URL), fetchJson(EPS_URL)]);

  let monthlyRevenue: MonthlyRevenue | null = null;
  let quarterlyEps: QuarterlyEps | null = null;
  let companyName = "";
  let industry = "";

  if (revRows.status === "fulfilled") {
    const r = revRows.value.find((x) => String(x["公司代號"]).trim() === sym);
    if (r) {
      companyName = r["公司名稱"] || "";
      industry = r["產業別"] || "";
      monthlyRevenue = {
        yearMonth: String(r["資料年月"] || ""),
        revenue: num(r["營業收入-當月營收"]),
        lastMonthRevenue: num(r["營業收入-上月營收"]),
        lastYearRevenue: num(r["營業收入-去年當月營收"]),
        momPct: num(r["營業收入-上月比較增減(%)"]),
        yoyPct: num(r["營業收入-去年同月增減(%)"]),
        ytdRevenue: num(r["累計營業收入-當月累計營收"]),
        ytdYoyPct: num(r["累計營業收入-前期比較增減(%)"]),
        note: String(r["備註"] || "").trim(),
      };
    }
  }

  if (epsRows.status === "fulfilled") {
    const r = epsRows.value.find((x) => String(x["公司代號"]).trim() === sym);
    if (r) {
      if (!companyName) companyName = r["公司名稱"] || "";
      if (!industry) industry = r["產業別"] || "";
      const revenue = num(r["營業收入"]);
      const op = num(r["營業利益"]);
      const net = num(r["稅後淨利"]);
      quarterlyEps = {
        year: String(r["年度"] || ""),
        quarter: String(r["季別"] || ""),
        eps: num(r["基本每股盈餘(元)"]),
        revenue,
        operatingIncome: op,
        netIncome: net,
        netMarginPct: revenue > 0 ? Math.round((net / revenue) * 10000) / 100 : 0,
        opMarginPct: revenue > 0 ? Math.round((op / revenue) * 10000) / 100 : 0,
      };
    }
  }

  if (!monthlyRevenue && !quarterlyEps) return null;
  return { symbol: sym, companyName, industry, monthlyRevenue, quarterlyEps };
}

/** 民國 yyymm → 西元字串 */
const fmtYm = (ym: string) =>
  ym && ym.length >= 5 ? `${Number(ym.slice(0, 3)) + 1911}/${ym.slice(3)}` : ym;

/** 基本面 → LLM 文本 */
export function formatFundamentalsForLLM(f: Fundamentals): string {
  const lines: string[] = [`公司：${f.companyName}（${f.symbol}，${f.industry}）`];
  if (f.monthlyRevenue) {
    const m = f.monthlyRevenue;
    lines.push(
      `【月營收】${fmtYm(m.yearMonth)} 營收 ${(m.revenue / 100000).toFixed(1)} 億元，` +
        `MoM ${m.momPct >= 0 ? "+" : ""}${m.momPct.toFixed(1)}%、YoY ${m.yoyPct >= 0 ? "+" : ""}${m.yoyPct.toFixed(1)}%；` +
        `累計營收 YoY ${m.ytdYoyPct >= 0 ? "+" : ""}${m.ytdYoyPct.toFixed(1)}%` +
        (m.note ? `（公司說明：${m.note}）` : "")
    );
  }
  if (f.quarterlyEps) {
    const q = f.quarterlyEps;
    lines.push(
      `【最新季報】${q.year}年Q${q.quarter}：EPS ${q.eps} 元，` +
        `營收 ${(q.revenue / 100000).toFixed(1)} 億元，營益率 ${q.opMarginPct}%，稅後淨利率 ${q.netMarginPct}%`
    );
  }
  return lines.join("\n");
}
