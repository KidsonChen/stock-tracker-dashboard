import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Newspaper, ExternalLink, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

interface NewsItem {
  title: string;
  source: string;
  link: string;
  pubDate: string;
}
interface NewsGroup {
  industry: string;
  query: string;
  items: NewsItem[];
}

const INDUSTRY_COLOR: Record<string, string> = {
  半導體: "bg-chart-1/15 border-chart-1/40 text-chart-1",
  記憶體: "bg-chart-3/15 border-chart-3/40 text-chart-3",
  被動元件: "bg-chart-4/15 border-chart-4/40 text-chart-4",
};

export default function NewsPage() {
  const [forceRefresh, setForceRefresh] = useState(false);
  const [symbolQuery, setSymbolQuery] = useState("");
  const { data, isLoading, isFetching, refetch } = trpc.analysis.news.useQuery(
    { forceRefresh },
    { refetchOnWindowFocus: false }
  );

  const groups: NewsGroup[] = (data?.groups as NewsGroup[]) || [];
  const handleRefresh = () => {
    setForceRefresh(true);
    refetch().finally(() => setForceRefresh(false));
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold neon-glow mb-1">[ 消息面分析 ]</h1>
            <p className="text-sm text-muted-foreground">
              半導體 / 記憶體 / 被動元件 最新新聞（Google News RSS 實抓）
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="查個股消息（如 2330）"
                value={symbolQuery}
                onChange={(e) => setSymbolQuery(e.target.value)}
                className="pl-8 bg-input w-44"
              />
            </div>
            <Button
              onClick={handleRefresh}
              disabled={isLoading || isFetching}
              className="flex items-center gap-1.5"
            >
              {isLoading || isFetching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              更新最新資料
            </Button>
          </div>
        </div>

        {data?.fromCache && (
          <div className="text-xs text-muted-foreground">
            快取資料（30 分鐘內），按「更新最新資料」重新抓取最新消息
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            正在抓取最新消息…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {groups.map((g) => (
              <Card key={g.industry} className={`p-4 ${INDUSTRY_COLOR[g.industry] || "bg-card border-border"}`}>
                <div className="font-bold text-base mb-3 flex items-center gap-1.5">
                  <Newspaper className="w-4 h-4" />
                  {g.industry}
                  <span className="text-[11px] font-normal opacity-70">（{g.items.length} 則）</span>
                </div>
                {g.items.length === 0 ? (
                  <div className="text-xs opacity-70">暫無新聞</div>
                ) : (
                  <div className="space-y-2">
                    {g.items.map((it, i) => (
                      <a
                        key={i}
                        href={it.link}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded border border-border/60 bg-background/60 p-2.5 hover:bg-background transition-colors"
                      >
                        <div className="text-xs font-medium leading-snug flex items-start gap-1">
                          <span className="flex-1">{it.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-50" />
                        </div>
                        <div className="text-[10px] opacity-60 mt-1.5">
                          {it.source} · {new Date(it.pubDate).toLocaleDateString("zh-TW")}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {symbolQuery.trim() && (
          <Card className="bg-card border-border p-4">
            <div className="text-sm text-muted-foreground">
              🔍 個股消息搜尋建議：於 Google News 搜尋「
              <span className="text-primary font-medium">{symbolQuery.trim()} 台股</span>
              」查看該股最新報導。
            </div>
            <a
              href={`https://news.google.com/search?q=${encodeURIComponent(symbolQuery.trim() + " 台股")}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              在新聞頁開啟 {symbolQuery.trim()} 相關消息
            </a>
          </Card>
        )}
      </div>
    </div>
  );
}
