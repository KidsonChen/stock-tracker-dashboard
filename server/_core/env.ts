// 相容 Node 與 Cloudflare Workers 的環境變數讀取。
// Workers runtime 沒有全域 process，故從 globalThis.process?.env 讀取，並提供空物件 fallback。
function getEnv(): Record<string, string | undefined> {
  const g = globalThis as any;
  if (g.process && g.process.env) return g.process.env as Record<string, string | undefined>;
  if (g.process && (g.process as any).env === undefined) return {};
  return (g as any).env ?? {};
}

const e = getEnv();

export const ENV = {
  appId: e.VITE_APP_ID ?? "",
  cookieSecret: e.JWT_SECRET ?? "",
  databaseUrl: e.DATABASE_URL ?? "",
  oAuthServerUrl: e.OAUTH_SERVER_URL ?? "",
  ownerOpenId: e.OWNER_OPEN_ID ?? "",
  isProduction: e.NODE_ENV === "production",
  forgeApiUrl: e.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: e.FORGE_API_KEY ?? "",
  supabaseUrl: e.SUPABASE_URL ?? e.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: e.SUPABASE_ANON_KEY ?? e.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  routerAiApiKey: e.ROUTER_AI_API_KEY ?? "",
  routerAiBaseUrl:
    (e.ROUTER_AI_BASE_URL ?? "").replace(/\/$/, "") ||
    "https://openrouter.ai/api/v1",
  routerAiModel: e.ROUTER_AI_MODEL ?? "openrouter/free",
};

export function isRouterAiConfigured(): boolean {
  return Boolean(ENV.routerAiApiKey && ENV.routerAiBaseUrl);
}
