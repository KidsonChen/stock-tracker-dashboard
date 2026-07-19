# 股市追蹤儀表板 (Stock Tracker Dashboard)

一個功能完整的股票追蹤儀表板，提供即時報價、互動式圖表、移動平均線（MA）技術分析，以及 AI 智慧串流分析功能。

介面參考: https://manus.im/app/pUk2KPAxw3STDfEOrYPgnd

## ✨ 功能特色

- **📊 即時報價**：追蹤股票最新價格、漲跌幅度與成交量（台股走 TWSE 即時 API）
- **📈 互動式圖表**：支援折線圖與 K 線圖，切換不同時間週期 (1D/1W/1M/3M/1Y)
- **📉 移動平均線**：自訂顯示 5/10/20/50/200 日均線，並標注黃金/死亡交叉信號
- **🤖 AI 智慧分析**：串流式股票分析報告（技術面 + 基本面），可透過 Router AI / OpenRouter 選擇不同模型
- **🌙 深色模式**：黑色科技感主題，支援淺色/深色切換
- **📱 響應式設計**：完美支援桌面與行動裝置
- **🗄 零配置資料庫**：預設使用本地 DuckDB 檔案（`data/stock.db`），免伺服器、免 API key

## 🛠 技術架構

| 類別 | 技術選型 |
|------|----------|
| **前端框架** | React 19 + TypeScript |
| **建構工具** | Vite 7 |
| **UI 元件庫** | Radix UI + Tailwind CSS |
| **圖表繪製** | Recharts |
| **API 層** | tRPC（Express adapter） |
| **狀態管理** | TanStack React Query |
| **後端框架** | Node.js + Express |
| **資料庫（預設）** | DuckDB（本地內嵌，檔案 `data/stock.db`） |
| **資料庫（舊版）** | Supabase (PostgreSQL) — 保留 `supabase/seed.sql` 供參考 |
| **AI 分析** | Router AI（`routerai.net`），回退 OpenRouter / Forge，多模型串流 |
| **股票資料** | 台灣證券交易所 TWSE 即時 API（主）；Finnhub / FinMind 客戶端保留備用 |
| **雲端部署** | Vercel（serverless，已附 `vercel.json`） |

## 📁 專案結構

```
stock-tracker-dashboard/
├── api/
│   └── index.ts            # Vercel serverless 入口（Express + tRPC + 靜態檔）
├── client/                 # React 前端應用
│   ├── index.html
│   ├── public/             # 靜態資源
│   └── src/
│       ├── components/     # React 元件
│       │   ├── StockChart.tsx        # 股價圖表（K 線/折線 + MA）
│       │   ├── StreamingAnalysis.tsx # AI 串流分析
│       │   ├── AIAnalysisStream.tsx  # AI 分析串流渲染
│       │   ├── DashboardLayout.tsx   # 主佈局（可隱藏側欄）
│       │   └── ui/                   # UI 元件庫
│       ├── hooks/          # 自訂 Hooks（useStockData 等）
│       ├── lib/            # 工具函式庫
│       │   ├── ma-calculator.ts      # 均線計算器
│       │   └── trpc.ts                # tRPC client
│       ├── contexts/       # React Context（ThemeContext）
│       ├── pages/          # 頁面元件（Home / ComponentShowcase / NotFound）
│       ├── App.tsx
│       └── main.tsx
├── server/                 # 伺服器邏輯
│   ├── _core/              # 核心設定
│   │   ├── index.ts        # 自托管 / 開發入口（Vite 熱更新或靜態檔）
│   │   ├── context.ts      # tRPC Context
│   │   ├── env.ts          # 環境變數讀取
│   │   ├── llm.ts          # AI 後端（Router AI / OpenRouter / Forge）
│   │   └── trpc.ts         # tRPC 初始化
│   ├── routers.ts          # tRPC 路由定義（watchlist / quote / candles / analysis）
│   ├── db-duckdb.ts        # 本地 DuckDB 資料層（目前預設使用）
│   ├── db.ts               # 舊版 Supabase 資料層（保留相容）
│   ├── twse-live.ts        # TWSE 即時報價 / K 線
│   ├── finnhub.ts          # Finnhub API 整合（備用）
│   ├── finmind.ts          # FinMind API 整合（備用）
│   ├── llm-stream.ts       # AI 串流分析
│   ├── ma-analysis.ts      # 均線分析邏輯
│   └── *.test.ts           # vitest 單元測試
├── shared/                 # 前後端共用型別與常數
├── supabase/
│   └── seed.sql            # 舊版 Supabase 資料庫結構（參考用）
├── references/             # 各項整合筆記（llm / maps / storage 等）
├── data/                   # DuckDB 執行期資料（stock.db，gitignore）
├── drizzle/                # 舊版 Drizzle schema / migrations
├── vercel.json             # Vercel 部署設定
├── DEPLOY.md               # Vercel 部署步驟
├── .env.example            # 環境變數範本
└── package.json            # 專案依賴與指令
```

