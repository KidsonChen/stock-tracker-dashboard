import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getStockDataBySymbol,
  getAnalysisCache,
  saveAnalysisCache,
  isCacheExpired,
} from "./db-duckdb";
import { getTWSECandles, getTWSEQuote } from "./twse-live";
import { getYahooCandles, getYahooQuote } from "./yahoo";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { streamDetailedAnalysis } from "./llm-stream";

// 市場判斷：優先用前端傳入的 market，否則從 symbol 自動推斷（兜底，
// 避免舊資料 market 預設 TW 或前端漏傳導致港股/美股誤走 TWSE）。
//   含 .HK        -> 港股
//   含 .TW 或純數字 -> 台股
//   其他（字母）   -> 美股
function inferMarket(symbol: string, market?: string): string {
  const m = (market || "").toUpperCase();
  if (m === "TW" || m === "US" || m === "HK") return m;
  const s = symbol.toUpperCase();
  if (s.endsWith(".HK")) return "HK";
  if (s.endsWith(".TW") || /^\d{3,6}$/.test(s)) return "TW";
  return "US";
}

// 台股代號淨化：證交所/FinMind 只認純數字（2330），去掉 Yahoo 風格的 .TW 後綴
const cleanTaiwanSymbol = (symbol: string) =>
  symbol.replace(/\.TW$/i, "").toUpperCase();

// 是否台股市場（依推斷結果）
const isTaiwanMarket = (market: string) => market === "TW";

