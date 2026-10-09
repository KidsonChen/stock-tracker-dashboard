import { describe, expect, it } from "vitest";
import { computePortfolio, estimateFee, type PortfolioTxInput } from "../shared/portfolio";

// ── 手續費自動試算 ──
describe("estimateFee", () => {
  it("台股買進：0.1425% 最低 20 元", () => {
    // 1000 股 × 100 元 = 10 萬 → 142.5 元
    expect(estimateFee({ market: "TW", side: "buy", shares: 1000, price: 100 })).toBe(143);
    // 1000 股 × 10 元 = 1 萬 → 14.25 元 → 觸發最低 20 元
    expect(estimateFee({ market: "TW", side: "buy", shares: 1000, price: 10 })).toBe(20);
  });

  it("台股賣出：手續費 0.1425%（最低 20）＋ 0.3% 證交稅", () => {
    // 1000 股 × 1000 元 = 100 萬 → 1425 + 3000 = 4425
    expect(estimateFee({ market: "TW", side: "sell", shares: 1000, price: 1000 })).toBe(4425);
  });

  it("美股／港股：回傳 0（由使用者手動輸入）", () => {
    expect(estimateFee({ market: "US", side: "buy", shares: 10, price: 100 })).toBe(0);
    expect(estimateFee({ market: "HK", side: "sell", shares: 10, price: 100 })).toBe(0);
  });

  it("無效輸入（0 股／0 價）：回傳 0", () => {
    expect(estimateFee({ market: "TW", side: "buy", shares: 0, price: 100 })).toBe(0);
    expect(estimateFee({ market: "TW", side: "buy", shares: 1000, price: 0 })).toBe(0);
  });
});

// ── 指定批次結算 ──
const buy = (over: Partial<PortfolioTxInput> = {}): PortfolioTxInput => ({
  id: 1,
  symbol: "2330",
  market: "TW",
  type: "buy",
  shares: 1000,
  avgCost: 1000,
  fee: 20,
  buyDate: "2025-01-01",
  ...over,
});

const sell = (over: Partial<PortfolioTxInput> = {}): PortfolioTxInput => ({
  id: 2,
  symbol: "2330",
  market: "TW",
  type: "sell",
  shares: 400,
  avgCost: 1100,
  fee: 352, // 測試用固定手續費（不走自動試算）
  fromLotId: 1,
  buyDate: "2025-02-01",
  ...over,
});

describe("computePortfolio", () => {
  it("舊資料（無 type／fee）視為買入，fee = 0", () => {
    const pf = computePortfolio([
      { id: 1, symbol: "2330", market: "TW", shares: 1000, avgCost: 1000, buyDate: "2025-01-01" },
    ]);
    expect(pf.lots).toHaveLength(1);
    expect(pf.lots[0].remaining).toBe(1000);
    expect(pf.lots[0].fee).toBe(0);
    expect(pf.lots[0].perShareCost).toBe(1000);
    expect(pf.sellCalcs).toHaveLength(0);
  });

  it("買入手續費攤入批次單價", () => {
    const pf = computePortfolio([buy({ shares: 1000, avgCost: 1000, fee: 100 })]);
    expect(pf.lots[0].perShareCost).toBeCloseTo(1000.1, 6); // (1000×1000+100)/1000
    expect(pf.totals.cost).toBeCloseTo(1000100, 6);
    expect(pf.totals.fees).toBe(100);
  });

  it("指定批次賣出：剩餘股數與已實現損益（賣出手續費從收入扣、成本用批次含費均價）", () => {
    const pf = computePortfolio([buy(), sell()]);
    const lot = pf.lots[0];
    // perShareCost = (1000×1000+20)/1000 = 1000.02
    expect(lot.perShareCost).toBeCloseTo(1000.02, 6);
    expect(lot.remaining).toBe(600);
    expect(lot.soldShares).toBe(400);
    const sc = pf.sellCalcs[0];
    // proceeds = 400×1100−352；basis = 400×1000.02
    expect(sc.proceeds).toBe(400 * 1100 - 352);
    expect(sc.basis).toBeCloseTo(400 * 1000.02, 6);
    expect(sc.realizedPnl).toBeCloseTo(400 * 1100 - 352 - 400 * 1000.02, 6);
    // 持倉：剩餘 600 股、成本 600×1000.02、已實現、手續費 20+352
    const pos = pf.positions.find((p) => p.symbol === "2330")!;
    expect(pos.shares).toBe(600);
    expect(pos.cost).toBeCloseTo(600 * 1000.02, 6);
    expect(pos.realizedPnl).toBeCloseTo(sc.realizedPnl, 6);
    expect(pos.fees).toBe(20 + 352);
    expect(pos.openLots).toBe(1);
  });

  it("超賣截斷：soldShares 以批次原始股數為上限、剩餘不為負", () => {
    const pf = computePortfolio([buy({ shares: 1000 }), sell({ shares: 1500 })]);
    expect(pf.lots[0].soldShares).toBe(1000);
    expect(pf.lots[0].remaining).toBe(0);
  });

  it("無效 fromLotId（批次不存在）：退化為以賣價當成本（已實現 ≈ −手續費）", () => {
    const pf = computePortfolio([sell({ fromLotId: 999 })]);
    expect(pf.sellCalcs[0].realizedPnl).toBeCloseTo(-352, 6);
  });

  it("全數賣出的標的：shares = 0、仍計入已實現，且不佔 openLots", () => {
    const pf = computePortfolio([buy(), sell({ shares: 1000, fee: 1000 })]);
    const pos = pf.positions.find((p) => p.symbol === "2330")!;
    expect(pos.shares).toBe(0);
    expect(pos.cost).toBe(0);
    expect(pos.openLots).toBe(0);
    expect(pos.realizedPnl).toBeCloseTo(1000 * 1100 - 1000 - 1000 * 1000.02, 6);
    expect(pf.totals.symbols).toBe(0); // 無未平倉標的
    expect(pf.totals.openLots).toBe(0);
    expect(pf.totals.realized).toBeCloseTo(pos.realizedPnl, 6);
  });

  it("跨批次賣出需分多筆：各批次各自結算", () => {
    const pf = computePortfolio([
      buy({ id: 1, avgCost: 1000, fee: 20, buyDate: "2025-01-01" }),
      buy({ id: 2, avgCost: 1200, fee: 20, buyDate: "2025-03-01" }),
      sell({ id: 3, fromLotId: 1, shares: 500, avgCost: 1300, fee: 700 }),
      sell({ id: 4, fromLotId: 2, shares: 1000, avgCost: 1250, fee: 1800 }),
    ]);
    expect(pf.lots.find((l) => l.lotId === 1)!.remaining).toBe(500);
    expect(pf.lots.find((l) => l.lotId === 2)!.remaining).toBe(0);
    const pos = pf.positions.find((p) => p.symbol === "2330")!;
    expect(pos.shares).toBe(500);
    expect(pos.openLots).toBe(1);
    // 已實現 = (500×1300−700 − 500×1000.02) + (1000×1250−1800 − 1000×1200.02)
    const expected = 500 * 1300 - 700 - 500 * ((1000 * 1000 + 20) / 1000) + (1000 * 1250 - 1800 - 1000 * ((1000 * 1200 + 20) / 1000));
    expect(pos.realizedPnl).toBeCloseTo(expected, 6);
  });
});
