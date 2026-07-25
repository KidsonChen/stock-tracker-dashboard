import { useState } from "react";
import { Card } from "@/components/ui/card";
import { useStockExtra } from "@/hooks/useStockData";
import { AlertCircle, Info, TrendingUp, Building2, PieChart } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface StockInfoPanelProps {
  symbol: string;
  market: string;
}

const fmtInt = (n: number) => {
  if (!n && n !== 0) return "-";
  return n.toLocaleString("zh-TW");
};

const fmtLots = (shares: number) => {
  if (!shares && shares !== 0) return "-";
  const lots = shares / 1000;
  return `${lots.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} 張`;
};

const fmtMarketCap = (n: number | null | undefined) => {
  if (!n) return "-";
  const yi = n / 1e8;
  if (yi >= 1e4) return `${(yi / 1e4).toFixed(2)} 兆`;
  return `${yi.toFixed(2)} 億`;
};

/** 億元（TWSE 營收單位為千元） */
const fmtYi = (thousands: number) =>
  thousands ? `${(thousands / 100000).toLocaleString("zh-TW", { maximumFractionDigits: 1 })} 億` : "-";

const pctColor = (v: number) => (v >= 0 ? "text-chart-1" : "text-destructive");
const pctText = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

/** 小型統計磚 */
function Stat({ label, value, hint, color }: { label: string; value: React.ReactNode; hint?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/60 p-3 transition-colors hover:border-primary/40">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-bold tnum ${color ?? "text-primary"}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{hint}</div>}
    </div>
  );
}

/** 0-100 量表（RSI/KD 用） */
function Gauge({ label, value, lowMark, highMark }: { label: string; value: number; lowMark: number; highMark: number }) {
  const zone = value >= highMark ? "超買" : value <= lowMark ? "超賣" : "中性";
  const zoneColor = value >= highMark ? "text-destructive" : value <= lowMark ? "text-chart-1" : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border/70 bg-background/60 p-3">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className={`text-[10px] font-semibold ${zoneColor}`}>{zone}</span>
      </div>
      <div className="text-lg font-bold tnum text-primary mb-1.5">{value.toFixed(1)}</div>
      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-chart-1 via-primary to-destructive opacity-30 w-full" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-foreground border border-background shadow"
          style={{ left: `calc(${Math.min(100, Math.max(0, value))}% - 5px)` }}
        />
      </div>
    </div>
  );
}

type TabKey = "tech" | "fund" | "chips";

