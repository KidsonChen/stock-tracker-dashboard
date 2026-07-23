# 部屬到 Cloudflare Pages + R2

本專案原為本地 DuckDB + Express 架構，已重構為可在 Cloudflare 運作的版本：
- 前端 → Cloudflare Pages（`vite build` → `dist/public`）
- 後端 API → Cloudflare Pages Functions（tRPC over fetch adapter，位於 `functions/api/[[route]].ts`）
- 資料儲存 → **Cloudflare R2**（watchlist + analysis_cache 存 JSON 物件）

即時資料（證交所股價/籌碼、Google News 消息面）仍由後端即時抓取，不需資料庫。

> 說明：DuckDB 原生引擎（`.duckdb` 檔 + native binding）**無法**在 Cloudflare Workers 跑
> （Workers 是 V8 isolate，不能載原生二進制、也沒有可讀寫檔案系統）。
> 因此「DuckDB 部屬到 R2」的做法是：把原本存 DuckDB 的資料（watchlist / analysis_cache）
> 改存到 R2 bucket 的 JSON 物件，由 Workers 直接讀寫。資料確實位於 R2、可在部屬環境運作。

---

## 方式一：Git 連接部屬（Cloudflare Dashboard 自動 build+deploy）← 推薦

連接 GitHub 倉庫後，在 **Dashboard → Workers & Pages → 專案 → Settings → Build** 設定：

- **Build command**：`npm run build:cf`
  （= `vite build`，只產 `dist/public`。**不要**用 `pnpm run build`，它會額外 build 沒用的 node server）
- **Build output directory**：`dist/public`
- **Deploy command**：`echo "build output ready, Cloudflare auto-deploys"`
  ⚠️ **重要**：Git 連接的 Pages 在 build 完會**自動上傳 `dist/public` + 自動啟用 `functions/`**，
  不需要也不能用 `wrangler deploy` / `wrangler pages deploy`（會報
  `Missing entry-point` / `project does not exist` / `Unknown argument` 等錯）。
  Deploy command 設成 no-op（echo）即可，平台自己部屬。

部屬前還要設：
- **R2 bucket** 先建立：Dashboard → R2 → Create bucket → 名稱 `stock-tracker-bucket`
  （或本地 `wrangler r2 bucket create stock-tracker-bucket`）
- **綁定**：Settings → Functions → R2 Buckets → 加 `BUCKET` → `stock-tracker-bucket`
- **變數/secret**：Settings → Variables and Secrets → 加 `ROUTER_AI_API_KEY` 等
  （AI key 用 secret；非敏感可放 `wrangler.toml` 的 `[vars]`）

改完點 **Retry deployment** 或再 push 一次即上線。網址：`https://<project>.pages.dev`

---

## 方式二：手動 `wrangler pages deploy`

```bash
wrangler login
wrangler r2 bucket create stock-tracker-bucket
wrangler secret put ROUTER_AI_API_KEY
npm run deploy          # = vite build && wrangler pages deploy dist/public
```

> 注意：手動部屬要用 `wrangler pages deploy`（有 `pages`），不是 `wrangler deploy`。



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
