import { useState } from "react";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { TrendingUp, TrendingDown } from "lucide-react";

interface IndustryIndex {
  name: string;
  index: number;
  change: number;
  changePercent: number;
}

type SortMode = "change_desc" | "change_asc" | "name";

export default function IndustryPage() {
  const { data, isLoading, error } = trpc.getIndustryIndices.useQuery();
  const [sortMode, setSortMode] = useState<SortMode>("change_desc");

  const raw = (data as any)?.data as IndustryIndex[] | undefined;
  const list = raw ? [...raw] : [];

  const sorted = [...list].sort((a, b) => {
    if (sortMode === "name") return a.name.localeCompare(b.name, "zh-Hant");
    if (sortMode === "change_asc") return a.changePercent - b.changePercent;
    return b.changePercent - a.changePercent; // change_desc
  });

  const topGainers = [...list].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5);
  const topLosers = [...list].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5);

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold neon-glow mb-2">[ 產業分析 ]</h1>
        <p className="text-sm text-muted-foreground mb-6">
          台股各產業類股指數表現（資料來源：證交所，盤後公告）
        </p>

        {isLoading && <div className="text-muted-foreground">[ 載入中... ]</div>}
        {error && (
          <Card className="bg-destructive/10 border-destructive p-4 text-destructive">
            載入失敗：{error.message}
          </Card>
        )}

        {!isLoading && !error && (
          <>
            {/* 漲跌幅前 5 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card className="bg-card border-border p-4">
                <h2 className="text-sm font-bold mb-3 text-chart-1">▲ 漲幅前 5 名產業</h2>
                <div className="space-y-1.5">
                  {topGainers.map((it) => (
                    <div key={it.name} className="flex justify-between items-center text-sm">
                      <span>{it.name}</span>
                      <span className="text-chart-1 font-semibold">
                        +{it.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="bg-card border-border p-4">
                <h2 className="text-sm font-bold mb-3 text-destructive">▼ 跌幅前 5 名產業</h2>
                <div className="space-y-1.5">
                  {topLosers.map((it) => (
                    <div key={it.name} className="flex justify-between items-center text-sm">
                      <span>{it.name}</span>
                      <span className="text-destructive font-semibold">
                        {it.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* 排序控制 */}
            <div className="flex gap-2 mb-4">
              {([
                { v: "change_desc", label: "漲幅高→低" },
                { v: "change_asc", label: "跌幅高→低" },
                { v: "name", label: "名稱" },
              ] as { v: SortMode; label: string }[]).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setSortMode(o.v)}
                  className={`text-xs px-3 py-1 rounded border ${
                    sortMode === o.v
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-input text-foreground border-border hover:bg-card/50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {/* 產業類股全表 */}
            <Card className="bg-card border-border p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">[ 產業類股指數 ]</h2>
                <span className="text-xs text-muted-foreground">共 {list.length} 個產業</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {sorted.map((it) => {
                  const up = it.changePercent >= 0;
                  return (
                    <div
                      key={it.name}
                      className="flex justify-between items-center border border-border rounded px-3 py-2 bg-background"
                    >
                      <span className="text-sm">{it.name}</span>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{it.index.toFixed(2)}</div>
                        <div
                          className={`text-xs flex items-center gap-1 ${
                            up ? "text-chart-1" : "text-destructive"
                          }`}
                        >
                          {up ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {up ? "+" : ""}
                          {it.changePercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
