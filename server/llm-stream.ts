import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import {
  analyzeTechnicals,
  formatTechnicalAnalysisForLLM,
  calculateAdvancedIndicators,
  formatAdvancedIndicatorsForLLM,
  type CandleData,
} from "./ma-analysis";

export interface StreamChunk {
  type: "text" | "section_start" | "section_end" | "complete" | "error" | "status" | "cached";
  content?: string;
  title?: string;
  message?: string;
}

/**
 * 使用 LLM API 進行分析（逐字流出）
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
      model: "openrouter/free",
      max_tokens: 2500,
    });

    const content = response.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      console.error("[LLM Stream] No content in response:", response);
      yield { type: "error", message: "未獲得分析結果" };
      return;
    }

    // 分批輸出（每 12 字一個 chunk）：兼顧打字機效果與 SSE 事件數量
    const STEP = 12;
    for (let i = 0; i < content.length; i += STEP) {
      yield { type: "text", content: content.slice(i, i + STEP) };
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

// ═══════════════════════════════════════════════════════════
// 資料蒐集：技術面 / 基本面 / 籌碼面 真實數據 → prompt 注入
// 任一來源失敗都不阻斷分析（該面向降級為「數據暫缺」）。
// ═══════════════════════════════════════════════════════════

interface GatheredData {
  candles: CandleData[];
  technicalText: string;   // MA 趨勢 + 進階指標
  fundamentalText: string; // 月營收 + EPS + 估值
  chipsText: string;       // 法人/融資券/股權分散
  priceLine: string;       // 現價摘要
}

async function gatherAnalysisData(
  symbol: string,
  marketLabel: string,
  presetCandles?: CandleData[]
): Promise<GatheredData> {
  const isTW = marketLabel === "台股";
  const sym = symbol.replace(/\.TW$/i, "").toUpperCase();

  let candles: CandleData[] = presetCandles ?? [];
  let priceLine = "";
  let technicalText = "";
  let fundamentalText = "";
  let chipsText = "";

  // --- K 線（技術面基礎）---
  try {
    if (candles.length === 0) {
      if (isTW) {
        const { getTWSECandles } = await import("./twse-live");
        candles = (await getTWSECandles(sym, 250)) as CandleData[];
      } else {
        const { getYahooCandles } = await import("./yahoo");
        candles = (await getYahooCandles(symbol)) as CandleData[];
      }
    }
  } catch (e) {
    console.warn("[Gather] candles failed:", (e as Error).message);
  }

  if (candles.length > 0) {
    const last = candles[candles.length - 1];
    priceLine = `現價 ${last.close}（${last.date}），近 20 日高 ${Math.max(...candles.slice(-20).map((c) => c.high))} / 低 ${Math.min(...candles.slice(-20).map((c) => c.low))}`;
    try {
      technicalText = formatTechnicalAnalysisForLLM(analyzeTechnicals(candles));
      const adv = calculateAdvancedIndicators(candles);
      if (adv) technicalText += "\n\n" + formatAdvancedIndicatorsForLLM(adv);
    } catch (e) {
      console.warn("[Gather] technicals failed:", (e as Error).message);
    }
  }

  // --- 基本面（台股：TWSE OpenAPI 月營收/EPS + BWIBBU 估值）---
  if (isTW) {
    try {
      const { getFundamentals, formatFundamentalsForLLM } = await import("./fundamentals");
      const f = await getFundamentals(sym);
      if (f) fundamentalText = formatFundamentalsForLLM(f);
    } catch (e) {
      console.warn("[Gather] fundamentals failed:", (e as Error).message);
    }
    try {
      const { getValuation } = await import("./twse-extra");
      const v = await getValuation(sym);
      if (v) {
        fundamentalText +=
          (fundamentalText ? "\n" : "") +
          `【估值】本益比 ${v.peRatio || "—"}、股價淨值比 ${v.pbRatio || "—"}、殖利率 ${v.dividendYield || "—"}%（證交所 ${v.rawDate || ""}）`;
      }
    } catch { /* 估值暫缺可接受 */ }

    // --- 籌碼面：法人買賣超 + 融資融券 + 集保股權分散（僅讀快取，不觸發 10MB 抓取）---
    try {
      const { getMargin, getForeignTrade } = await import("./twse-extra");
      const [margin, ft] = await Promise.all([getMargin(sym), getForeignTrade(sym)]);
      const parts: string[] = [];
      if (ft) {
        parts.push(
          `三大法人買賣超：外資 ${ft.foreignNet >= 0 ? "+" : ""}${Math.round(ft.foreignNet / 1000)} 張、投信 ${ft.trustNet >= 0 ? "+" : ""}${Math.round(ft.trustNet / 1000)} 張、自營商 ${ft.dealerNet >= 0 ? "+" : ""}${Math.round(ft.dealerNet / 1000)} 張`
        );
      }
      if (margin) {
        parts.push(`融資餘額 ${margin.marginBalance}、融券餘額 ${margin.shortBalance}`);
      }
      if (parts.length) chipsText = parts.join("\n");
    } catch (e) {
      console.warn("[Gather] chips failed:", (e as Error).message);
    }
    try {
      const { getAnalysisCache } = await import("./db-r2");
      const cached = await getAnalysisCache(0, sym, "tdcc");
      if (cached) {
        const sh = JSON.parse(cached.result);
        chipsText +=
          (chipsText ? "\n" : "") +
          `集保股權分散（${sh.date}）：千張大戶 ${sh.bigLots1000}%、400張以上 ${sh.bigLots400}%、10張以下散戶 ${sh.retailUnder10}%（${sh.retailHolders?.toLocaleString?.() ?? sh.retailHolders} 人）、總股東 ${sh.totalHolders?.toLocaleString?.() ?? sh.totalHolders} 人`;
      }
    } catch { /* 股權分散快取暫缺可接受 */ }
  } else {
    // 美/港股：Yahoo 估值 + 52 週
    try {
      const { getYahooQuote, getYahooValuation } = await import("./yahoo");
      const q = await getYahooQuote(symbol);
      const v = await getYahooValuation(symbol).catch(() => null);
      const parts: string[] = [];
      if (q?.fiftyTwoWeekHigh) parts.push(`52 週高 ${q.fiftyTwoWeekHigh} / 低 ${q.fiftyTwoWeekLow}，幣別 ${q.currency}`);
      if (v?.peRatio) parts.push(`本益比 ${v.peRatio}、市值 ${v.marketCap ?? "—"}`);
      if (parts.length) fundamentalText = parts.join("\n");
    } catch { /* Yahoo 估值常缺，可接受 */ }
  }

  return { candles, technicalText, fundamentalText, chipsText, priceLine };
}

