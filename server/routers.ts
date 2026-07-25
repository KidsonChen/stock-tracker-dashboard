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
  listAnalysisHistory,
  getAnalysisById,
  getHoldings,
  upsertHolding,
  removeHolding,
} from "./db-r2";
import { getShareholding as fetchTdccShareholding } from "./tdcc";
import { getTWSECandles, getTWSEQuote } from "./twse-live";
import { getValuation, estimateOrderBook, getMargin, getForeignTrade, getIndustryIndices as fetchIndustryIndices } from "./twse-extra";
import { getYahooCandles, getYahooQuote, getYahooValuation } from "./yahoo";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { fetchIndustryNews } from "./news";

// 市場判斷：優先用前端傳入的 market，否則從 symbol 自動推斷（兜底，
// 避免舊資料 market 預設 TW 或前端漏傳導致港股/美股誤走 TWSE）。
//   含 .HK        -> 港股
//   含 .TW 或純數字 -> 台股
//   其他（字母）   -> 美股
function inferMarket(symbol: string, market?: string): string {
  const s = symbol.toUpperCase();
  // 優先從代號後綴/格式推斷（避免 watchlist 存錯的 market 導致來源錯誤）
  if (s.endsWith(".HK")) return "HK";
  if (s.endsWith(".TW")) return "TW";
  if (/^\d{3,6}$/.test(s)) return "TW"; // 純數字 = 台股
  // 代號無法推斷時，才信任傳入 market
  const m = (market || "").toUpperCase();
  if (m === "TW" || m === "US" || m === "HK") return m;
  return "US"; // 純字母無後綴 = 美股
}

// 台股代號淨化：證交所/FinMind 只認純數字（2330），去掉 Yahoo 風格的 .TW 後綴
const cleanTaiwanSymbol = (symbol: string) =>
  symbol.replace(/\.TW$/i, "").toUpperCase();

// 是否台股市場（依推斷結果）
const isTaiwanMarket = (market: string) => market === "TW";

