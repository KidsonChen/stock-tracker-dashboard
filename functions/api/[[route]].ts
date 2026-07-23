/// <reference types="@cloudflare/workers-types" />

// 重要：Cloudflare Workers runtime 預設沒有全域 process。
// 必須在任何 server module（env.ts 等）載入「之前」先 polyfill process.env，
// 否則 module-load 時讀 process.env 會拋 "process is not defined"。
// 因此本檔不用靜態 import appRouter，改在 onRequest 裡動態 import（polyfill 之後）。

function ensureProcessEnv(env: Record<string, any>): void {
  const g = globalThis as any;
  if (!g.process) g.process = {} as any;
  if (!g.process.env) g.process.env = {} as Record<string, string>;
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && g.process.env[k] === undefined) {
      g.process.env[k] = v;
    }
  }
  if (g.process.env.NODE_ENV === undefined) g.process.env.NODE_ENV = "production";
}

export async function onRequest(context: {
  request: Request;
  env: Record<string, any>;
  params: Record<string, string>;
}): Promise<Response> {
  ensureProcessEnv(context.env);

  const url = new URL(context.request.url);

  // ── SSE 串流分析：繞開 tRPC fetch adapter 不支援 generator 的限制 ──
  // Cloudflare Workers 對 generator 回傳值會拋 "Failed to convert value to 'Response'"，
  // 因此這條路徑自行用 ReadableStream 回傳 text/event-stream（標準 Response，完全支援）。
  if (url.pathname === "/api/analysis-stream" && context.request.method === "POST") {
    return handleAnalysisStream(context);
  }

  // 其餘走 tRPC
  const { fetchRequestHandler } = await import("@trpc/server/adapters/fetch");
  const { appRouter } = await import("../../server/routers");
  const { setBucket } = await import("../../server/db-r2");
  const { createWorkerContext } = await import("../../server/_core/context");

  if (context.env.BUCKET) setBucket(context.env.BUCKET);

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: context.request,
    router: appRouter,
    createContext: createWorkerContext,
    onError({ error, path }) {
      console.error(`[tRPC] ${path ?? "<no-path>"} error:`, error.message);
    },
  });
}

// SSE 串流處理：讀取 {symbol, market, forceRefresh}，逐 chunk 推送 analysis
async function handleAnalysisStream(context: {
  request: Request;
  env: Record<string, any>;
}): Promise<Response> {
  ensureProcessEnv(context.env);
  if (context.env.BUCKET) {
    const { setBucket } = await import("../../server/db-r2");
    setBucket(context.env.BUCKET);
  }

  let body: any = {};
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }
  const { symbol, market, forceRefresh } = body as {
    symbol?: string;
    market?: string;
    forceRefresh?: boolean;
  };

  if (!symbol) {
    return new Response(JSON.stringify({ error: "symbol required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
        );
      };
      try {
        const { streamDetailedAnalysis } = await import("../../server/llm-stream");
        // 快取檢查
        const { getAnalysisCache } = await import("../../server/db-r2");
        const marketLabel =
          market === "US" ? "美股" : market === "HK" ? "港股" : "台股";
        if (!forceRefresh) {
          const cached = await getAnalysisCache(0, `${symbol}:${marketLabel}`, "detailed");
          if (cached) {
            send({ type: "cached", content: cached.result });
            send({ type: "complete" });
            controller.close();
            return;
          }
        }

        // 準備報價/籌碼（簡化：直接呼叫 generator，它內部自己抓）
        let fullReport = "";
        for await (const chunk of streamDetailedAnalysis(
          symbol,
          0,
          0,
          0,
          undefined,
          undefined,
          marketLabel
        )) {
          send(chunk);
          if (chunk.type === "text" && chunk.content) fullReport += chunk.content;
        }

        // 落快取
        if (fullReport) {
          const { saveAnalysisCache } = await import("../../server/db-r2");
          await saveAnalysisCache(0, `${symbol}:${marketLabel}`, "detailed", fullReport).catch(
            () => {}
          );
        }
        send({ type: "complete" });
      } catch (err) {
        send({
          type: "error",
          message: `分析失敗: ${err instanceof Error ? err.message : "未知錯誤"}`,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