export const appRouter = router({
  system: systemRouter,

  watchlist: router({
    list: publicProcedure.query(async () => {
      try {
        return await getWatchlist();
      } catch (error) {
        console.error("[Watchlist] Failed to fetch list:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch watchlist",
        });
      }
    }),

    add: publicProcedure
      .input(z.object({ symbol: z.string().min(1).max(10), market: z.string().optional() }))
      .mutation(async ({ input }) => {
        try {
          return await addToWatchlist(input.symbol, input.market ?? "TW");
        } catch (error) {
          console.error("[Watchlist] Failed to add stock:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to add stock to watchlist",
          });
        }
      }),

    remove: publicProcedure
      .input(z.object({ symbol: z.string().min(1).max(10) }))
      .mutation(async ({ input }) => {
        try {
          await removeFromWatchlist(input.symbol);
          return { success: true };
        } catch (error) {
          console.error("[Watchlist] Failed to remove stock:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to remove stock from watchlist",
          });
        }
      }),
  }),

  stock: router({
    getQuote: publicProcedure
      .input(z.object({ symbol: z.string().min(1).max(10), market: z.string().optional() }))
      .query(async ({ input }) => {
        try {
          if (isTaiwanMarket(inferMarket(input.symbol, input.market))) {
            const quote = await getTWSEQuote(cleanTaiwanSymbol(input.symbol));
            return {
              symbol: input.symbol.toUpperCase(),
              currentPrice: quote.currentPrice,
              open: quote.open,
              high: quote.high,
              low: quote.low,
              previousClose: quote.previousClose,
              timestamp: quote.timestamp,
            };
          }
          const quote = await getYahooQuote(input.symbol);
          return {
            symbol: input.symbol.toUpperCase(),
            currentPrice: quote.currentPrice,
            open: quote.open,
            high: quote.high,
            low: quote.low,
            previousClose: quote.previousClose,
            timestamp: quote.timestamp,
          };
        } catch (error) {
          console.error("[Stock] Failed to fetch quote:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `無法取得 ${input.symbol} 報價（來源無資料）`,
          });
        }
      }),

    getHistory: publicProcedure
      .input(z.object({ symbol: z.string().min(1).max(10), market: z.string().optional() }))
      .query(async ({ input }) => {
        try {
          // 預設抓一年資料（365天）支援所有時段選擇
          const candles = isTaiwanMarket(inferMarket(input.symbol, input.market))
            ? await getTWSECandles(cleanTaiwanSymbol(input.symbol), 365)
            : await getYahooCandles(input.symbol, 365);
          if (!candles.length) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `無法取得 ${input.symbol} 歷史資料`,
            });
          }
          return candles.map((c) => ({
            date: c.date,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume),
          }));
        } catch (error) {
          console.error("[Stock] Failed to fetch history:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `無法取得 ${input.symbol} 歷史資料`,
          });
        }
      }),
  }),

  analysis: router({
    trend: publicProcedure
      .input(z.object({ symbol: z.string().min(1).max(10), market: z.string().optional() }))
      .query(async ({ input }) => {
        try {
          const cached = await getAnalysisCache(0, input.symbol, "trend");
          if (cached) {
            return { result: cached.result, fromCache: true };
          }

          const twMarket = isTaiwanMarket(inferMarket(input.symbol, input.market));
          const quote = twMarket
            ? await getTWSEQuote(cleanTaiwanSymbol(input.symbol))
            : await getYahooQuote(input.symbol);
          const history = twMarket
            ? await getTWSECandles(cleanTaiwanSymbol(input.symbol), 30)
            : await getYahooCandles(input.symbol, 30);

          if (!process.env.ROUTER_AI_API_KEY) {
            return {
              result: `【技術面】${input.symbol} 最新價 $${quote.currentPrice}（開 $${quote.open} / 高 $${quote.high} / 低 $${quote.low}）。\n⚠️ 未配置 ROUTER_AI_API_KEY，AI 分析已停用。請於 .env 設定後重啟以啟用自然語言分析。`,
              fromCache: false,
            };
          }

          const prompt = `請分析股票 ${input.symbol}。
當前價格: $${quote.currentPrice}
開盤價: $${quote.open}
最高價: $${quote.high}
最低價: $${quote.low}
前收盤價: $${quote.previousClose}

請提供簡潔的技術面和基本面分析，以及未來 1-3 個月的走勢預測。`;

          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "You are a professional stock analyst. Provide concise and actionable insights in Traditional Chinese.",
              },
              { role: "user", content: prompt },
            ],
          });

          const result =
            typeof response.choices[0]?.message.content === "string"
              ? response.choices[0].message.content
              : "";

          await saveAnalysisCache(0, input.symbol, "trend", result);

          return { result, fromCache: false };
        } catch (error) {
          console.error("[Analysis] Failed to analyze trend:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to analyze stock trend",
          });
        }
      }),

    detailedStream: publicProcedure
      .input(z.object({ symbol: z.string().min(1).max(10), market: z.string().optional() }))
      .query(async function* ({ input }) {
        try {
          const cached = await getAnalysisCache(0, input.symbol, "detailed");
          if (cached) {
            yield { type: "cached", content: cached.result };
            return;
          }

          const twMarket = isTaiwanMarket(inferMarket(input.symbol, input.market));
          const twseQuote = twMarket
            ? await getTWSEQuote(cleanTaiwanSymbol(input.symbol))
            : await getYahooQuote(input.symbol);
          const history = twMarket
            ? await getTWSECandles(cleanTaiwanSymbol(input.symbol), 30)
            : await getYahooCandles(input.symbol, 30);

          const high = Math.max(
            ...history.map((h) => Number(h.high || 0))
          );
          const low = Math.min(
            ...history.map((h) => Number(h.low || 0))
          );

          const candleData = history
            .map((h) => ({
              date: String(h.date),
              open: Number(h.open || 0),
              high: Number(h.high || 0),
              low: Number(h.low || 0),
              close: Number(h.close || 0),
              volume: Number(h.volume || 0),
            }))
            .reverse();

          let fullReport = "";

          for await (const chunk of streamDetailedAnalysis(
            input.symbol,
            twseQuote.currentPrice,
            high,
            low,
            candleData
          )) {
            yield chunk;

            if (chunk.type === "text" && chunk.content) {
              fullReport += chunk.content;
            }
          }

          if (fullReport) {
            await saveAnalysisCache(0, input.symbol, "detailed", fullReport);
          }
        } catch (error) {
          console.error("[Analysis] Failed to generate detailed report:", error);
          yield {
            type: "error",
            message: `分析失敗: ${
              error instanceof Error ? error.message : "未知錯誤"
            }`,
          };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
