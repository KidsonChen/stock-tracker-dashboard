import { Card } from "@/components/ui/card";
import { useStockExtra } from "@/hooks/useStockData";
import { AlertCircle, Info } from "lucide-react";
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
  // 以「億」為單位（Yahoo marketCap 為原始金額，幣別不定）
  const yi = n / 1e8;
  if (yi >= 1e4) return `${(yi / 1e4).toFixed(2)} 兆`;
  return `${yi.toFixed(2)} 億`;
};

export function StockInfoPanel({ symbol, market }: StockInfoPanelProps) {
  const { data, isLoading, error } = useStockExtra(symbol, market);
  const isTW = !market || market === "TW";

  if (isLoading) {
    return (
      <Card className="bg-card border-border p-4">
        <h2 className="text-lg font-bold mb-2">[ 五檔行情 / 籌碼資訊 ]</h2>
        <div className="text-muted-foreground text-sm">[ 載入中... ]</div>
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

  return (
    <div className="space-y-4">
      {/* 五檔行情（所有市場） */}
      <Card className="bg-card border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">
            [ 五檔行情{name ? ` · ${name}` : ""} ]
          </h2>
          {ob?.isEstimate && (
            <span className="text-[10px] text-accent-foreground bg-accent/20 border border-accent/40 rounded px-2 py-0.5">
              盤後估算
            </span>
          )}
        </div>
        {ob && ob.levels?.length ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground mb-2 text-center">委買</div>
                <div className="space-y-1">
                  {ob.levels.map((lv, i) => (
                    <div
                      key={`bid-${i}`}
                      className="flex justify-between items-center text-sm bg-chart-1/10 border border-chart-1/30 rounded px-2 py-1"
                    >
                      <span className="text-muted-foreground text-xs">買{i + 1}</span>
                      <span className="text-chart-1 font-semibold">
                        {lv.bidPrice.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground text-xs">{fmtInt(lv.bidVol)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2 text-center">委賣</div>
                <div className="space-y-1">
                  {ob.levels.map((lv, i) => (
                    <div
                      key={`ask-${i}`}
                      className="flex justify-between items-center text-sm bg-destructive/10 border border-destructive/30 rounded px-2 py-1"
                    >
                      <span className="text-muted-foreground text-xs">賣{i + 1}</span>
                      <span className="text-destructive font-semibold">
                        {lv.askPrice.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground text-xs">{fmtInt(lv.askVol)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {ob.note && (
              <div className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{ob.note}</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-muted-foreground text-sm">暫無五檔資料</div>
        )}
      </Card>

      {/* 估值 / 溢價比（台股 BWIBBU；美股/港股 Yahoo） */}
      <Card className="bg-card border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">[ 估值 / 溢價比 ]</h2>
          {val?.rawDate && (
            <span className="text-[10px] text-muted-foreground">{val.rawDate}</span>
          )}
          {data?.currency && (
            <span className="text-[10px] text-muted-foreground">幣別 {data.currency}</span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {val?.isRealtime ? (
            <>
              <div className="border border-border rounded p-3 bg-background">
                <div className="text-xs text-muted-foreground mb-1">即時股價</div>
                <div className="text-lg font-bold text-primary">
                  {val.price?.toFixed ? val.price.toFixed(2) : val.price}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">盤後估值暫缺，顯示即時價</div>
              </div>
              <div className="border border-border rounded p-3 bg-background">
                <div className="text-xs text-muted-foreground mb-1">成交量</div>
                <div className="text-lg font-bold text-primary">
                  {val.volume ? (val.volume / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 0 }) + " 張" : "-"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">當日成交量</div>
              </div>
              <div className="border border-border rounded p-3 bg-background col-span-2 md:col-span-1">
                <div className="text-xs text-muted-foreground mb-1">本益比 / 殖利率</div>
                <div className="text-lg font-bold text-muted-foreground">資料暫缺</div>
                <div className="text-[10px] text-muted-foreground mt-1">證交所盤後尚未公告</div>
              </div>
            </>
          ) : (
            [
              {
                label: "本益比 (PER)",
                value: val?.peRatio && val.peRatio > 0 ? val.peRatio.toFixed(2) : "-",
                hint: "股價 / 每股盈餘",
              },
              {
                label: "股價淨值比 (PBR)",
                value: val?.pbRatio && val.pbRatio > 0 ? val.pbRatio.toFixed(2) : "-",
                hint: "股價 / 每股淨值",
              },
              {
                label: "殖利率",
                value: val?.dividendYield && val.dividendYield > 0 ? val.dividendYield.toFixed(2) + "%" : "-",
                hint: "現金股利 / 股價",
              },
              {
                label: "市值",
                value: fmtMarketCap(val?.marketCap),
                hint: "總市值",
              },
            ].map((item) => (
              <div key={item.label} className="border border-border rounded p-3 bg-background">
                <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                <div className="text-lg font-bold text-primary">{item.value}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{item.hint}</div>
              </div>
            ))
          )}
        </div>
        {!isTW && (
          <div className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>美股/港股估值（本益比、市值）需 Finnhub API key 才會顯示；目前顯示五檔與 52 週高低。</span>
          </div>
        )}
      </Card>

      {/* 52 週高低（美股/港股有） */}
      {!isTW && data?.fiftyTwoWeek && (data.fiftyTwoWeek.high || data.fiftyTwoWeek.low) && (
        <Card className="bg-card border-border p-4">
          <h2 className="text-lg font-bold mb-4">[ 52 週高低 ]</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-border rounded p-3 bg-background">
              <div className="text-xs text-muted-foreground mb-1">52 週最高</div>
              <div className="text-lg font-bold text-destructive">
                {data.fiftyTwoWeek.high?.toFixed(2) || "-"}
              </div>
            </div>
            <div className="border border-border rounded p-3 bg-background">
              <div className="text-xs text-muted-foreground mb-1">52 週最低</div>
              <div className="text-lg font-bold text-chart-1">
                {data.fiftyTwoWeek.low?.toFixed(2) || "-"}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 籌碼資訊：融資融券 + 三大法人（僅台股） */}
      <Card className="bg-card border-border p-4">
        <h2 className="text-lg font-bold mb-4">[ 籌碼資訊 ]</h2>
        {isTW ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-border rounded p-3 bg-background">
              <div className="text-sm font-semibold text-primary mb-2">融資融券餘額</div>
              {margin ? (
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">融資今日餘額</span>
                    <span className="font-semibold">{fmtInt(margin.marginBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">融券今日餘額</span>
                    <span className="font-semibold">{fmtInt(margin.shortBalance)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground text-xs">暫無資料（休市日或該股無資料）</div>
              )}
            </div>
            <div className="border border-border rounded p-3 bg-background">
              <div className="text-sm font-semibold text-primary mb-2">三大法人買賣超</div>
              {foreign ? (
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">外資</span>
                    <span className={foreign.foreignNet >= 0 ? "text-chart-1 font-semibold" : "text-destructive font-semibold"}>
                      {foreign.foreignNet >= 0 ? "+" : ""}{fmtLots(foreign.foreignNet)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">投信</span>
                    <span className={foreign.trustNet >= 0 ? "text-chart-1 font-semibold" : "text-destructive font-semibold"}>
                      {foreign.trustNet >= 0 ? "+" : ""}{fmtLots(foreign.trustNet)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">自營商</span>
                    <span className={foreign.dealerNet >= 0 ? "text-chart-1 font-semibold" : "text-destructive font-semibold"}>
                      {foreign.dealerNet >= 0 ? "+" : ""}{fmtLots(foreign.dealerNet)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground text-xs">
                  暫無資料（證交所盤後買賣超尚未公告，或非交易日）
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Info className="w-4 h-4" />
            <span>融資融券與三大法人買賣超目前僅支援台股（TW）。</span>
          </div>
        )}
      </Card>

      {/* 近 5 日技術動能（來自日線，籌碼暫缺時的替代觀察） */}
      {isTW && data?.recentCandles && data.recentCandles.length >= 2 && (() => {
        const cs = data.recentCandles;
        const first = cs[0].close;
        const last = cs[cs.length - 1].close;
        const chgPct = first ? ((last - first) / first) * 100 : 0;
        const up = chgPct >= 0;
        return (
          <Card className="bg-card border-border p-4">
            <h2 className="text-lg font-bold mb-4">[ 近 5 日技術動能 ]</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="border border-border rounded p-3 bg-background">
                <div className="text-xs text-muted-foreground mb-1">5 日收盤變化</div>
                <div className={`text-lg font-bold ${up ? "text-chart-1" : "text-destructive"}`}>
                  {up ? "+" : ""}{chgPct.toFixed(2)}%
                </div>
              </div>
              {cs.slice(-3).map((c, i) => (
                <div key={i} className="border border-border rounded p-3 bg-background">
                  <div className="text-xs text-muted-foreground mb-1">
                    {String(c.date).slice(-4)}
                  </div>
                  <div className="text-base font-bold text-foreground">
                    {c.close.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {(c.volume / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 0 })} 張
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              資料來源：證交所日線（STOCK_DAY）。籌碼面（融資/法人）暫缺時，以價量動能作為輔助觀察。
            </div>
          </Card>
        );
      })()}

      {/* 集保戶股權分散表（TDCC，僅台股） */}
      {isTW && <ShareholdingCard symbol={symbol} />}
    </div>
  );
}

/** 集保戶股權分散表卡（TDCC OpenAPI 週更資料） */
function ShareholdingCard({ symbol }: { symbol: string }) {
  const { data: resp, isLoading } = trpc.getShareholding.useQuery(
    { symbol },
    { staleTime: 10 * 60 * 1000, retry: 1 }
  );

  const sh = resp?.data;
  return (
    <Card className="bg-card border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">[ 集保股權分散 ]</h2>
        {sh?.date && (
          <span className="text-[10px] text-muted-foreground">
            資料日期 {String(sh.date).replace(/(\d{4})(\d{2})(\d{2})/, "$1/$2/$3")}（每週更新）
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="text-muted-foreground text-sm">[ 載入中（首次抓取約需 10-20 秒）... ]</div>
      ) : !sh ? (
        <div className="text-muted-foreground text-sm">
          {(resp as any)?.error || "暫無集保股權分散資料"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: "千張大戶", value: `${sh.bigLots1000.toFixed(2)}%`, hint: "持股 1,000 張以上比例" },
              { label: "400 張以上", value: `${sh.bigLots400.toFixed(2)}%`, hint: "中實戶 + 大戶比例" },
              { label: "10 張以下散戶", value: `${sh.retailUnder10.toFixed(2)}%`, hint: `${sh.retailHolders.toLocaleString("zh-TW")} 人` },
              { label: "總股東人數", value: sh.totalHolders.toLocaleString("zh-TW"), hint: "集保 ID 歸戶" },
            ].map((it) => (
              <div key={it.label} className="border border-border rounded p-3 bg-background">
                <div className="text-xs text-muted-foreground mb-1">{it.label}</div>
                <div className="text-lg font-bold text-primary">{it.value}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{it.hint}</div>
              </div>
            ))}
          </div>
          {/* 15 級距長條圖 */}
          <div className="space-y-1">
            {sh.tiers.map((t: any) => (
              <div key={t.level} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-muted-foreground text-right">{t.label}</span>
                <div className="flex-1 h-3 bg-background border border-border rounded overflow-hidden">
                  <div
                    className={`h-full ${t.level >= 12 ? "bg-destructive/70" : t.level <= 3 ? "bg-chart-1/70" : "bg-primary/50"}`}
                    style={{ width: `${Math.min(100, t.percent)}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right font-mono">{t.percent.toFixed(2)}%</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>
              資料來源：臺灣集中保管結算所 OpenAPI（每週最後營業日結算，ID 歸戶）。紅色 = 400 張以上大戶級距、綠色 = 10 張以下散戶級距。
              {resp?.fromCache && "（快取資料）"}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
