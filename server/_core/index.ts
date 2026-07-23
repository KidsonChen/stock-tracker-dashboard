import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import fs from "fs";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { setupLocalBucket } from "../local-r2";

// ─────────────────────────────────────────────────────────────────────────
// 單例防護：本專案使用嵌入式檔案資料庫 (DuckDB, data/stock.db)。
// 同一個 db 檔絕對不能同時被多個 process 開啟，否則會觸發
// duckdb 1.4.4 的 "unique_ptr is NULL" 檔案損毀 + EBUSY 鎖定。
// 因此這裡做兩道防線：
//   1) 預設 port 被佔 → fail-fast，直接報錯退出（不再偷偷換 port）。
//   2) 寫一個 PID lock 檔 (DATA_DIR/.server.lock)，紀錄持有者 pid；
//      啟動前若發現 lock 且該 pid 仍活著，直接退出，避免任何路徑下的
//      多實例併發。
// ─────────────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data");
const LOCK_PATH = path.join(DATA_DIR, ".server.lock");
const PREFERRED_PORT = parseInt(process.env.PORT || "3001");

function readLock(): { pid: number; port: number; ts: number } | null {
  try {
    const raw = fs.readFileSync(LOCK_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    // signal 0: 不發信號，只檢查 process 是否存在
    process.kill(pid, 0);
    return true;
  } catch {
    return false; // ESRCH (不存在) 或 EPERM (存在但無權) — 都視為不可接管
  }
}

function acquireLock(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const existing = readLock();
  if (existing && isProcessAlive(existing.pid) && existing.pid !== process.pid) {
    console.error(
      `[LOCK] 另一個 server 實例已在執行 (PID ${existing.pid}, port ${existing.port})。` +
        `\n       本專案使用 DuckDB 單一檔案資料庫，禁止多實例並發。` +
        `\n       若確定舊實例已死，請刪除鎖檔： rm "${LOCK_PATH}"  或結束該 PID。`
    );
    process.exit(1);
  }
  fs.writeFileSync(
    LOCK_PATH,
    JSON.stringify({ pid: process.pid, port: PREFERRED_PORT, ts: Date.now() })
  );
}

function releaseLock(): void {
  try {
    const cur = readLock();
    if (cur && cur.pid === process.pid) fs.unlinkSync(LOCK_PATH);
  } catch {
    // ignore
  }
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("close", () => resolve(true));
    srv.listen(port, () => srv.close());
  });
}

async function startServer() {
  // 本地 R2 相容層（檔案系統）：讓 db-r2 在沒有 Cloudflare R2 binding 的
  // 本地 / Vercel Node 環境也能運作（儲存於 data/r2/）。
  // Cloudflare Pages Functions 部署會走真正的 R2 binding，不受影響。
  setupLocalBucket();

  // 防線 1：鎖檔
  acquireLock();

  // 防線 2：port 被佔 → 直接退出（不再自動換 port）
  if (!(await isPortAvailable(PREFERRED_PORT))) {
    console.error(
      `[PORT] Port ${PREFERRED_PORT} 已被佔用（可能是一個仍在跑的舊 server 實例）。` +
        `\n       請先結束佔用 ${PREFERRED_PORT} 的 process，再重新啟動。` +
        `\n       本專案使用 DuckDB 檔案資料庫，禁止為了繞開衝突而自動換 port。` +
        `\n       若確定是殭屍實例，可用： MSYS_NO_PATHCONV=1 taskkill /F /PID <pid>`
    );
    releaseLock();
    process.exit(1);
  }

  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  server.listen(PREFERRED_PORT, () => {
    console.log(`Server running on http://localhost:${PREFERRED_PORT}/`);
  });

  const cleanup = () => {
    releaseLock();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", releaseLock);
}

startServer().catch((e) => {
  console.error("[FATAL] server failed to start:", e);
  releaseLock();
  process.exit(1);
});
