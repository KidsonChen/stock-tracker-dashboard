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

  // 動態 import（確保 polyfill 先完成）
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
