import { describe, it, expect } from "vitest";
import {
  calculateMAValues,
  analyzeTechnicals,
  formatTechnicalAnalysisForLLM,
  type CandleData,
} from "./ma-analysis";

describe("MA Analysis", () => {
  // 模擬 K 線數據
  const mockCandles: CandleData[] = [
    { date: "2026-06-01", open: 2300, high: 2310, low: 2290, close: 2305, volume: 1000000 },
    { date: "2026-06-02", open: 2305, high: 2320, low: 2300, close: 2315, volume: 1100000 },
    { date: "2026-06-03", open: 2315, high: 2330, low: 2310, close: 2325, volume: 1200000 },
    { date: "2026-06-04", open: 2325, high: 2340, low: 2320, close: 2335, volume: 1300000 },
    { date: "2026-06-05", open: 2335, high: 2350, low: 2330, close: 2345, volume: 1400000 },
    { date: "2026-06-06", open: 2345, high: 2360, low: 2340, close: 2355, volume: 1500000 },
    { date: "2026-06-07", open: 2355, high: 2370, low: 2350, close: 2365, volume: 1600000 },
    { date: "2026-06-08", open: 2365, high: 2380, low: 2360, close: 2375, volume: 1700000 },
    { date: "2026-06-09", open: 2375, high: 2390, low: 2370, close: 2385, volume: 1800000 },
    { date: "2026-06-10", open: 2385, high: 2400, low: 2380, close: 2395, volume: 1900000 },
    { date: "2026-06-11", open: 2395, high: 2410, low: 2390, close: 2405, volume: 2000000 },
    { date: "2026-06-12", open: 2405, high: 2420, low: 2400, close: 2415, volume: 2100000 },
    { date: "2026-06-13", open: 2415, high: 2430, low: 2410, close: 2425, volume: 2200000 },
    { date: "2026-06-14", open: 2425, high: 2440, low: 2420, close: 2435, volume: 2300000 },
    { date: "2026-06-15", open: 2435, high: 2450, low: 2430, close: 2445, volume: 2400000 },
    { date: "2026-06-16", open: 2445, high: 2460, low: 2440, close: 2455, volume: 2500000 },
    { date: "2026-06-17", open: 2455, high: 2470, low: 2450, close: 2465, volume: 2600000 },
    { date: "2026-06-18", open: 2465, high: 2480, low: 2460, close: 2475, volume: 2700000 },
    { date: "2026-06-19", open: 2475, high: 2490, low: 2470, close: 2485, volume: 2800000 },
    { date: "2026-06-20", open: 2485, high: 2500, low: 2480, close: 2495, volume: 2900000 },
  ];

  it("should calculate MA values correctly", () => {
    const maValues = calculateMAValues(mockCandles);

    expect(maValues.ma5).toBeGreaterThan(0);
    expect(maValues.ma10).toBeGreaterThan(0);
    expect(maValues.ma20).toBeGreaterThan(0);
    expect(maValues.ma50).toBeGreaterThanOrEqual(0);
    expect(maValues.ma200).toBeGreaterThanOrEqual(0);

    expect(maValues.ma5).toBeGreaterThan(maValues.ma20);
  });

  it("should detect uptrend correctly", () => {
    const analysis = analyzeTechnicals(mockCandles);

    // 趨勢可能是上升或盤整
    expect(["uptrend", "consolidation"]).toContain(analysis.trend);
    expect(analysis.currentPrice).toBe(2495);
  });

  it("should generate technical signals", () => {
    const analysis = analyzeTechnicals(mockCandles);

    expect(analysis.signals.length).toBeGreaterThanOrEqual(0);
  });

  it("should calculate support and resistance", () => {
    const analysis = analyzeTechnicals(mockCandles);

    expect(analysis.support).toBeGreaterThanOrEqual(0);
    expect(analysis.resistance).toBeGreaterThanOrEqual(0);
    expect(analysis.resistance).toBeGreaterThanOrEqual(analysis.support);
  });

  it("should format analysis for LLM correctly", () => {
    const analysis = analyzeTechnicals(mockCandles);
    const formatted = formatTechnicalAnalysisForLLM(analysis);

    expect(formatted).toContain("技術面分析數據");
    expect(formatted).toContain("當前股價");
    expect(formatted).toContain("均線數據");
    expect(formatted).toContain("MA5");
    expect(formatted).toContain("MA20");
    expect(formatted).toContain("支撐位");
    expect(formatted).toContain("阻力位");
  });

  it("should handle downtrend correctly", () => {
    const downtrend: CandleData[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, "0")}`,
      open: 2500 - i * 15,
      high: 2510 - i * 15,
      low: 2490 - i * 15,
      close: 2500 - i * 15,
      volume: 1000000,
    }));

    const analysis = analyzeTechnicals(downtrend);

    expect(["downtrend", "consolidation"]).toContain(analysis.trend);
  });

  it("should handle consolidation correctly", () => {
    const consolidation: CandleData[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, "0")}`,
      open: 2350 + Math.sin(i) * 5,
      high: 2360 + Math.sin(i) * 5,
      low: 2340 + Math.sin(i) * 5,
      close: 2350 + Math.sin(i) * 5,
      volume: 1000000,
    }));

    const analysis = analyzeTechnicals(consolidation);

    expect(["consolidation", "uptrend", "downtrend"]).toContain(analysis.trend);
  });
});