// ═══════════════════════════════════════════════════════════
// 四面向 AI 分析報告（技術/基本/籌碼/總結，數據驅動）
// ═══════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `你是一位資深台股/美股分析師，同時精通技術分析（量價、均線、MACD/RSI/KD/布林）、基本面分析（財報、營收、估值）與籌碼分析（法人動向、股權分散）。

鐵律：
1. 只根據使用者提供的【真實數據】分析；提供的數據沒有的資訊，明說「數據未提供」，嚴禁編造數字（尤其 EPS、營收、目標價不可捏造）。
2. 用繁體中文，結構化輸出（小標題 + 條列），每個結論都要對應到具體數據。
3. 多空判斷要給出明確傾向（偏多/中性/偏空）與依據，不要含糊其辭。
4. 最後提醒「本分析僅供參考，非投資建議」。`;

/**
 * 詳細串流分析報告 — 四面向（技術/基本/籌碼/綜合研判）
 * 未提供 candleData 時自行抓取（SSE 端點呼叫時 price/high/low 可傳 0）。
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
    const mkt = marketLabel || "台股";
    const target = companyName ? `${companyName}（${mkt} ${symbol}）` : `${symbol}（${mkt}）`;

    yield { type: "status", message: "正在蒐集真實市場數據（K線/財報/籌碼）…" };
    const data = await gatherAnalysisData(symbol, mkt, candleData);
    const nameLine = data.priceLine || (currentPrice ? `現價 ${currentPrice}，近期高 ${high} / 低 ${low}` : "");

    // ── 第一部分：技術面 ──
    yield { type: "section_start", title: "技術面分析" };
    const technicalPrompt = `分析標的：${target}
${nameLine}

