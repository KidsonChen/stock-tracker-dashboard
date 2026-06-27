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
  getStockQuote,
  fetchAndCacheStockData,
} from "./db";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { streamDetailedAnalysis } from "./llm-stream";

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
      .input(z.object({ symbol: z.string().min(1).max(10) }))
      .mutation(async ({ input }) => {
        try {
          return await addToWatchlist(input.symbol);
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
      .input(z.object({ symbol: z.string().min(1).max(10) }))
      .query(async ({ input }) => {
        try {
          const quote = await getStockQuote(input.symbol);
          return {
            symbol: input.symbol.toUpperCase(),
            currentPrice: quote.c,
            open: quote.o,
            high: quote.h,
            low: quote.l,
            previousClose: quote.pc,
            timestamp: quote.t,
          };
        } catch (error) {
          console.error("[Stock] Failed to fetch quote:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch stock quote",
          });
        }
      }),

    getHistory: publicProcedure
      .input(z.object({ symbol: z.string().min(1).max(10) }))
      .query(async ({ input }) => {
        try {
          const isExpired = await isCacheExpired(input.symbol);

          if (isExpired) {
            await fetchAndCacheStockData(input.symbol);
          }

          const data = await getStockDataBySymbol(input.symbol);

          return data.map((row) => ({
            date: row.date,
            open: Number(row.open),
            high: Number(row.high),
            low: Number(row.low),
            close: Number(row.close),
            volume: Number(row.volume),
          }));
        } catch (error) {
          console.error("[Stock] Failed to fetch history:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch stock history",
          });
        }
      }),
  }),

  analysis: router({
    trend: publicProcedure
      .input(z.object({ symbol: z.string().min(1).max(10) }))
      .query(async ({ input }) => {
        try {
          const cached = await getAnalysisCache(0, input.symbol, "trend");
          if (cached) {
            return { result: cached.result, fromCache: true };
          }

          const quote = await getStockQuote(input.symbol);
          const history = await getStockDataBySymbol(input.symbol, 30);

          const prompt = `請分析股票 ${input.symbol}。
當前價格: $${quote.c}
開盤價: $${quote.o}
最高價: $${quote.h}
最低價: $${quote.l}
前收盤價: $${quote.pc}

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
      .input(z.object({ symbol: z.string().min(1).max(10) }))
      .query(async function* ({ input }) {
        try {
          const cached = await getAnalysisCache(0, input.symbol, "detailed");
          if (cached) {
            yield { type: "cached", content: cached.result };
            return;
          }

          const quote = await getStockQuote(input.symbol);
          const history = await getStockDataBySymbol(input.symbol, 30);

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
            quote.c,
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
