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

## ⚠️ 目前的部屬型態：手動部署（wrangler pages deploy）

本專案目前是用 `wrangler pages project create` + `wrangler pages deploy` 建立的手動部署型專案
（專案名 `stock-tracker-dashboard`，帳號 kidson7911@gmail.com）。

**重點：直接 push git 不會自動部署。** 改完程式碼要更新線上，必須在本地跑：

```bash
npm run deploy          # = vite build && wrangler pages deploy dist/public
```

或拆開：

```bash
npm run build:cf        # 只產生前端 dist/public
wrangler pages deploy dist/public --project-name stock-tracker-dashboard
```

線上網址：`https://<hash>.stock-tracker-dashboard.pages.dev`（每次部署會換 hash subdomain；
自訂網域請在 Dashboard → Pages 專案 → Custom domains 設定）。

> 若之後想要「push git 自動部署」，可在 Dashboard 把專案連 Git（見下方「方式二」），
> 但注意：兩種模式擇一即可，混用會有重複部署。

---

## 首次部屬 / 重部步驟（手動模式）

前置需求：
- 已 `npm install`（或用 pnpm）
- 已登入 wrangler：`wrangler login`（OAuth，綁 kidson7911@gmail.com）
- **已啟用 R2**：Dashboard → R2 → Create bucket，綁定付款方式啟用（免費額度內不收費）
- **已建立 R2 bucket**，名稱須與 `wrangler.toml` 的 `bucket_name` 一致：

```bash
wrangler r2 bucket create stock-tracker-bucket
```

若報 `bucket name already exists`（全網唯一，被搶佔），換名如 `stock-tracker-bucket-kidson`，
並同步改 `wrangler.toml` 的 `bucket_name`（binding 名 `BUCKET` 不變，程式碼不用動）。

建立 Pages 專案（只需一次）：

```bash
wrangler pages project create stock-tracker-dashboard --production-branch=main
```

部署：

```bash
wrangler pages deploy dist/public --project-name stock-tracker-dashboard
```

> 報錯 `R2 bucket 'stock-tracker-bucket' not found` → 代表 bucket 還沒建，先跑上面的
> `wrangler r2 bucket create`。

---

## 環境變數 / Secret 設定

### 敏感值：用 secret（不要寫進 wrangler.toml）

```bash
wrangler pages secret put ROUTER_AI_API_KEY --project-name stock-tracker-dashboard
# 互動式貼上 key 值（例如 sk-or-v1-...）
```

目前已設定：
- `ROUTER_AI_API_KEY`（secret）：OpenRouter / Router AI key

沒設 AI key 也能開站，只是「AI 分析」功能會失敗，其餘（報價、自選、K 線）正常。

### 非敏感值：放在 wrangler.toml 的 `[vars]`

目前 `wrangler.toml` 設定：
```
[vars]
NODE_ENV = "production"
ROUTER_AI_BASE_URL = "https://openrouter.ai/api/v1"
ROUTER_AI_MODEL = "free"
```
改了 `[vars]` 要重新 `wrangler pages deploy` 才會生效。

### R2 綁定

`wrangler.toml` 已宣告：
```
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "stock-tracker-bucket"
```
`functions/api/[[route]].ts` 會讀 `context.env.BUCKET` 並呼叫 `setBucket()` 注入。
bucket 名稱必須存在於同帳號，否則 Functions 發佈失敗。

### Node 版本

若 build 報 `Vite 7 requires Node 20+`：Dashboard → Pages 專案 → Settings → Build →
Node.js version 設 20 或 22。

---

## 方式二：Git 連接部屬（替代方案，自動部署）

若想 push 即部署，可在 Dashboard 連 Git（本專案目前**未**使用此模式）：

Dashboard → Workers & Pages → 專案 → Settings → Build：
- **Build command**：`npm run build:cf`
- **Build output directory**：`dist/public`
- **Deploy command**：`echo "build output ready, Cloudflare auto-deploys"`
- **Root directory**：留空（= 倉庫根，package.json 在根）
- **Node.js version**：設 20 或 22

部屬前還要設：
- **R2 bucket** 先建立：`wrangler r2 bucket create stock-tracker-bucket`
- **綁定**：Settings → Functions → R2 Buckets → 加 `BUCKET` → `stock-tracker-bucket`
- **變數/secret**：Settings → Variables and Secrets → 加 `ROUTER_AI_API_KEY` 等

> 注意：Git 連接的 Pages 在 build 完會**自動上傳 `dist/public` + 自動啟用 `functions/`**，
> 不需要也不能用 `wrangler deploy` / `wrangler pages deploy`（會報
> `Missing entry-point` / `project does not exist` / `Unknown argument` 等錯）。
> Deploy command 設成 no-op（echo）即可，平台自己部屬。

---

## 本地開發 vs 部屬的資料層差異（重要）

- **Cloudflare 部屬**：走真正的 R2 binding（`functions/api/[[route]].ts` 呼叫 `setBucket(env.BUCKET)`）。
- **本地 / Vercel Node**：`server/local-r2.ts` 提供「檔案型 R2 相容 shim」
  （存在 `data/r2/`），由 `server/_core/index.ts` 與 `api/index.ts` 啟動時呼叫 `setupLocalBucket()`。
  ⚠️ `local-r2.ts` 依賴 `node:fs`，**絕不能**從 Workers / `functions/` 引入（否則把 fs 帶進 Workers bundle）。
- 本地（`pnpm dev`）與部屬（R2）資料不互通；部屬後需重新加入 watchlist。

---

## 資料結構（R2）

- `watchlist.json` — 陣列，每筆 `{ id, userId, symbol, market, addedAt, updatedAt }`
- `analysis/<id>.json` — 每筆分析快取 `{ id, userId, symbol, analysisType, result, createdAt }`

首次部屬後首頁會自動種入 5 檔預設台股（2330/2303/2454/2317/3008）。

---

## 已知限制

- `compatibility_flags = ["nodejs_compat"]` 已開，讓後端 `process.env` 相容；Functions 入口亦手動 polyfill。
- 籌碼（融資/三大法人）依賴證交所盤後報表，部分環境抓不到時顯示「近 5 日技術動能」替代。
- 本機機器若對特定 `*.pages.dev` / `*.supabase.co` hostname DNS 解析失敗（Non-existent domain），
  屬本機網路環境問題，不代表網站掛掉，請用其他網路確認。
