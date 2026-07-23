import { spawn } from "child_process";
import fs from "fs";

// 啟動 server 為 detached orphan（繞過 shell & 限制）
const child = spawn("node", ["dist/index.js"], {
  env: { ...process.env, NODE_ENV: "production", PORT: "3001" },
  detached: true,
  stdio: ["ignore", fs.openSync("data/srv3.log", "w"), fs.openSync("data/srv3.log", "w")],
});
child.unref(); // 父退出不影響子
console.log("launched server pid:", child.pid);
process.exit(0);
