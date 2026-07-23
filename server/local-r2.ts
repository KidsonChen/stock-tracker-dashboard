import * as fs from "node:fs";
import * as path from "node:path";
import { setBucket } from "./db-r2";

// 本地開發 / Node / Vercel Node 用的「R2 相容」檔案層。
// 把 db-r2 期望的 R2Bucket 介面用本機檔案系統實作，讓本地 server
// （dist/index.js / pnpm dev / api/index.ts）能直接複用 db-r2 程式碼，
// 而不需在本地也開一個 Cloudflare R2 bucket。
//
// 重要：本檔依賴 node:fs，只能用於 Node 環境，
// 絕不能從 Workers / functions/api/[[route]].ts 引入（否則會把 node:fs 帶進 Workers bundle）。
// Cloudflare 部署走真正的 R2 binding（functions 入口呼叫 setBucket(env.BUCKET)），不會用到這裡。

type R2Value = string | ArrayBuffer | ReadableStream | Blob;

interface _R2ObjectBody {
  key: string;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}

interface _R2Bucket {
  put(key: string, value: R2Value): Promise<unknown>;
  get(key: string): Promise<_R2ObjectBody | null>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ objects: { key: string }[]; truncated: boolean }>;
}

/**
 * 建立一個以資料夾為底的 R2 相容 bucket。
 * key 中的 "/" 會映射成子目錄（如 "analysis/abc.json" → <root>/analysis/abc.json）。
 */
export function createLocalR2Bucket(rootDir: string): _R2Bucket {
  fs.mkdirSync(rootDir, { recursive: true });

  // 只保留安全字元，避免路徑穿越 / 非法檔名
  const safeKey = (k: string) => k.replace(/[^a-zA-Z0-9._\-/]/g, "_");
  const full = (k: string) => path.join(rootDir, safeKey(k));

  const toText = (value: R2Value): string => {
    if (typeof value === "string") return value;
    if (value instanceof Blob) return ""; // 本地實作不處理 Blob 內容（本專案只寫字串 JSON）
    if (value instanceof ArrayBuffer) return Buffer.from(value).toString("utf8");
    return String(value);
  };

  return {
    async put(key, value) {
      const fp = full(key);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, toText(value), "utf8");
    },
    async get(key) {
      const fp = full(key);
      if (!fs.existsSync(fp)) return null;
      const text = () => Promise.resolve(fs.readFileSync(fp, "utf8"));
      return {
        key,
        text,
        json: async <T>() => JSON.parse(await text()) as T,
      };
    },
    async delete(key) {
      const fp = full(key);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    },
    async list(opts) {
      const prefix = opts?.prefix ?? "";
      const walk = (dir: string): string[] => {
        if (!fs.existsSync(dir)) return [];
        const out: string[] = [];
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) out.push(...walk(p));
          else out.push(p);
        }
        return out;
      };
      const objects = walk(rootDir)
        .map((p) => path.relative(rootDir, p).split(path.sep).join("/"))
        .filter((k) => k.startsWith(prefix))
        .map((k) => ({ key: k }));
      return { objects, truncated: false };
    },
  };
}

/**
 * 在本地 Node 環境啟動時呼叫：建立檔案型 R2 並注入 db-r2。
 * 預設存放在 <cwd>/data/r2，與 DuckDB 的 data/stock.db 隔開，互不干擾。
 */
export function setupLocalBucket(
  dataDir: string = path.resolve(process.cwd(), "data", "r2")
): void {
  setBucket(createLocalR2Bucket(dataDir) as any);
}
