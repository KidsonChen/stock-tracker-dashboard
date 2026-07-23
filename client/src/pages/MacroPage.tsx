import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, RefreshCw, Sparkles } from "lucide-react";
import { Streamdown } from "streamdown";
import { trpc } from "@/lib/trpc";

const SUGGESTED = [
  "分析今天台股整體與半導體/記憶體/被動元件趨勢，以及部署策略",
  "韓國股市下跌對台股與美股的影響，該怎麼部署？",
  "台積電法說後的未來趨勢與看法",
];

/**
 * 宏觀儀表板：
 *  - 頂部對話框：輸入想查的消息/資料 → 送出
 *  - 下方：AI 生成「大盤 / 產業燈號 / 自選股 / 訊號」結構化報告（Markdown 渲染）
 *  - 支援「重新分析」強制跳過快取重生成
 */
export default function MacroPage() {
  const [input, setInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [report, setReport] = useState("");
  const [fromCache, setFromCache] = useState(false);

  const macroMutation = trpc.analysis.macro.useMutation({
    onSuccess: (data) => {
      setReport(data.result);
      setFromCache(data.fromCache);
    },
    onError: (err) => {
      setReport(`⚠️ 分析失敗：${err.message}`);
      setFromCache(false);
    },
  });

  const runQuery = (query: string, forceRefresh = false) => {
    const q = query.trim();
    if (!q || macroMutation.isPending) return;
    setSubmittedQuery(q);
    setReport("");
    setFromCache(false);
    macroMutation.mutate({ query: q, forceRefresh });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runQuery(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runQuery(input);
    }
  };

  const isPending = macroMutation.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-bold neon-glow mb-1">[ 宏觀儀表板 ]</h1>
          <p className="text-sm text-muted-foreground">
            輸入想了解的消息或資料，AI 生成大盤 · 產業燈號 · 自選股 · 訊號
          </p>
        </div>

        {/* 對話框 */}
        <Card className="bg-card border-border p-4">
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="例如：分析今天台股整體與半導體/記憶體/被動元件趨勢，以及部署策略…"
              className="flex-1 max-h-32 resize-none min-h-[44px] bg-input"
              rows={1}
              disabled={isPending}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isPending}
              className="shrink-0 h-[44px] px-4 flex items-center gap-2"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              送出
            </Button>
          </form>

          {/* 建議查詢 */}
          <div className="flex flex-wrap gap-2 mt-3">
            {SUGGESTED.map((s, i) => (
              <button
                key={i}
                onClick={() => {
                  setInput(s);
                  runQuery(s);
                }}
                disabled={isPending}
                className="text-xs px-3 py-1.5 rounded border border-border bg-background hover:bg-card/50 disabled:opacity-50 text-muted-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </Card>

        {/* AI 生成內容 */}
        <Card className="bg-card border-border p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              [ AI 生成分析 ]
            </h2>
            <div className="flex items-center gap-2">
              {fromCache && !isPending && (
                <span className="text-xs text-chart-1">[ 快取結果 ]</span>
              )}
              <Button
                onClick={() => submittedQuery && runQuery(submittedQuery, true)}
                disabled={!submittedQuery || isPending}
                size="sm"
                variant="outline"
                className="flex items-center gap-1.5"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                重新分析
              </Button>
            </div>
          </div>

          {isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              正在生成分析…
            </div>
          ) : report ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-base leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-4 [&_strong]:font-bold [&_table]:text-sm">
              <Streamdown>{report}</Streamdown>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground p-6 text-center">
              [ 送出查詢後，這裡會顯示 AI 生成的完整分析 ]
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
