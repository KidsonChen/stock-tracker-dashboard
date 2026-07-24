import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Newspaper, ExternalLink } from "lucide-react";
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
  error?: string;
}

const INDUSTRY_COLOR: Record<string, string> = {
  半導體: "bg-chart-1/15 border-chart-1/40 text-chart-1",
  記憶體: "bg-chart-3/15 border-chart-3/40 text-chart-3",
  被動元件: "bg-chart-4/15 border-chart-4/40 text-chart-4",
};

export function NewsPanel() {
  const [forceRefresh, setForceRefresh] = useState(false);
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
    <Card className="bg-card border-border p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-primary" />
          [ 消息面分析 ]
        </h2>
        <Button
          onClick={handleRefresh}
          disabled={isLoading || isFetching}
          variant="outline"
          size="sm"
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

      {data?.fromCache && (
        <div className="text-xs text-muted-foreground mb-3">
          快取資料（30 分鐘內），按「更新最新資料」重抓
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          正在抓取最新消息…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <div
              key={g.industry}
              className={`rounded-lg border p-3 ${
                INDUSTRY_COLOR[g.industry] || "bg-background border-border"
              }`}
            >
              <div className="font-bold text-sm mb-2 flex items-center gap-1.5">
                {g.industry}
                <span className="text-[10px] font-normal opacity-70">
                  （{g.items.length} 則）
                </span>
              </div>
              {g.items.length === 0 ? (
                <div className="text-xs opacity-70">
                  {g.error ? (
                    <span className="text-amber-500">⚠️ {g.error}</span>
                  ) : (
                    "暫無相關新聞"
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {g.items.map((it, i) => (
                    <a
                      key={i}
                      href={it.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded border border-border/60 bg-background/60 p-2 hover:bg-background transition-colors"
                    >
                      <div className="text-xs font-medium leading-snug flex items-start gap-1">
                        <span className="flex-1">{it.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-50" />
                      </div>
                      <div className="text-[10px] opacity-60 mt-1">
                        {it.source} · {new Date(it.pubDate).toLocaleDateString("zh-TW")}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
