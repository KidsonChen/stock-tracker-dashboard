import { useState, useEffect, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, History } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

// ═══════════════════════════════════════════════════════════
// 免費模型下拉選單
// ═══════════════════════════════════════════════════════════

/** Select 哨兵值：代表「使用後端預設模型」（不傳 model 給後端） */
const DEFAULT_MODEL_VALUE = "__default__";
const MODEL_STORAGE_KEY = "ai-analysis-model";

/** 內建免費模型清單（OpenRouter :free 系列）：動態清單載入失敗/為空時的 fallback */
const FALLBACK_FREE_MODELS: { id: string; name: string }[] = [
  { id: "deepseek/deepseek-chat-v3.1:free", name: "DeepSeek V3.1" },
  { id: "deepseek/deepseek-r1-0528:free", name: "DeepSeek R1（推理）" },
  { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash" },
  { id: "qwen/qwen3-235b-a22b:free", name: "Qwen3 235B" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B" },
  { id: "mistralai/mistral-small-3.2-24b-instruct:free", name: "Mistral Small 3.2" },
  { id: "openai/gpt-oss-20b:free", name: "GPT-OSS 20B" },
];

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

  // 目前選擇的免費模型（localStorage 記住上次選擇）
  const [modelValue, setModelValue] = useState<string>(() => {
    try {
      return window.localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL_VALUE;
    } catch {
      return DEFAULT_MODEL_VALUE;
    }
  });
  const handleModelChange = (v: string) => {
    setModelValue(v);
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, v);
    } catch {
      /* localStorage 不可用時忽略 */
    }
  };

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

  // 免費模型清單：動態載入（後端 10 分鐘快取），失敗/為空時用內建 fallback
  const { data: freeModelsData } = trpc.analysis.listFreeModels.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const modelOptions = useMemo(() => {
    const dynamic = (freeModelsData ?? []) as { id: string; name: string }[];
    const seen = new Set<string>();
    return [...dynamic, ...FALLBACK_FREE_MODELS].filter((m) => {
      if (!m?.id || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [freeModelsData]);

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

    // 選「預設模型」時不傳 model，由後端 ENV 決定
    const selectedModel = modelValue !== DEFAULT_MODEL_VALUE ? modelValue : undefined;

    try {
      const res = await fetch("/api/analysis-stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol,
          market: market ?? "TW",
          forceRefresh: force,
          model: selectedModel,
        }),
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
      // 節流 flush：逐字 setState 會讓長報告觸發數千次重渲染（Streamdown 每次都重新
      // 解析 markdown），導致頁面卡死。改為最多每 120ms 更新一次畫面。
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const doFlush = () => {
        flushTimer = null;
        const sec = currentSection;
        if (sec) {
          const snapshot = { ...sec };
          setSections((prev) => {
            const idx = prev.findIndex((s) => s.title === snapshot.title && !s.isComplete);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = snapshot;
              return copy;
            }
            return [...prev, snapshot];
          });
        }
      };
      const flush = (immediate = false) => {
        if (immediate) {
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
          doFlush();
          return;
        }
        if (!flushTimer) flushTimer = setTimeout(doFlush, 120);
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
              flush(true);
              currentSection = null;
            }
          } else if (chunk.type === "error") {
            setError(chunk.message || "分析失敗");
            setIsAnalyzing(false);
          } else if (chunk.type === "complete") {
            if (currentSection) {
              currentSection.isComplete = true;
              flush(true);
              currentSection = null;
            }
            setIsAnalyzing(false);
          }
        }
      }
      setIsAnalyzing(false);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        // 串流中斷：若已收到部分內容則保留並提示，避免整片消失
        setSections((prev) => {
          if (prev.length > 0) {
            setError("連線中斷，以下為已完成的部分分析。可按「重新分析」補完。");
            return prev.map((s) => ({ ...s, isComplete: true }));
          }
          setError(e.message === "network error" || e.message?.includes("Failed to fetch")
            ? "連線中斷（網路或伺服器逾時），請再按一次「生成詳細分析」"
            : e.message || "分析失敗");
          return prev;
        });
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
          {/* 免費模型選擇 */}
          <Select
            value={modelValue}
            onValueChange={handleModelChange}
            disabled={isAnalyzing}
          >
            <SelectTrigger
              size="sm"
              className="w-[180px] text-xs"
              title="選擇 AI 分析使用的免費模型"
            >
              <SelectValue placeholder="選擇免費模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_MODEL_VALUE} className="text-xs">
                預設模型（後端設定）
              </SelectItem>
              {modelOptions.length > 0 && (
                <>
                  <SelectSeparator />
                  {modelOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.name}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
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
