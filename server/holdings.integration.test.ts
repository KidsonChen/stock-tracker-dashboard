import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { setBucket } from "./db-r2";
import { createLocalR2Bucket } from "./local-r2";
import { appRouter } from "./routers";

// 暫存 bucket：每個測試前清空，避免污染真實 holdings.json
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "holdings-it-"));
setBucket(createLocalR2Bucket(tmpRoot) as any);
const caller = appRouter.createCaller({} as any);

beforeEach(() => {
  for (const f of fs.readdirSync(tmpRoot)) {
    const p = path.join(tmpRoot, f);
    if (fs.statSync(p).isFile()) fs.unlinkSync(p);
  }
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("holdings API 整合（指定批次賣出 + 手續費）", () => {
  it("買入 → 賣出 → 剩餘/已正確 → 超賣被拒 → 刪除保護 → 先刪賣出後可刪買入", async () => {
    // 1. 買入 1 張 2330 @1000，手續費 30
    const buy = await caller.holdings.add({
      password: "",
      symbol: "2330",
      market: "TW",
      shares: 1000,
      avgCost: 1000,
      buyDate: "2025-01-15",
      fee: 30,
    });
    expect(buy.type).toBe("buy");
    expect(buy.fee).toBe(30);

    // 2. 未傳 fee 時伺服器自動試算（台股 0.1425% 最低 20）
    const buy2 = await caller.holdings.add({
      password: "",
      symbol: "2303",
      market: "TW",
      shares: 1000,
      avgCost: 50,
      buyDate: "2025-01-16",
    });
    expect(buy2.fee).toBe(71); // 5萬 × 0.1425% = 71.25 → 四捨五入 71（未觸最低 20）

    // 3. 賣出 2330 一半（0.4 張 @1100）
    const sellRec = await caller.holdings.sell({
      password: "",
      symbol: "2330",
      fromLotId: buy.id,
      shares: 400,
      price: 1100,
      sellDate: "2025-02-20",
    });
    expect(sellRec.type).toBe("sell");
    expect(sellRec.fromLotId).toBe(buy.id);
    // 自動試算：44 萬 → max(440000×0.1425%, 20) + 440000×0.3% = 627 + 1320 = 1947
    expect(sellRec.fee).toBe(1947);

    // 4. 超賣被拒（剩餘只有 600 股）
    await expect(
      caller.holdings.sell({
        password: "",
        symbol: "2330",
        fromLotId: buy.id,
        shares: 700,
        price: 1100,
        sellDate: "2025-02-21",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // 5. 刪除保護：已被引用的買入批次不可刪
    await expect(
      caller.holdings.remove({ password: "", id: buy.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // 6. 先刪賣出 → 買入可刪 → 2330 從資料消失
    await caller.holdings.remove({ password: "", id: sellRec.id });
    await caller.holdings.remove({ password: "", id: buy.id });

    // 7. 驗證 list 回傳：只剩 2303 一筆（list 會打即時報價，失敗也不影響回傳結構）
    const rows = await caller.holdings.list({ password: "" });
    const row2303 = rows.find((r) => r.symbol === "2303")!;
    expect(row2303).toBeTruthy();
    expect(row2303.type).toBe("buy");
    expect(row2303.remaining).toBe(1000);
    expect(row2303.perShareCost).toBeCloseTo((1000 * 50 + 71) / 1000, 6); // fee=71 攤入
    expect(rows.find((r) => r.symbol === "2330")).toBeUndefined();
  });

  it("賣出引用不存在的批次 → BAD_REQUEST", async () => {
    await expect(
      caller.holdings.sell({
        password: "",
        symbol: "2330",
        fromLotId: 12345,
        shares: 100,
        price: 1000,
        sellDate: "2025-03-01",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("跨批次賣出：不同批次各自結算剩餘", async () => {
    const b1 = await caller.holdings.add({
      password: "", symbol: "2330", market: "TW", shares: 1000, avgCost: 1000, buyDate: "2025-01-01", fee: 30,
    });
    const b2 = await caller.holdings.add({
      password: "", symbol: "2330", market: "TW", shares: 2000, avgCost: 900, buyDate: "2025-04-01", fee: 50,
    });
    await caller.holdings.sell({
      password: "", symbol: "2330", fromLotId: b2.id, shares: 500, price: 950, sellDate: "2025-05-01", fee: 100,
    });
    const rows = await caller.holdings.list({ password: "" });
    const lot1 = rows.find((r) => r.id === b1.id)!;
    const lot2 = rows.find((r) => r.id === b2.id)!;
    const sellRow = rows.find((r) => r.type === "sell")!;
    expect(lot1.remaining).toBe(1000); // 未動到
    expect(lot2.remaining).toBe(1500); // 2000 − 500
    // 已實現 = (500×950−100) − 500×((2000×900+50)/2000)
    expect(sellRow.realizedPnl).toBeCloseTo(500 * 950 - 100 - 500 * ((2000 * 900 + 50) / 2000), 6);
  });
});
