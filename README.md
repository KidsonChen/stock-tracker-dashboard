# 股市追蹤儀表板 (Stock Tracker Dashboard)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一個功能完整的股票追蹤儀表板，提供即時報價、互動式圖表、移動平均線分析，以及 AI 智慧分析功能。

![儀表板預覽](https://via.placeholder.com/800x400?text=Stock+Tracker+Dashboard)

## ✨ 功能特色

- **📊 即時報價**：追蹤股票最新價格、漲跌幅度與成交量
- **📈 互動式圖表**：支援折線圖與 K 線圖，切換不同時間週期 (1D/1W/1M/3M/1Y)
- **📉 移動平均線**：自訂顯示 5/10/20/50/200 日均線
- **🤖 AI 智慧分析**：串流式股票分析報告，結合 OpenAI 技術
- **🔐 OAuth 登入**：安全的第三方認證機制
- **🌙 深色模式**：支援淺色/深色主題切換
- **📱 響應式設計**：完美支援桌面與行動裝置

## 🛠 技術架構

| 類別 | 技術選型 |
|------|----------|
| **前端框架** | React 19 + TypeScript |
| **建構工具** | Vite |
| **UI 元件庫** | Radix UI + Tailwind CSS |
| **圖表繪製** | Recharts |
| **API 層** | tRPC |
| **狀態管理** | TanStack React Query |
| **後端框架** | Express.js |
| **資料庫** | MySQL + Drizzle ORM |
| **AI 分析** | OpenAI GPT-4 |
| **股票資料** | Finnhub + FinMind/TWSE |
| **雲端部署** | Supabase + Vercel |

## 📁 專案結構

```
stock-tracker-dashboard/
├── api/                    # Express 伺服器入口
│   └── index.ts            # API 路由配置
├── client/                 # React 前端應用
│   ├── public/             # 靜態資源
│   └── src/
│       ├── components/     # React 元件
│       │   ├── StockChart.tsx       # 股價圖表
│       │   ├── StreamingAnalysis.tsx # AI 分析元件
│       │   └── ui/                  # UI 元件庫
│       ├── hooks/          # 自訂 Hooks
│       │   └── useStockData.ts      # 股票資料 hook
│       ├── lib/            # 工具函式庫
│       │   └── ma-calculator.ts     # 均線計算器
│       ├── pages/          # 頁面元件
│       │   └── Home.tsx             # 主頁面
│       └── contexts/       # React Context
├── server/                 # 伺服器邏輯
│   ├── _core/              # 核心設定
│   │   ├── context.ts      # tRPC Context
│   │   └── db.ts           # 資料庫連線
│   ├── routers.ts          # tRPC 路由定義
│   ├── finnhub.ts          # Finnhub API 整合
│   ├── twse.ts             # 台灣證券交易所 API
│   ├── llm-stream.ts       # AI 串流分析
│   └── ma-analysis.ts      # 均線分析邏輯
├── supabase/               # Supabase 設定
│   ├── schema.sql          # 資料庫結構
│   └── seed.sql            # 初始資料
└── package.json            # 專案依賴配置
```

## 🚀 快速開始

### 前置需求

- Node.js 22+
- pnpm (建議) 或 npm/yarn
- MySQL 資料庫
- [Finnhub API Key](https://finnhub.io/)
- [OpenAI API Key](https://platform.openai.com/)

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
   
   複製環境變數範本並填入您的 API Keys：
   ```bash
   cp .env.example .env
   ```
   
   必要環境變數：
   ```env
   # 資料庫
   DATABASE_URL=mysql://user:password@localhost:3306/stock_tracker
   
   # Finnhub API
   FINNHUB_API_KEY=your_finnhub_api_key
   
   # OpenAI
   OPENAI_API_KEY=your_openai_api_key
   
   # OAuth (可選)
   VITE_OAUTH_PORTAL_URL=https://your-oauth-portal.com
   VITE_APP_ID=your_app_id
   ```

4. **資料庫設定**
   
   建立 Supabase 專案並執行 SQL：
   ```bash
   # 在 Supabase SQL Editor 中執行
   supabase/seed.sql
   ```

5. **啟動開發伺服器**
   ```bash
   pnpm dev
   ```

6. **開啟瀏覽器**
   ```
   http://localhost:5173
   ```

### 建構生產版本

```bash
pnpm build
pnpm start
```

## 📖 使用說明

### 新增股票

1. 在左側側邊欄的輸入框輸入股票代號
2. 按下 `+` 按鈕或 Enter 鍵
3. 股票即會加入追蹤清單

### 圖表操作

- **時間週期**：點擊 1D/1W/1M/3M/1Y 切換不同週期
- **圖表類型**：切換折線圖或 K 線圖
- **均線顯示**：點擊 MA 按鈕顯示/隱藏均線

### AI 分析

選擇股票後，下方會顯示 AI 生成的股票分析報告，透過串流方式即時呈現。

## 🔧 可用指令

| 指令 | 說明 |
|------|------|
| `pnpm dev` | 啟動開發伺服器 |
| `pnpm build` | 建構生產版本 |
| `pnpm start` | 啟動生產伺服器 |
| `pnpm check` | 執行 TypeScript 檢查 |
| `pnpm format` | 格式化程式碼 |
| `pnpm test` | 執行測試 |
| `pnpm db:push` | 同步資料庫結構 |

## 📦 主要依賴

- **@radix-ui/react-*** - 無樣式可存取性元件
- **@tanstack/react-query** - 伺服器狀態管理
- **@trpc/server/client** - 型別安全 API
- **recharts** - 圖表繪製
- **framer-motion** - 動畫效果
- **lucide-react** - 圖示庫
- **drizzle-orm** - ORM 資料庫操作
- **express** - 後端框架
- **openai** - OpenAI API 整合

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

- [Finnhub](https://finnhub.io/) - 股票資料 API
- [OpenAI](https://openai.com/) - AI 分析能力
- [Supabase](https://supabase.com/) - 資料庫與部署平台
- [Radix UI](https://www.radix-ui.com/) - UI 元件庫