## 🚀 快速開始

### 前置需求

- Node.js 22+
- pnpm（建議）或 npm/yarn
- **（選用）** AI 分析需要 API key：Router AI / OpenRouter / Forge 任一個
  - 若未設定，儀表板的報價、圖表、均線功能仍可正常使用，僅 AI 分析會停用

### 安裝步驟

1. **Clone 專案**
   ```bash
   git clone https://github.com/your-username/stock-tracker-dashboard.git
   cd stock-tracker-dashboard
   ```

2. **安裝依賴**
   ```bash
   pnpm install
   ```

3. **環境設定**
   ```bash
   cp .env.example .env
   ```
   預設情況下**不需**任何 key 即可啟動（資料庫用本地 DuckDB）。
   若要啟用 AI 分析，至少在 `.env` 填入 `ROUTER_AI_API_KEY`。

4. **啟動開發伺服器**
   ```bash
   pnpm dev
   ```
   伺服器會自動尋找可用 port（預設從 `3000` 起），並在終端機印出實際網址。

5. **開啟瀏覽器**
   ```
   http://localhost:3000   （或終端機顯示的實際 port）
   ```

### 建構生產版本

```bash
pnpm build      # vite build 前端 + esbuild bundle 後端到 dist/
pnpm start      # 以 production 模式啟動（NODE_ENV=production，提供 dist/public 靜態檔）
```

## 🔧 環境變數

複製自 `.env.example`，可依需求調整：

| 變數 | 說明 | 預設 |
|------|------|------|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | 舊版 Supabase 後端（目前預設未使用） | — |
| `ROUTER_AI_API_KEY` | Router AI / OpenRouter / Forge 的 API key（啟用 AI 分析必填） | — |
| `ROUTER_AI_BASE_URL` | AI 後端基礎網址 | `https://openrouter.ai/api/v1` |
| `ROUTER_AI_MODEL` | 指定的 AI 模型 | `openrouter/auto` |
| `FORGE_API_KEY` / `FORGE_API_URL` | 舊版 Manus/Forge 後端（選用回退） | — |
| `NODE_ENV` | `development` / `production` | `production` |
| `PORT` | 伺服器偏好 port（佔用時自動往後找） | `3000` |

> AI 後端優先順序（`server/_core/llm.ts`）：`ROUTER_AI_BASE_URL` → `FORGE_API_URL` → `https://openrouter.ai/api/v1`。

## 🗄 資料庫

- **預設：本地 DuckDB**（`server/db-duckdb.ts`）
  - 單一檔案嵌入式資料庫，路徑 `data/stock.db`（不存在會自動建表）。
  - 零伺服器、零 API key，最適合本地開發與自托管。
  - 儲存三張表：`watchlist`、`stock_data`、`analysis_cache`。
