import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { analyzeTechnicals, formatTechnicalAnalysisForLLM, type CandleData } from "./ma-analysis";

export interface StreamChunk {
  type: "text" | "section_start" | "section_end" | "complete" | "error";
  content?: string;
  title?: string;
  message?: string;
}

/**
 * 使用 Manus 內建 LLM API 進行分析
 * 返回一個非同步生成器，逐步產出分析結果
 */
export async function* streamLLMAnalysis(
  systemPrompt: string,
  userPrompt: string
): AsyncGenerator<StreamChunk> {
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: ENV.routerAiModel || "openrouter/free",
      max_tokens: 2000,
    });

    const content = response.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      console.error("[LLM Stream] No content in response:", response);
      yield {
        type: "error",
        message: "未獲得分析結果",
      };
      return;
    }

    // 逐字輸出內容
    for (const char of content) {
      yield {
        type: "text",
        content: char,
      };
    }

    yield { type: "complete" };
  } catch (error) {
    console.error("[LLM Stream] Error:", error);
    yield {
      type: "error",
      message: `LLM 分析失敗: ${error instanceof Error ? error.message : "未知錯誤"}`,
    };
  }
}

/**
 * 詳細串流分析報告（整合均線技術分析）
 */
export async function* streamDetailedAnalysis(
  symbol: string,
  currentPrice: number,
  high: number,
  low: number,
  candleData?: CandleData[],
  companyName?: string,
  marketLabel?: string
): AsyncGenerator<StreamChunk> {
  try {
    const target = companyName
      ? `${companyName}（${marketLabel || ""} ${symbol}）`
      : symbol;
    // 如果提供了 K 線數據，進行技術分析
    let technicalAnalysisData = "";
    if (candleData && candleData.length > 0) {
      try {
        const analysis = analyzeTechnicals(candleData);
        technicalAnalysisData = formatTechnicalAnalysisForLLM(analysis);
        console.log("[LLM Stream] Technical analysis computed:", {
          symbol,
          trend: analysis.trend,
          trendStrength: analysis.trendStrength,
          signals: analysis.signals.length,
        });
      } catch (err) {
        console.warn("[LLM Stream] Failed to compute technical analysis:", err);
      }
    }

    // 第一部分：技術面分析
    yield { type: "section_start", title: "技術面分析" };

    const technicalPrompt = `請對股票 ${target} 進行詳細的技術面分析。
當前價格: $${currentPrice}
近期高點: $${high}
近期低點: $${low}

${technicalAnalysisData ? `【實時技術指標數據】\n${technicalAnalysisData}\n\n請基於上述均線數據進行深度分析。` : ""}

請分析：
1. 近期價格走勢與趨勢
2. 均線信號與交叉情況
3. 支撐位和阻力位
4. 技術面信號評估與買賣點

請用簡潔的方式逐步輸出分析結果，每個要點用換行分隔。`;

    console.log('[LLM Stream] Calling technical analysis LLM...');
    for await (const chunk of streamLLMAnalysis(
      "You are a professional stock analyst specializing in technical analysis. Respond in Traditional Chinese with clear structure. Pay special attention to moving average signals and trend analysis.",
      technicalPrompt
    )) {
      if (chunk.type === "complete") {
        yield { type: "section_end" };
        console.log('[LLM Stream] Technical analysis section complete');
      } else {
        yield chunk;
      }
    }

    // 第二部分：基本面分析
    yield { type: "section_start", title: "基本面分析" };

    const fundamentalPrompt = `請對股票 ${target} 進行詳細的基本面分析。
當前價格: $${currentPrice}

請分析：
1. 公司業績表現與增長趨勢
2. 財務健康度（負債率、現金流）
3. 行業地位與競爭優勢
4. 估值水平評估

請用簡潔的方式逐步輸出分析結果，每個要點用換行分隔。`;

    console.log('[LLM Stream] Calling fundamental analysis LLM...');
    try {
      for await (const chunk of streamLLMAnalysis(
        "You are a professional stock analyst specializing in fundamental analysis. Respond in Traditional Chinese with clear structure.",
        fundamentalPrompt
      )) {
        if (chunk.type === "complete") {
          yield { type: "section_end" };
          console.log('[LLM Stream] Fundamental analysis section complete');
        } else {
          yield chunk;
        }
      }
    } catch (err) {
      console.error('[LLM Stream] Fundamental analysis failed:', err);
      yield { type: 'error', message: '基本面分析失敗' };
    }

    // 第三部分：未來走勢預測
    yield { type: "section_start", title: "未來走勢預測" };

    const forecastPrompt = `基於以上分析，請預測股票 ${target} 在未來 1-3 個月的走勢。
當前價格: $${currentPrice}

${technicalAnalysisData ? `【技術面參考】\n支撐位：${technicalAnalysisData.match(/支撐位：\$[\d.]+/)?.[0] || "N/A"}\n阻力位：${technicalAnalysisData.match(/阻力位：\$[\d.]+/)?.[0] || "N/A"}\n` : ""}

請提供：
1. 短期（1 個月）價格目標
2. 中期（3 個月）價格目標
3. 主要風險因素
4. 投資建議與評級

請用簡潔的方式逐步輸出預測結果，每個要點用換行分隔。`;

    console.log('[LLM Stream] Calling forecast analysis LLM...');
    try {
      for await (const chunk of streamLLMAnalysis(
        "You are a professional stock analyst providing investment forecasts. Respond in Traditional Chinese with clear structure.",
        forecastPrompt
      )) {
        if (chunk.type === "complete") {
          yield { type: "section_end" };
          console.log('[LLM Stream] Forecast analysis section complete');
        } else {
          yield chunk;
        }
      }
    } catch (err) {
      console.error('[LLM Stream] Forecast analysis failed:', err);
      yield { type: 'error', message: '未來走勢預測失敗' };
    }

    yield { type: "complete" };
  } catch (error) {
    console.error("[LLM Stream] Error in detailed analysis:", error);
    yield {
      type: "error",
      message: `詳細分析失敗: ${error instanceof Error ? error.message : "未知錯誤"}`,
    };
  }
}