export function StockInfoPanel({ symbol, market }: StockInfoPanelProps) {
  const { data, isLoading, error } = useStockExtra(symbol, market);
  const isTW = !market || market === "TW";
  const [tab, setTab] = useState<TabKey>("tech");

  if (isLoading) {
    return (
      <Card className="bg-card border-border p-4">
        <h2 className="section-head mb-2">個股深度資訊</h2>
        <div className="space-y-2 animate-pulse">
          <div className="h-8 rounded bg-muted/60" />
          <div className="h-24 rounded bg-muted/40" />
          <div className="h-24 rounded bg-muted/30" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-destructive/10 border-destructive p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      </Card>
    );
  }

  const ob = data?.orderBook;
  const val = data?.valuation;
  const margin = data?.margin;
  const foreign = data?.foreignTrade;
  const name = data?.name;
  const ind = data?.indicators;
  const fund = data?.fundamentals;

  const TABS: { key: TabKey; label: string; icon: typeof TrendingUp }[] = [
    { key: "tech", label: "技術面", icon: TrendingUp },
    { key: "fund", label: "基本面", icon: Building2 },
    { key: "chips", label: "籌碼面", icon: PieChart },
  ];

  return (
    <Card className="bg-card border-border p-4">
      {/* 標題 + 分頁切換 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="section-head">
          {name ? `${name}` : symbol}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{symbol} · {isTW ? "台股" : market === "HK" ? "港股" : "美股"}</span>
        </h2>
        <div className="flex rounded-lg border border-border bg-background/60 p-0.5">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                tab === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ 技術面 ══ */}
      {tab === "tech" && (
        <div className="space-y-4">
          {ind ? (
            <>
              {/* 動量指標 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Gauge label="RSI (14)" value={ind.rsi14} lowMark={30} highMark={70} />
                <Gauge label="KD — K 值" value={ind.kdK} lowMark={20} highMark={80} />
                <Gauge label="KD — D 值" value={ind.kdD} lowMark={20} highMark={80} />
                <Stat
                  label="MACD 柱狀"
                  value={<span className={ind.macdHist >= 0 ? "text-chart-1" : "text-destructive"}>{ind.macdHist >= 0 ? "+" : ""}{ind.macdHist}</span>}
                  hint={`DIF ${ind.macd} / DEA ${ind.macdSignal}`}
                />
              </div>
              {/* 波動指標 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="布林上軌" value={ind.bollUpper} hint="20日 +2σ" />
                <Stat label="布林中軌 (MA20)" value={ind.bollMid} hint={`%B = ${ind.bollPercentB}`} />
                <Stat label="布林下軌" value={ind.bollLower} hint="20日 −2σ" />
                <Stat
                  label="20 日乖離率"
                  value={<span className={pctColor(ind.bias20)}>{pctText(ind.bias20, 2)}</span>}
                  hint={`量比 ${ind.volumeRatio5}（今日/5日均量）`}
                />
              </div>
              {/* 指標信號 */}
              {ind.signals.length > 0 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="text-xs font-semibold text-primary mb-2">📡 指標信號</div>
                  <ul className="space-y-1">
                    {ind.signals.map((s, i) => (
                      <li key={i} className="text-xs text-foreground/90 flex gap-1.5">
                        <span className="text-primary shrink-0">▸</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground text-sm">技術指標需至少 30 根日 K（{isTW ? "資料載入中或新上市股票" : "美/港股請看下方五檔與 52 週資訊"}）</div>
          )}

          {/* 五檔行情 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">五檔行情</span>
              {ob?.isEstimate && (
                <span className="text-[10px] text-accent-foreground bg-accent/20 border border-accent/40 rounded px-2 py-0.5">盤後估算</span>
              )}
            </div>
            {ob && ob.levels?.length ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  {ob.levels.map((lv, i) => (
                    <div key={`bid-${i}`} className="flex justify-between items-center text-sm bg-chart-1/10 border border-chart-1/25 rounded-md px-2 py-1">
                      <span className="text-muted-foreground text-[10px]">買{i + 1}</span>
                      <span className="text-chart-1 font-semibold tnum">{lv.bidPrice.toFixed(2)}</span>
                      <span className="text-muted-foreground text-[10px] tnum">{fmtInt(lv.bidVol)}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {ob.levels.map((lv, i) => (
                    <div key={`ask-${i}`} className="flex justify-between items-center text-sm bg-destructive/10 border border-destructive/25 rounded-md px-2 py-1">
                      <span className="text-muted-foreground text-[10px]">賣{i + 1}</span>
                      <span className="text-destructive font-semibold tnum">{lv.askPrice.toFixed(2)}</span>
                      <span className="text-muted-foreground text-[10px] tnum">{fmtInt(lv.askVol)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">暫無五檔資料</div>
            )}
          </div>

          {/* 52 週高低（美股/港股） */}
          {!isTW && data?.fiftyTwoWeek && (data.fiftyTwoWeek.high || data.fiftyTwoWeek.low) && (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="52 週最高" value={data.fiftyTwoWeek.high?.toFixed(2) || "-"} color="text-destructive" />
              <Stat label="52 週最低" value={data.fiftyTwoWeek.low?.toFixed(2) || "-"} color="text-chart-1" />
            </div>
          )}
        </div>
      )}

      {/* ══ 基本面 ══ */}
      {tab === "fund" && (
        <div className="space-y-4">
          {/* 估值 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">估值指標</span>
              {val?.rawDate && <span className="text-[10px] text-muted-foreground">{val.rawDate}</span>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {val?.isRealtime ? (
                <>
                  <Stat label="即時股價" value={val.price?.toFixed ? val.price.toFixed(2) : val.price} hint="盤後估值暫缺" />
                  <Stat label="成交量" value={val.volume ? (val.volume / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 0 }) + " 張" : "-"} />
                </>
              ) : (
                <>
                  <Stat label="本益比 (PER)" value={val?.peRatio && val.peRatio > 0 ? val.peRatio.toFixed(2) : "-"} hint="股價 / EPS" />
                  <Stat label="股價淨值比" value={val?.pbRatio && val.pbRatio > 0 ? val.pbRatio.toFixed(2) : "-"} hint="股價 / 每股淨值" />
                  <Stat label="殖利率" value={val?.dividendYield && val.dividendYield > 0 ? val.dividendYield.toFixed(2) + "%" : "-"} hint="現金股利 / 股價" />
                  <Stat label="市值" value={fmtMarketCap(val?.marketCap)} />
                </>
              )}
            </div>
          </div>

          {/* 月營收（台股，TWSE OpenAPI） */}
          {isTW && fund?.monthlyRevenue && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  月營收 · {fund.industry}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {fund.monthlyRevenue.yearMonth ? `${Number(fund.monthlyRevenue.yearMonth.slice(0, 3)) + 1911}/${fund.monthlyRevenue.yearMonth.slice(3)}` : ""}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="當月營收" value={fmtYi(fund.monthlyRevenue.revenue)} />
                <Stat label="月增率 (MoM)" value={<span className={pctColor(fund.monthlyRevenue.momPct)}>{pctText(fund.monthlyRevenue.momPct)}</span>} />
                <Stat label="年增率 (YoY)" value={<span className={pctColor(fund.monthlyRevenue.yoyPct)}>{pctText(fund.monthlyRevenue.yoyPct)}</span>} />
                <Stat label="累計營收 YoY" value={<span className={pctColor(fund.monthlyRevenue.ytdYoyPct)}>{pctText(fund.monthlyRevenue.ytdYoyPct)}</span>} />
              </div>
              {fund.monthlyRevenue.note && (
                <div className="mt-2 text-[11px] text-muted-foreground bg-background/60 border border-border/60 rounded-md px-3 py-2">
                  💬 公司說明：{fund.monthlyRevenue.note}
                </div>
              )}
            </div>
          )}

          {/* 季 EPS（台股） */}
          {isTW && fund?.quarterlyEps && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">最新季度獲利</span>
                <span className="text-[10px] text-muted-foreground">{fund.quarterlyEps.year} 年 Q{fund.quarterlyEps.quarter}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="EPS" value={`${fund.quarterlyEps.eps} 元`} hint="基本每股盈餘" />
                <Stat label="季營收" value={fmtYi(fund.quarterlyEps.revenue)} />
                <Stat label="營益率" value={`${fund.quarterlyEps.opMarginPct}%`} hint="營業利益 / 營收" />
                <Stat label="稅後淨利率" value={`${fund.quarterlyEps.netMarginPct}%`} hint="稅後淨利 / 營收" />
              </div>
            </div>
          )}

          {isTW && !fund && (
            <div className="text-muted-foreground text-sm">暫無基本面資料（上櫃股票不在證交所 OpenAPI 資料集，或資料載入中）</div>
          )}
          {!isTW && (
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              <span>美股/港股月營收與 EPS 需付費資料源；目前提供估值與 52 週高低。</span>
            </div>
          )}
        </div>
      )}

      {/* ══ 籌碼面 ══ */}
      {tab === "chips" && (
        <div className="space-y-4">
          {isTW ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/70 bg-background/60 p-3">
                  <div className="text-xs font-semibold text-primary mb-2">融資融券餘額</div>
                  {margin ? (
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">融資今日餘額</span><span className="font-semibold tnum">{fmtInt(margin.marginBalance)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">融券今日餘額</span><span className="font-semibold tnum">{fmtInt(margin.shortBalance)}</span></div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-xs">暫無資料（盤後尚未公告或非交易日）</div>
                  )}
                </div>
                <div className="rounded-lg border border-border/70 bg-background/60 p-3">
                  <div className="text-xs font-semibold text-primary mb-2">三大法人買賣超</div>
                  {foreign ? (
                    <div className="space-y-1.5 text-sm">
                      {[
                        { label: "外資", v: foreign.foreignNet },
                        { label: "投信", v: foreign.trustNet },
                        { label: "自營商", v: foreign.dealerNet },
                      ].map((r) => (
                        <div key={r.label} className="flex justify-between">
                          <span className="text-muted-foreground">{r.label}</span>
                          <span className={`font-semibold tnum ${r.v >= 0 ? "text-chart-1" : "text-destructive"}`}>
                            {r.v >= 0 ? "+" : ""}{fmtLots(r.v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-xs">暫無資料（盤後尚未公告或非交易日）</div>
                  )}
                </div>
              </div>

              {/* 集保股權分散 */}
              <ShareholdingCard symbol={symbol} />

              {/* 近 5 日動能（籌碼暫缺時輔助） */}
              {data?.recentCandles && data.recentCandles.length >= 2 && (() => {
                const cs = data.recentCandles;
                const first = cs[0].close;
                const last = cs[cs.length - 1].close;
                const chgPct = first ? ((last - first) / first) * 100 : 0;
                return (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-2">近 5 日價量動能</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Stat label="5 日收盤變化" value={<span className={pctColor(chgPct)}>{pctText(chgPct, 2)}</span>} />
                      {cs.slice(-3).map((c, i) => (
                        <Stat
                          key={i}
                          label={String(c.date).slice(-5)}
                          value={c.close.toFixed(1)}
                          hint={`${(c.volume / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 0 })} 張`}
                          color="text-foreground"
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Info className="w-4 h-4" />
              <span>籌碼面資料（法人買賣超、融資券、股權分散）僅台股提供。</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** 集保戶股權分散表（TDCC OpenAPI 週更資料） */
function ShareholdingCard({ symbol }: { symbol: string }) {
  const { data: resp, isLoading } = trpc.getShareholding.useQuery(
    { symbol },
    { staleTime: 10 * 60 * 1000, retry: 1 }
  );

  const sh = resp?.data;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground">集保股權分散（每週更新）</span>
        {sh?.date && (
          <span className="text-[10px] text-muted-foreground">
            {String(sh.date).replace(/(\d{4})(\d{2})(\d{2})/, "$1/$2/$3")}
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="text-muted-foreground text-sm animate-pulse">載入中（首次抓取約 10-20 秒）…</div>
      ) : !sh ? (
        <div className="text-muted-foreground text-sm">{(resp as any)?.error || "暫無集保股權分散資料"}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Stat label="千張大戶" value={`${sh.bigLots1000.toFixed(2)}%`} hint="持股 1,000 張以上" />
            <Stat label="400 張以上" value={`${sh.bigLots400.toFixed(2)}%`} hint="中實戶 + 大戶" />
            <Stat label="10 張以下散戶" value={`${sh.retailUnder10.toFixed(2)}%`} hint={`${sh.retailHolders.toLocaleString("zh-TW")} 人`} />
            <Stat label="總股東人數" value={sh.totalHolders.toLocaleString("zh-TW")} hint="集保 ID 歸戶" />
          </div>
          <div className="space-y-1">
            {sh.tiers.map((t: any) => (
              <div key={t.level} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-muted-foreground text-right">{t.label}</span>
                <div className="flex-1 h-3 bg-background border border-border/60 rounded overflow-hidden">
                  <div
                    className={`h-full ${t.level >= 12 ? "bg-destructive/70" : t.level <= 3 ? "bg-chart-1/70" : "bg-primary/50"}`}
                    style={{ width: `${Math.min(100, t.percent)}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right font-mono tnum">{t.percent.toFixed(2)}%</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>資料來源：臺灣集中保管結算所 OpenAPI。紅 = 400 張以上大戶、綠 = 10 張以下散戶。{resp?.fromCache && "（快取）"}</span>
          </div>
        </>
      )}
    </div>
  );
}
