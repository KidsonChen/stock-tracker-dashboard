# Vercel Deploy Checklist
1. 在 Supabase SQL Editor 執行 `supabase/seed.sql`，建立:
   - `watchlist`
   - `stock_data`
   - `analysis_cache`
2. 確認 `.env` 已有:
   - `SUPABASE_URL=https://vooagoifysyqfqhmkxcs.supabase.co`
   - `SUPABASE_ANON_KEY=<SECRET_5b437d0b>`
   - `ROUTER_AI_API_KEY`
   - `ROUTER_AI_BASE_URL=https://routerai.net/api/v1`
   - `ROUTER_AI_MODEL=openrouter/free`
3. 在 terminal 登入 Vercel:
   ```bash
   npx vercel login
   ```
4. 部署:
   ```bash
   npx vercel
   ```
