import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";

interface AnalysisStreamProps {
  symbol: string;
  onAnalyze?: (type: "trend" | "detailed") => void;
}

interface StreamChunk {
  type: "section" | "chunk" | "cached" | "error" | "complete";
  title?: string;
  content?: string;
  message?: string;
  success?: boolean;
}

export function AIAnalysisStream({ symbol, onAnalyze }: AnalysisStreamProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisType, setAnalysisType] = useState<"trend" | "detailed" | null>(null);
  const [content, setContent] = useState<string>("");
  const [sections, setSections] = useState<Array<{ title: string; content: string }>>([]);

  const handleTrendAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisType("trend");
    setContent("");
    setSections([]);
    onAnalyze?.("trend");

    try {
      // 這裡將連接到後端 tRPC 程序
      // 暫時使用模擬資料
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setContent(`${symbol} 股票在近期呈現上升趨勢。技術面上，價格突破了關鍵阻力位，RSI 指標處於超買區域但未見明顯回調信號。基本面方面，公司最新財報顯示營收增長穩定，利潤率保持健康水平。\n\n未來 1-3 個月內，預計 ${symbol} 將繼續上升，目標價位為 $250-260。主要風險因素包括市場整體調整和行業政策變化。建議投資者在回調時逢低佈局。`);
    } catch (error) {
      setContent("分析失敗，請稍後重試");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDetailedAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisType("detailed");
    setContent("");
    setSections([]);
    onAnalyze?.("detailed");

    try {
      // 模擬串流分析
      setSections([]);
      let currentSection = "";

      // 技術面分析
      setSections((prev) => [...prev, { title: "技術面分析", content: "" }]);
      const technicalContent = `近期 ${symbol} 的技術面表現強勁。價格在過去 3 個月內上升 15%，突破了多個關鍵阻力位。\n\n關鍵技術指標分析：\n• RSI（相對強弱指數）：目前位於 68，接近超買區域但仍有上升空間\n• MACD：正向交叉，顯示上升動能\n• 移動平均線：20 日、50 日、200 日均線形成黃金交叉\n\n支撐位：$235、$220\n阻力位：$260、$280\n\n技術面信號：強烈買入信號`;

      for (let i = 0; i < technicalContent.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        setSections((prev) => {
          const updated = [...prev];
          if (updated[0]) {
            updated[0].content += technicalContent[i];
          }
          return updated;
        });
      }

      // 基本面分析
      setSections((prev) => [...prev, { title: "基本面分析", content: "" }]);
      const fundamentalContent = `${symbol} 的基本面保持穩健。最新季度財報顯示：\n\n業績表現：\n• 營收同比增長 12%\n• 淨利潤同比增長 18%\n• 毛利率維持在 35% 以上\n\n財務健康度：\n• 負債率：25%（行業平均 35%）\n• 現金流充足，自由現金流為正\n• 研發投入占營收 8%\n\n行業前景：\n• 所在行業預計未來 3 年 CAGR 為 10%\n• 公司市場份額持續提升\n• 新產品線即將推出\n\n估值水平：\n• P/E 比率：18 倍（行業平均 20 倍）\n• P/B 比率：3.2 倍\n• 相對低估，具有投資價值`;

      for (let i = 0; i < fundamentalContent.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        setSections((prev) => {
          const updated = [...prev];
          if (updated[1]) {
            updated[1].content += fundamentalContent[i];
          }
          return updated;
        });
      }

      // 未來走勢預測
      setSections((prev) => [...prev, { title: "未來走勢預測", content: "" }]);
      const forecastContent = `基於以上分析，${symbol} 未來走勢預測如下：\n\n預期價格目標：\n• 短期（1 個月）：$255-265\n• 中期（3 個月）：$270-290\n• 長期（12 個月）：$320-350\n\n風險因素：\n• 宏觀經濟衰退風險\n• 行業競爭加劇\n• 政策變化風險\n• 匯率波動風險\n\n投資建議：\n1. 對於長期投資者：建議逢低佈局，目標持有 12 個月以上\n2. 對於短期交易者：可在 $240-250 區間進場，目標 $260-270\n3. 風險管理：設置止損位於 $220，止盈位於 $290\n\n總體評級：強烈買入（★★★★★）`;

      for (let i = 0; i < forecastContent.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        setSections((prev) => {
          const updated = [...prev];
          if (updated[2]) {
            updated[2].content += forecastContent[i];
          }
          return updated;
        });
      }
    } catch (error) {
      setSections([{ title: "錯誤", content: "分析失敗，請稍後重試" }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Card className="bg-card border-border p-4">
      <h2 className="text-lg font-bold mb-4">[ AI 趨勢分析 ]</h2>
      <div className="space-y-3">
        <Button
          onClick={handleTrendAnalysis}
          disabled={isAnalyzing}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isAnalyzing && analysisType === "trend" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              分析中...
            </>
          ) : (
            "分析未來趨勢"
          )}
        </Button>
        <Button
          onClick={handleDetailedAnalysis}
          disabled={isAnalyzing}
          className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90 disabled:opacity-50"
        >
          {isAnalyzing && analysisType === "detailed" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              生成中...
            </>
          ) : (
            "生成詳細報告"
          )}
        </Button>
      </div>

      {/* 簡單趨勢分析結果 */}
      {analysisType === "trend" && content && (
        <div className="mt-4 p-3 bg-background rounded border border-border">
          <div className="text-xs text-muted-foreground mb-2">[ 趨勢分析結果 ]</div>
          <div className="text-sm text-foreground whitespace-pre-wrap">
            <Streamdown>{content}</Streamdown>
          </div>
        </div>
      )}

      {/* 詳細分析報告 */}
      {analysisType === "detailed" && sections.length > 0 && (
        <div className="mt-4 space-y-3">
          {sections.map((section, idx) => (
            <div key={idx} className="p-3 bg-background rounded border border-border">
              <div className="text-sm font-bold text-primary mb-2">[ {section.title} ]</div>
              <div className="text-xs text-foreground whitespace-pre-wrap">
                <Streamdown>{section.content}</Streamdown>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 空狀態 */}
      {!content && sections.length === 0 && (
        <div className="mt-4 p-3 bg-background rounded border border-border">
          <div className="text-xs text-muted-foreground">[ 點擊按鈕開始分析 ]</div>
        </div>
      )}
    </Card>
  );
}
