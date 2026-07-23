import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Database } from "duckdb";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("DuckDB watchlist storage", () => {
  const createdPaths: string[] = [];

  afterEach(() => {
    vi.resetModules();
    delete process.env.DUCKDB_PATH;

    while (createdPaths.length) {
      const target = createdPaths.pop();
      if (!target) continue;
      try {
        if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
          fs.rmSync(target, { recursive: true, force: true });
        } else if (fs.existsSync(target)) {
          fs.unlinkSync(target);
        }
        const wal = `${target}.wal`;
        if (fs.existsSync(wal)) fs.unlinkSync(wal);
      } catch {
        // Ignore cleanup failures in tests.
      }
    }
  });

  it("creates a fresh database when the existing path is invalid", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "duckdb-watchlist-"));
    const invalidPath = path.join(tempDir, "invalid-db");
    fs.mkdirSync(invalidPath);
    createdPaths.push(invalidPath);

    process.env.DUCKDB_PATH = invalidPath;

    const dbModule = await import("./db-duckdb");

    await expect(dbModule.getDB()).resolves.toBeTruthy();
    await expect(dbModule.getWatchlist()).resolves.toEqual([]);
  });

  it("recovers when the existing database file is still open", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "duckdb-watchlist-"));
    const lockedPath = path.join(tempDir, "locked-db");
    fs.writeFileSync(lockedPath, "not-a-real-duckdb-file");
    createdPaths.push(lockedPath);

    process.env.DUCKDB_PATH = lockedPath;

    const probe = new Database(lockedPath);
    const conn = probe.connect();
    conn.all("SELECT 1", () => undefined);

    const dbModule = await import("./db-duckdb");

    await expect(dbModule.getDB()).resolves.toBeTruthy();
    await expect(dbModule.getWatchlist()).resolves.toEqual([]);

    try {
      probe.close(() => undefined);
    } catch {
      // Ignore cleanup noise in tests.
    }
  });
});
