import { appRouter } from "../server/routers";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createContext } from "../server/_core/context";
import { setupLocalBucket } from "../server/local-r2";
import express from "express";
import path from "path";
import fs from "fs";

const app = express();
// 本地 / Vercel Node 用檔案型 R2 相容層（Cloudflare 部署走真正 R2 binding）
setupLocalBucket();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

const distPath = path.resolve(process.cwd(), "dist", "public");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

export const config = {
  runtime: "nodejs",
  regions: ["iad1"],
};

export default app;