// ---- 庫存頁密碼保護 ----
// 密碼存於環境變數 PORTFOLIO_PASSWORD（Cloudflare Pages secret / 本地 .env）。
// 未設定時視為未啟用保護（開發環境友善），但正式環境務必設定。
function checkPortfolioPassword(password: string): boolean {
  const expected = process.env.PORTFOLIO_PASSWORD;
  if (!expected) return true; // 未設定 = 不啟用保護
  return password === expected;
}
function assertPortfolioPassword(password: string): void {
  if (!checkPortfolioPassword(password)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "密碼錯誤" });
  }
}

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
          const _mkt = inferMarket(input.symbol, input.market);
          const _marketLabel = _mkt === "US" ? "美股" : _mkt === "HK" ? "港股" : "台股";
          const cached = await getAnalysisCache(0, `${input.symbol}:${_marketLabel}`, "trend");
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

          const marketLabel =
            inferMarket(input.symbol, input.market) === "US" ? "美股" :
            inferMarket(input.symbol, input.market) === "HK" ? "港股" : "台股";
          const companyName = twMarket ? input.symbol : (quote as any).name || input.symbol;


          if (!process.env.ROUTER_AI_API_KEY) {
            return {
              result: `【技術面】${companyName}（${marketLabel} ${input.symbol}）最新價 $${quote.currentPrice}（開 $${quote.open} / 高 $${quote.high} / 低 $${quote.low}）。\n⚠️ 未配置 ROUTER_AI_API_KEY，AI 分析已停用。請於 .env 設定後重啟以啟用自然語言分析。`,
              fromCache: false,
            };
          }

          const prompt = `請分析股票 ${companyName}（${marketLabel}，代號 ${input.symbol}）。
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

          await saveAnalysisCache(0, `${input.symbol}:${marketLabel}`, "trend", result);

          return { result, fromCache: false };
        } catch (error) {
          console.error("[Analysis] Failed to analyze trend:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to analyze stock trend",
          });
        }
      }),

    // 註：詳細分析串流已遷移至 SSE 端點 /api/analysis-stream（見 functions/api/[[route]].ts），
    // 前端 StreamingAnalysis 直接 fetch 該端點讀 SSE，不再經由 tRPC generator（Workers 不支援）。
    // 此 procedure 保留名稱以避免前端型別斷鏈，但不再使用。
    detailedStream: publicProcedure
      .input(z.object({ symbol: z.string().min(1).max(10), market: z.string().optional(), forceRefresh: z.boolean().optional() }))
      .query(async () => {
        return { migrated: true, useEndpoint: "/api/analysis-stream" };
      }),

    // 列出某股歷史分析紀錄（新→舊），供「歷史紀錄」下拉。快取 key 格式：SYMBOL:市場別
    listHistory: publicProcedure
      .input(z.object({ symbol: z.string().min(1).max(10), market: z.string().optional() }))
      .query(async ({ input }) => {
        try {
          const mkt = inferMarket(input.symbol, input.market);
          const marketLabel = mkt === "US" ? "美股" : mkt === "HK" ? "港股" : "台股";
          const key = `${input.symbol}:${marketLabel}`;
          const rows = await listAnalysisHistory(0, key, "detailed");
          return rows.map((r) => ({
            id: r.id,
            createdAt: r.createdAt,
            preview: (r.result || "").replace(/[#*\n]/g, " ").slice(0, 60),
          }));
        } catch (error) {
          console.error("[Analysis] listHistory failed:", error);
          return [];
        }
      }),

    // 依 id 取單筆歷史分析全文
    getById: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        const row = await getAnalysisById(0, input.id);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "紀錄不存在" });
        return { id: row.id, symbol: row.symbol, result: row.result, createdAt: row.createdAt };
      }),

    // 宏觀儀表板分析：自然語言查詢 → 生成「大盤/產業燈號/自選股/訊號」，快取 type=macro
    macro: publicProcedure
      .input(z.object({ query: z.string().min(1).max(500), forceRefresh: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        try {
          const cacheKey = `MACRO:${input.query.trim()}`;
          const cached = input.forceRefresh ? null : await getAnalysisCache(0, cacheKey, "macro");
          if (cached) {
            return { result: cached.result, fromCache: true };
          }

          if (!process.env.ROUTER_AI_API_KEY) {
            return {
              result:
                "⚠️ 未配置 ROUTER_AI_API_KEY，AI 分析已停用。請於 .env 設定後重啟以啟用宏觀分析。",
              fromCache: false,
            };
          }

          const watchlist = await getWatchlist();
          const wlSymbols =
            watchlist.map((w) => `${w.symbol}(${w.market || "TW"})`).join(", ") || "（無自選股）";

          const systemPrompt =
            "你是專業的台股宏觀分析師。根據使用者查詢與市場背景，生成結構化繁體中文報告，必須包含以下四個 Markdown 區塊：\n" +
            "## 📊 大盤概況\n## 🚦 產業強弱燈號（半導體 / 記憶體 / 被動元件，各給 🟢強/🟡中性/🔴弱 評級與一句理由）\n## ⭐ 自選股動態（逐一列出使用者自選股並給簡要觀察）\n## 🎯 止穩訊號與部署建議\n" +
            "嚴守事實、不臆造數字；缺即時數據時明確標註「資料暫缺」。結尾加一行「⚠️ 本分析為趨勢整理，非投資建議」。";

          const userPrompt =
            `使用者查詢：「${input.query}」\n\n目前自選股清單：${wlSymbols}\n\n請據此生成宏觀分析報告。`;

          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          });

          const result =
            typeof response.choices[0]?.message.content === "string"
              ? response.choices[0].message.content
              : "";

          if (result) {
            await saveAnalysisCache(0, cacheKey, "macro", result);
          }
          return { result: result || "AI 回傳為空，請稍後再試。", fromCache: false };
        } catch (error) {
          console.error("[Analysis] macro failed:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `宏觀分析失敗: ${error instanceof Error ? error.message : "未知錯誤"}`,
          });
        }
      }),

    // 消息面分析：抓取三產業（半導體/記憶體/被動元件）最新新聞，快取 30 分鐘。
    // forceRefresh=true 時跳過快取重新抓取（即「更新最新資料」按鈕）。
    news: publicProcedure
      .input(z.object({ forceRefresh: z.boolean().optional() }))
      .query(async ({ input }) => {
        const CACHE_KEY = "NEWS:INDUSTRY";
        if (!input.forceRefresh) {
          const cached = await getAnalysisCache(0, CACHE_KEY, "news");
          if (cached) {
            try {
              return { groups: JSON.parse(cached.result), fromCache: true, cachedAt: cached.createdAt };
            } catch {
              /* 解析失敗則重抓 */
            }
          }
        }
        const groups = await fetchIndustryNews();
        try {
          await saveAnalysisCache(0, CACHE_KEY, "news", JSON.stringify(groups));
        } catch (e) {
          console.error("[Analysis] news cache save failed:", (e as Error).message);
        }
        return { groups, fromCache: false, cachedAt: new Date().toISOString() };
      }),
  }),
  getExtra: publicProcedure
    .input(z.object({ symbol: z.string().min(1).max(10), market: z.string().optional() }))
    .query(async ({ input }) => {
      const market = inferMarket(input.symbol, input.market);
      const sym = cleanTaiwanSymbol(input.symbol);
      const result: any = {
        symbol: input.symbol.toUpperCase(),
        market,
        valuation: null,
        orderBook: null,
        margin: null,
        foreignTrade: null,
      };
      try {
        if (isTaiwanMarket(market)) {
          result.valuation = await getValuation(sym);
          if (!result.valuation) {
            // 盤後估值（本益比/殖利率）暫缺時，用即時股價補一個近似物件，避免頁面空白
            try {
              const q = await getTWSEQuote(sym);
              result.valuation = {
                date: String((q as any).date || ""),
                dividendYield: 0,
                peRatio: 0,
                pbRatio: 0,
                fiscalYear: "",
                rawDate: String((q as any).date || ""),
                isRealtime: true,
                price: Number((q as any).currentPrice) || 0,
                volume: Number((q as any).volume) || 0,
              };
            } catch {
              /* 忽略 */
            }
          }
          try {
            const q = await getTWSEQuote(sym);
            result.name = (q as any).name || sym;
          } catch {
            result.name = sym;
          }
          try {
            const candles = await getTWSECandles(sym, 5);
            if (candles.length) {
              const last = candles[candles.length - 1];
              result.orderBook = estimateOrderBook(
                sym, Number(last.close), Number(last.open), Number(last.high), Number(last.low), Number(last.volume)
              );
              // 近 5 日走勢（技術面動能），籌碼暫缺時作為替代指標
              result.recentCandles = candles.map((c: any) => ({
                date: String(c.date),
                close: Number(c.close || 0),
                volume: Number(c.volume || 0),
              }));
            }
          } catch (e) {
            console.error("[Stock] getExtra orderBook failed:", (e as Error).message);
          }
          result.margin = await getMargin(sym);
          result.foreignTrade = await getForeignTrade(sym);
        } else {
          // 美股 / 港股：Yahoo Finance（免 key）
          try {
            const q = await getYahooQuote(input.symbol);
            result.name = q.name;
            result.valuation = await getYahooValuation(input.symbol);
            result.orderBook = estimateOrderBook(
              input.symbol, q.currentPrice, q.open, q.high, q.low, q.volume
            );
            result.fiftyTwoWeek = { high: q.fiftyTwoWeekHigh, low: q.fiftyTwoWeekLow };
            result.currency = q.currency;
          } catch (e) {
            console.error("[Stock] getExtra yahoo failed:", (e as Error).message);
          }
        }
      } catch (e) {
        console.error("[Stock] getExtra failed:", (e as Error).message);
      }
      return result;
    }),

  ping: publicProcedure.query(() => ({ ok: true, ts: Date.now() })),

  // 集保戶股權分散表（TDCC OpenAPI，週更；R2 快取 3 天，僅台股）
  getShareholding: publicProcedure
    .input(z.object({ symbol: z.string().min(1).max(10), forceRefresh: z.boolean().optional() }))
    .query(async ({ input }) => {
      const sym = cleanTaiwanSymbol(input.symbol);
      if (!isTaiwanMarket(inferMarket(input.symbol))) {
        return { data: null, fromCache: false, note: "股權分散表僅台股提供" };
      }
      const CACHE_TYPE = "tdcc";
      const TDCC_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 週更資料，快取 3 天
      try {
        if (!input.forceRefresh) {
          const cached = await getAnalysisCache(0, sym, CACHE_TYPE);
          if (cached) {
            const age = Date.now() - new Date(cached.createdAt.replace(" ", "T") + "Z").getTime();
            if (age < TDCC_TTL_MS) {
              return { data: JSON.parse(cached.result), fromCache: true };
            }
          }
        }
        const data = await fetchTdccShareholding(sym);
        if (data) {
          try {
            await saveAnalysisCache(0, sym, CACHE_TYPE, JSON.stringify(data));
          } catch (e) {
            console.error("[TDCC] cache save failed:", (e as Error).message);
          }
        }
        return { data, fromCache: false };
      } catch (e) {
        console.error("[TDCC] getShareholding failed:", (e as Error).message);
        // 抓取失敗時回退舊快取（即使過期）
        try {
          const stale = await getAnalysisCache(0, sym, CACHE_TYPE);
          if (stale) return { data: JSON.parse(stale.result), fromCache: true, stale: true };
        } catch { /* ignore */ }
        return { data: null, fromCache: false, error: `集保資料抓取失敗：${(e as Error).message}` };
      }
    }),

  // 我的庫存（手動輸入持股 + 即時損益）
  // 密碼保護：所有 holdings API 都要帶 password，與伺服器 PORTFOLIO_PASSWORD 比對。
  holdings: router({
    // 驗證密碼（前端進頁時先打這支）
    auth: publicProcedure
      .input(z.object({ password: z.string() }))
      .mutation(async ({ input }) => {
        return { ok: checkPortfolioPassword(input.password) };
      }),

    list: publicProcedure
      .input(z.object({ password: z.string() }))
      .query(async ({ input }) => {
        assertPortfolioPassword(input.password);
        const list = await getHoldings();
      // 為每筆持股抓即時報價算損益（單檔失敗不影響整體）
      const enriched = await Promise.all(
        list.map(async (h) => {
          let currentPrice: number | null = null;
          try {
            const mkt = inferMarket(h.symbol, h.market);
            if (isTaiwanMarket(mkt)) {
              const q = await getTWSEQuote(cleanTaiwanSymbol(h.symbol));
              currentPrice = Number(q.currentPrice) || null;
            } else {
              const q = await getYahooQuote(h.symbol);
              currentPrice = Number(q.currentPrice) || null;
            }
          } catch (e) {
            console.error(`[Holdings] quote failed for ${h.symbol}:`, (e as Error).message);
          }
          const cost = h.shares * h.avgCost;
          const marketValue = currentPrice != null ? h.shares * currentPrice : null;
          const pnl = marketValue != null ? marketValue - cost : null;
          const pnlPct = pnl != null && cost > 0 ? (pnl / cost) * 100 : null;
          return { ...h, currentPrice, cost, marketValue, pnl, pnlPct };
        })
      );
      return enriched;
    }),

    upsert: publicProcedure
      .input(
        z.object({
          password: z.string(),
          symbol: z.string().min(1).max(10),
          market: z.string().optional(),
          shares: z.number().positive(),
          avgCost: z.number().nonnegative(),
          note: z.string().max(100).optional(),
        })
      )
      .mutation(async ({ input }) => {
        assertPortfolioPassword(input.password);
        const market = inferMarket(input.symbol, input.market);
        return await upsertHolding(input.symbol, market, input.shares, input.avgCost, input.note);
      }),

    remove: publicProcedure
      .input(z.object({ password: z.string(), symbol: z.string().min(1).max(10) }))
      .mutation(async ({ input }) => {
        assertPortfolioPassword(input.password);
        await removeHolding(input.symbol);
        return { success: true };
      }),
  }),

  getIndustryIndices: publicProcedure
    .query(async () => {
      try {
        const data = await fetchIndustryIndices();
        return { count: data.length, data };
      } catch (e) {
        console.error("[Stock] getIndustryIndices failed:", (e as Error).message);
        return { count: 0, data: [] };
      }
    }),
});

export type AppRouter = typeof appRouter;
