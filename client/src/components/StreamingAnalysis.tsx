import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, History } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";

interface StreamingAnalysisProps {
  symbol: string;
  market?: string;
}

interface AnalysisSection {
  title: string;
  content: string;
  isComplete: boolean;
}

interface StreamChunk {
  type: "text" | "section_start" | "section_end" | "complete" | "error" | "cached" | "status";
  content?: string;
  title?: string;
  message?: string;
}

export function StreamingAnalysis({ symbol, market }: StreamingAnalysisProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sections, setSections] = useState<AnalysisSection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 歷史紀錄清單（展開時才查）
  const { data: historyData, refetch: refetchHistory } = trpc.analysis.listHistory.useQuery(
    { symbol, market: market ?? "TW" },
    { enabled: showHistory }
  );

  // 選中的單筆歷史全文
  const { data: historyItem } = trpc.analysis.getById.useQuery(
    { id: selectedHistoryId ?? 0 },
    { enabled: selectedHistoryId !== null }
  );

  // 載入選中的歷史紀錄
  useEffect(() => {
    if (historyItem && selectedHistoryId !== null) {
      setSections([{ title: "歷史分析紀錄", content: historyItem.result || "", isComplete: true }]);
      setIsCached(true);
      setError(null);
      setShowHistory(false);
      setSelectedHistoryId(null);
    }
  }, [historyItem, selectedHistoryId]);

  // 透過 SSE（/api/analysis-stream）讀取串流分析
  const runAnalysis = async (force: boolean) => {
    setIsAnalyzing(true);
    setError(null);
    setStatus(null);
    setIsCached(false);
    setSections([]);
    setShowHistory(false);
    setSelectedHistoryId(null);
    setForceRefresh(force);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/analysis-stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, market: market ?? "TW", forceRefresh: force }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`分析請求失敗 (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // 即時累積的區塊狀態
      let currentSection: AnalysisSection | null = null;
      const flush = () => {
        const sec = currentSection;
        if (sec) {
          setSections((prev) => {
            const idx = prev.findIndex((s) => s.title === sec.title && !s.isComplete);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = { ...sec };
              return copy;
            }
            return [...prev, { ...sec }];
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE: 以 "\n\n" 切分事件
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = raw.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }

          if (chunk.type === "status") {
            setStatus(chunk.message || "處理中…");
          } else if (chunk.type === "cached") {
            setIsCached(true);
            setSections([{ title: "快取分析結果", content: chunk.content || "", isComplete: true }]);
            setIsAnalyzing(false);
          } else if (chunk.type === "section_start") {
            currentSection = { title: chunk.title || "分析", content: "", isComplete: false };
          } else if (chunk.type === "text" && chunk.content) {
            if (currentSection) {
              currentSection.content += chunk.content;
              flush(); // 即時更新 -> 打字機效果
            }
          } else if (chunk.type === "section_end") {
            if (currentSection) {
              currentSection.isComplete = true;
              flush();
              currentSection = null;
            }
          } else if (chunk.type === "error") {
            setError(chunk.message || "分析失敗");
            setIsAnalyzing(false);
          } else if (chunk.type === "complete") {
            if (currentSection) {
              currentSection.isComplete = true;
              flush();
              currentSection = null;
            }
            setIsAnalyzing(false);
          }
        }
      }
      setIsAnalyzing(false);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setError(e.message || "分析失敗");
      }
      setIsAnalyzing(false);
    }
  };

  const handleStartAnalysis = (force: boolean = false) => {
    runAnalysis(force);
  };

  return (
    <Card className="bg-card border-border p-4">
      <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
        <h2 className="text-lg font-bold">[ AI 詳細分析 ]</h2>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => handleStartAnalysis(sections.length > 0)}
            disabled={isAnalyzing}
            className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                {sections.length > 0 ? "重新分析" : "生成詳細分析"}
              </>
            )}
          </Button>
          <Button
            onClick={() => {
              setShowHistory((v) => !v);
              if (!showHistory) refetchHistory();
            }}
            disabled={isAnalyzing}
            variant="outline"
            size="sm"
            className="flex items-center gap-1.5"
          >
            <History className="w-4 h-4" />
            歷史紀錄
          </Button>
        </div>
      </div>

      {/* 歷史紀錄下拉 */}
      {showHistory && (
        <div className="mb-4 p-3 bg-background rounded border border-border max-h-60 overflow-y-auto">
          {!historyData || historyData.length === 0 ? (
            <div className="text-xs text-muted-foreground">[ 尚無分析紀錄 ]</div>
          ) : (
            <div className="space-y-1">
              {historyData.map((h: any) => (
                <button
                  key={h.id}
                  onClick={() => setSelectedHistoryId(h.id)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-card/60 transition-colors border border-border"
                >
                  <div className="text-xs font-medium text-primary">
                    #{h.id} · {String(h.createdAt).slice(0, 19).replace("T", " ")}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-1">
                    {h.preview || "（無預覽）"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded">
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      {/* 快取提示 */}
      {isCached && (
        <div className="mb-4 p-3 bg-chart-1/10 border border-chart-1 rounded">
          <div className="text-xs text-chart-1">[ 顯示快取分析結果 ]</div>
        </div>
      )}

      {/* 分析結果 */}
      {sections.length > 0 ? (
        <div className="space-y-4">
          {sections.map((section, idx) => (
            <div
              key={idx}
              className="p-4 bg-background rounded border border-border overflow-hidden"
            >
              <h3 className="text-sm font-bold text-primary mb-3">
                [ {section.title} ]
              </h3>
              <div className="text-base text-foreground whitespace-pre-wrap leading-relaxed [&_*]:text-base [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_strong]:font-bold">
                <Streamdown>{section.content}</Streamdown>
              </div>
              {!section.isComplete && (
                <div className="mt-2 text-xs text-muted-foreground">
                  [ 分析中... ]
                </div>
              )}
            </div>
          ))}
        </div>
      ) : !isAnalyzing ? (
        <div className="p-4 bg-background rounded border border-border text-center">
          <div className="text-xs text-muted-foreground">
            [ 點擊按鈕開始詳細分析 ]
          </div>
        </div>
      ) : null}

      {/* 載入狀態 */}
      {isAnalyzing && sections.length === 0 && (
        <div className="p-4 bg-background rounded border border-border text-center">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              {status || `[ 正在分析股票 ${symbol}... ]`}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