${data.technicalText ? `以下為系統計算的【真實技術指標數據】：\n${data.technicalText}` : "（K 線數據暫缺，請說明無法進行完整技術分析，僅給出一般性框架）"}

請依據上述數據進行技術面分析，涵蓋：
1. 趨勢研判（均線排列、MACD 方向）
2. 動量與超買超賣（RSI、KD 位置的含義）
3. 波動與關鍵價位（布林通道位置、支撐/阻力、乖離）
4. 量價關係（量比所反映的資金態度）
5. 技術面小結：偏多 / 中性 / 偏空，以及理由`;

    for await (const chunk of streamLLMAnalysis(SYSTEM_PROMPT, technicalPrompt)) {
      if (chunk.type === "complete") yield { type: "section_end" };
      else yield chunk;
    }

    // ── 第二部分：基本面 ──
    yield { type: "section_start", title: "基本面分析" };
    const fundamentalPrompt = `分析標的：${target}
${nameLine}

${data.fundamentalText ? `以下為【真實基本面數據】（來源：公開資訊觀測站/證交所）：\n${data.fundamentalText}` : "（基本面數據暫缺——可能為上櫃股票或非台股。請明說數據未提供，僅就該公司公開已知的產業地位做定性描述，勿捏造財務數字）"}

請依據上述數據進行基本面分析，涵蓋：
1. 營收動能（MoM/YoY 與累計營收成長的解讀，公司備註的意義）
2. 獲利能力（EPS、營益率、稅後淨利率的水準與趨勢）
3. 估值水位（本益比/股價淨值比/殖利率 vs 產業常態）
4. 基本面小結：成長性與估值是否匹配`;

    for await (const chunk of streamLLMAnalysis(SYSTEM_PROMPT, fundamentalPrompt)) {
      if (chunk.type === "complete") yield { type: "section_end" };
      else yield chunk;
    }

    // ── 第三部分：籌碼面（有數據才輸出）──
    if (data.chipsText) {
      yield { type: "section_start", title: "籌碼面分析" };
      const chipsPrompt = `分析標的：${target}
${nameLine}

以下為【真實籌碼數據】（來源：證交所/集保結算所）：
${data.chipsText}

請依據上述數據進行籌碼面分析，涵蓋：
1. 法人動向（外資/投信/自營商買賣超的多空含義）
2. 散戶與大戶結構（股權分散：千張大戶 vs 散戶比例的意義與變化方向）
3. 槓桿情緒（融資融券餘額反映的市場心理）
4. 籌碼面小結：籌碼趨向集中或分散、對股價的支撐/壓力意涵`;

      for await (const chunk of streamLLMAnalysis(SYSTEM_PROMPT, chipsPrompt)) {
        if (chunk.type === "complete") yield { type: "section_end" };
        else yield chunk;
      }
    }

    // ── 第四部分：綜合研判 ──
    yield { type: "section_start", title: "綜合研判與策略" };
    const summaryPrompt = `分析標的：${target}
${nameLine}

綜合前述三個面向的真實數據：
${data.technicalText ? "— 技術面數據已提供（均線/MACD/RSI/KD/布林/量比）" : "— 技術面數據暫缺"}
${data.fundamentalText ? "— 基本面數據已提供（月營收/EPS/估值）" : "— 基本面數據暫缺"}
${data.chipsText ? "— 籌碼面數據已提供（法人/融資券/股權分散）" : "— 籌碼面數據暫缺"}

重點數據回顧：
${[data.technicalText, data.fundamentalText, data.chipsText].filter(Boolean).join("\n\n")}

請給出：
1. 三面向交叉驗證：訊號一致還是分歧？哪個面向主導當前走勢？
2. 情境推演：短期（1 個月內）偏多/偏空情境的觸發條件與對應關鍵價位（用技術面算出的支撐/阻力，不要新造數字）
3. 主要風險因素（至少 2 項，須與數據對應）
4. 操作策略建議：積極型 vs 保守型投資人分別如何應對
5. 結尾附上「本分析僅供參考，非投資建議」`;

    for await (const chunk of streamLLMAnalysis(SYSTEM_PROMPT, summaryPrompt)) {
      if (chunk.type === "complete") yield { type: "section_end" };
      else yield chunk;
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
