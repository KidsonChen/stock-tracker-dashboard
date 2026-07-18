import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
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

  const { data: streamData, isLoading } = trpc.analysis.detailedStream.useQuery(
    { symbol, market: market ?? "TW" },
    { enabled: isAnalyzing }
  );

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

  const handleStartAnalysis = () => {
    setIsAnalyzing(true);
    setError(null);
    setIsCached(false);
    setSections([]);
  };

  return (
    <Card className="bg-card border-border p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">[ AI 詳細分析 ]</h2>
        <Button
          onClick={handleStartAnalysis}
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
              生成詳細分析
            </>
          )}
        </Button>
      </div>

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
              <div className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
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