- **舊版：Supabase**（`server/db.ts` + `supabase/seed.sql`）
  - 早期版本使用 Supabase PostgreSQL，現已改為 DuckDB；`supabase/seed.sql` 保留供參考與自行架設 Supabase 時使用。
  - 若要切回 Supabase，需將 `server/routers.ts` 的 import 由 `./db-duckdb` 改回 `./db` 並設定 `SUPABASE_URL` / `SUPABASE_ANON_KEY`。

## 📈 股票資料來源

- **台股即時報價（主路徑）**：`server/twse-live.ts` 的 `getTWSEQuote` 串接台灣證券交易所 `STOCK_DAY` 公開 API，取得最新收/開/高/低價。
- **台股歷史 K 線（主路徑）**：`server/twse-live.ts` 的 `getTWSECandles` 走 **FinMind** `TaiwanStockPrice`（免認證、支援任意日期區間），供 1M / 3M / 1Y 圖表使用。`server/finmind.ts` 亦提供同功能客戶端。
- **美股 / 其他（備用客戶端）**：`server/finnhub.ts` 已整合，可依需求在 `server/routers.ts` 中切換。
- 取得的資料會快取進 DuckDB（`stock_data` 表，預設 24 小時過期）以降低外部 API 呼叫。

> ⚠️ **證交所 `STOCK_DAY` 行為坑（已踩過）**：TWSE 的 `STOCK_DAY?date=YYYYMM` 現在對**任意月份**都只回傳「當月」資料（實測 `202301`/`202407`/`202501` 全部回 `115年07月`），無法取得真實歷史。因此歷史日線改由 FinMind 提供；若 FinMind 失敗，`getTWSECandles` 會 fallback 回證交所當月資料（僅足夠 1M 以內顯示）。不要再把歷史 K 線來源切回證交所 `STOCK_DAY`。

## 🤖 AI 分析

- 後端：`server/_core/llm.ts` 統一呼叫 OpenAI 相容介面，串流回傳。
- 報告由 `server/llm-stream.ts` 產生（技術面 + 基本面），前端 `StreamingAnalysis.tsx` / `AIAnalysisStream.tsx` 逐步渲染。
- 分析結果快取於 `analysis_cache` 表，可重新生成。

## ☁️ 部署（Vercel）

`vercel.json` 已設定路由：`/api/*` 導向 `api/index.ts`，其餘導向 `dist/public` 靜態檔。

```bash
# 1. 建構
pnpm build

# 2. 登入並部署
npx vercel login
npx vercel
```

詳細步驟見 [DEPLOY.md](DEPLOY.md)。部署前請在 Vercel 專案環境變數中設定 `ROUTER_AI_API_KEY` 等。

## 📖 使用說明

### 新增股票
1. 在左側側邊欄的輸入框輸入股票代號（如 `2330`）
2. 按下 `+` 按鈕或 Enter 鍵
3. 股票即會加入追蹤清單（存入 DuckDB）

### 圖表操作
- **時間週期**：點擊 1D/1W/1M/3M/1Y 切換不同週期
- **圖表類型**：切換折線圖或 K 線圖
- **均線顯示**：點擊 MA 按鈕顯示/隱藏 5/10/20/50/200 日均線

### AI 分析
選擇股票後，下方會顯示 AI 生成的股票分析報告，透過串流方式即時呈現。

## 🔧 可用指令

| 指令 | 說明 |
|------|------|
| `pnpm dev` | 啟動開發伺服器（Vite HMR + 自動找 port） |
| `pnpm build` | 建構生產版本（前端 + 後端 bundle） |
| `pnpm start` | 啟動生產伺服器 |
| `pnpm check` | 執行 TypeScript 類型檢查 |
| `pnpm format` | Prettier 格式化程式碼 |
| `pnpm test` | 執行 vitest 單元測試 |
| `pnpm db:push` | 舊版 Drizzle 結構同步（Supabase 用） |

