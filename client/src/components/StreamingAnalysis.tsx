import { useState, useEffect } from "react";
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

export function StreamingAnalysis({ symbol, market }: StreamingAnalysisProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sections, setSections] = useState<AnalysisSection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);

  const { data: streamData, isLoading } = trpc.analysis.detailedStream.useQuery(
    { symbol, market: market ?? "TW", forceRefresh },
    { enabled: isAnalyzing }
  );

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

  // 處理串流資料
  useEffect(() => {
    if (!streamData || !isAnalyzing) return;

    // 檢查是否是快取資料
    if (Array.isArray(streamData) && streamData[0]?.type === "cached") {
      setIsCached(true);
      setSections([
        {
          title: "快取分析結果",
          content: streamData[0].content || "",
          isComplete: true,
        },
      ]);
      setIsAnalyzing(false);
      return;
    }

    // 處理串流塊
    let currentSection: AnalysisSection | null = null;
    const newSections: AnalysisSection[] = [];

    for (const chunk of Array.isArray(streamData) ? streamData : [streamData]) {
      if (chunk.type === "section_start" && "title" in chunk) {
        if (currentSection) {
          newSections.push(currentSection);
        }
        currentSection = {
          title: (chunk as any).title || "分析",
          content: "",
          isComplete: false,
        };
      } else if (chunk.type === "section_end") {
        if (currentSection) {
          currentSection.isComplete = true;
          newSections.push(currentSection);
          currentSection = null;
        }
      } else if (chunk.type === "text" && chunk.content) {
        if (currentSection) {
          currentSection.content += chunk.content;
        }
      } else if (chunk.type === "error") {
        setError(chunk.message || "分析失敗");
        setIsAnalyzing(false);
      } else if (chunk.type === "complete") {
        if (currentSection) {
          currentSection.isComplete = true;
          newSections.push(currentSection);
        }
        setIsAnalyzing(false);
      }
    }

    setSections(newSections);
  }, [streamData, isAnalyzing]);

  const handleStartAnalysis = (force: boolean = false) => {
    setIsAnalyzing(true);
    setError(null);
    setIsCached(false);
    setSections([]);
    setShowHistory(false);
    setSelectedHistoryId(null);
    setForceRefresh(force);
  };

  return (
    <Card className="bg-card border-border p-4">
      <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
        <h2 className="text-lg font-bold">[ AI 詳細分析 ]</h2>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => handleStartAnalysis(sections.length > 0)}
            disabled={isAnalyzing || isLoading}
            className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {isAnalyzing || isLoading ? (
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
            disabled={isAnalyzing || isLoading}
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
      ) : !isAnalyzing && !isLoading ? (
        <div className="p-4 bg-background rounded border border-border text-center">
          <div className="text-xs text-muted-foreground">
            [ 點擊按鈕開始詳細分析 ]
          </div>
        </div>
      ) : null}

      {/* 載入狀態 */}
      {(isAnalyzing || isLoading) && sections.length === 0 && (
        <div className="p-4 bg-background rounded border border-border text-center">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              [ 正在分析股票 {symbol}... ]
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
