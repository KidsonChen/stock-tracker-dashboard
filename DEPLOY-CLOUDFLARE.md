# 部屬到 Cloudflare Pages + R2

本專案原為本地 DuckDB + Express 架構，已重構為可在 Cloudflare 運作的版本：
- 前端 → Cloudflare Pages（`vite build` → `dist/public`）
- 後端 API → Cloudflare Pages Functions（tRPC over fetch adapter）
- 資料儲存 → **Cloudflare R2**（取代本地 DuckDB，存 watchlist + analysis_cache 為 JSON 物件）

即時資料（證交所股價/籌碼、Google News 消息面）仍由後端即時抓取，不需資料庫。

> 說明：DuckDB 原生引擎（`.duckdb` 檔 + native binding）**無法**在 Cloudflare Workers 跑
> （Workers 是 V8 isolate，不能載原生二進制、也沒有可讀寫檔案系統）。
> 因此「DuckDB 部屬到 R2」的做法是：把原本存 DuckDB 的資料（watchlist / analysis_cache）
> 改存到 R2 bucket 的 JSON 物件，由 Workers 直接讀寫。資料確實位於 R2、可在部屬環境運作。

## 前置

```bash
npm install -g wrangler
wrangler login   # 瀏覽器登入 Cloudflare 帳號
```

## 1. 建立 R2 bucket

```bash
wrangler r2 bucket create stock-tracker-bucket
```

`wrangler.toml` 已設定 `[[r2_buckets]] binding = "BUCKET"`，Functions 透過 `env.BUCKET` 存取。

## 2. 設定環境變數 / Secret

敏感值用 secret（不進版控）：

```bash
wrangler secret put ROUTER_AI_API_KEY
wrangler secret put ROUTER_AI_BASE_URL
wrangler secret put ROUTER_AI_MODEL
```

非敏感值已放在 `wrangler.toml` 的 `[vars]`（NODE_ENV / ROUTER_AI_BASE_URL / ROUTER_AI_MODEL）。

## 3. 部屬

```bash
npm run deploy
# 等價於：vite build && wrangler pages deploy dist/public
```

部屬後在 Cloudflare Dashboard → Pages → 專案 → Settings → Functions → R2 Buckets
確認 `BUCKET` 已綁定到 `stock-tracker-bucket`。

## 4. 本地預覽（模擬 CF runtime）

```bash
npm run build:cf                              # 只 build 前端到 dist/public
wrangler pages dev dist/public --r2           # 啟用 local R2 模擬
# 開 http://localhost:8788 ，API 在 /api/trpc/*
```

> ⚠️ 已知：Windows 上 `wrangler pages dev --r2 --local` 的 R2 模擬器偶爾會崩
> （`RUNTIME WEBSOCKET ERROR` / `write EOF`）。這是 wrangler local R2 的環境問題，
> 不影響 production 部屬（真實 R2 bucket 穩定）。db-r2.ts 的讀寫邏輯已用 in-memory
> R2 mock 驗證通過（add / list / remove / saveAnalysisCache / getAnalysisById 皆正確）。

## 檔案清單（部屬相關）

- `wrangler.toml` — Pages + R2 bucket binding + nodejs_compat
- `server/db-r2.ts` — R2 資料層（watchlist / analysis_cache 存 JSON 於 bucket）
- `server/_core/context.ts` — 加 `createWorkerContext`（無 Express req/res）
- `server/_core/env.ts` — 相容 `process` 不存在的環境
- `functions/api/[[route]].ts` — Pages Functions 入口，接 tRPC fetch adapter + 注入 R2 binding
- `vite.config.ts` — 移除 Manus 專用插件，加 `base: "./"`
- `package.json` — 加 `build:cf` / `deploy` script

## 資料結構（R2）

- `watchlist.json` — 陣列，每筆 `{ id, userId, symbol, market, addedAt, updatedAt }`
- `analysis/<id>.json` — 每筆分析快取 `{ id, userId, symbol, analysisType, result, createdAt }`

## 已知限制

- 本地開發（`pnpm dev`，DuckDB 版）與部屬版（R2）資料不互通；部屬後需重新加入 watchlist。
- 籌碼（融資/三大法人）依賴證交所盤後報表，部分環境抓不到時顯示「近 5 日技術動能」替代。
- `compatibility_flags = ["nodejs_compat"]` 已開，讓後端 `process.env` 相容；Functions 入口亦手動 polyfill。