## 📦 主要依賴

- **react / react-dom** (19) - 前端框架
- **@radix-ui/react-*** - 無樣式可存取性元件
- **@tanstack/react-query** - 伺服器狀態管理
- **@trpc/server / @trpc/client** - 型別安全 API
- **recharts** - 圖表繪製
- **express** - 後端框架
- **duckdb** - 本地內嵌資料庫
- **@supabase/supabase-js** - 舊版 PostgreSQL 客戶端（保留）
- **drizzle-orm** - 舊版 ORM（保留）
- **tailwindcss** - 樣式
- **vite / vitest** - 建構與測試

## ⚠️ 已知問題與限制

### 1. 僅支援台股（TWSE），不含美股 / 港股
- `server/twse-live.ts` 的 `getTWSEQuote` / `getTWSECandles` 只串接台灣證交所 API。
- 若 watchlist 加入美股代號（如 `AAPL`），會報錯：
  `Error: TWSE 無 AAPL 資料`（quote）或 `TRPCError: 無法取得 AAPL 歷史資料`（history, code: NOT_FOUND）。
- 美股客戶端 `server/finnhub.ts` 已整合但**未在 `server/routers.ts` 啟用**；如需美股，要改成依市場別路由（TW→twse-live，US→finnhub）。

### 2. 股票路由需要登入 Session
- 報價 / 歷史 / 分析路由受 Auth 保護，未登入會出現 `[Auth] Missing session cookie`，
  前端需先通過 OAuth 登入（見 `.env` 的 `OAUTH_SERVER_URL`）。
- 本機開發若未配置 OAuth，server 仍可啟動，但股票 API 會被擋（需在請求帶 session cookie）。

### 3. DuckDB 原生 binding（開發環境已修復）
- `duckdb@1.4.4` 的原生 binary（`.node`）在 Windows + pnpm 10 下初次 `pnpm install` 可能沒裝上
  （node-pre-gyp 的 postinstall 遠端下載失敗，僅見 `binding/` 目錄但無 `.node`）。
- 修復指令：
  ```bash
  node node_modules/duckdb/node_modules/node-pre-gyp/bin/www install
  # 或
  pnpm rebuild duckdb
  ```
- `server/db-duckdb.ts` 已改寫為 duckdb 1.4.4 的 **callback / async API**
  （原專案寫法為 sqlite 同步風格 `prepare().all()`，與 duckdb 的 `prepare().all(cb)` 不相容，會報
  `does not provide an export named 'Database'` / `prepare is not a function`）。

### 4. 證交所歷史日線限制
- `STOCK_DAY?date=YYYYMM` 對任意月份僅回傳「當月」資料，無法取得真實歷史；
  歷史 K 線改由 FinMind `TaiwanStockPrice` 提供（免認證），失敗時 fallback 回當月。

### 5. 啟動腳本（Windows / MSYS 注意）
- `pnpm dev` 預設 `NODE_ENV=development tsx watch server/_core/index.ts`，
  在 MSYS/git-bash 下可能因 `no job control` 報錯。
- 可改用：`node --import tsx server/_core/index.ts`（已驗證可成功啟動並印出 `Server running on`）。

## 🤝 貢獻指南

歡迎提交 Issue 或 Pull Request！

1. Fork 本專案
2. 建立功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交變更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

## 📄 授權

本專案採用 MIT License - 詳見 [LICENSE](LICENSE) 檔案。

## 🙏 致謝

- [台灣證券交易所 (TWSE)](https://www.twse.com.tw/) - 台股即時資料 API
- [Finnhub](https://finnhub.io/) / [FinMind](https://finmind.github.io/) - 備用股票資料 API
- [OpenRouter](https://openrouter.ai/) / Router AI - AI 分析能力
- [Supabase](https://supabase.com/) - 舊版資料庫參考
- [Radix UI](https://www.radix-ui.com/) - UI 元件庫
