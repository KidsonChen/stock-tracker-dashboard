/**
 * 移動平均線 (Moving Average) 計算工具
 */

export interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MAData {
  date: string;
  ma: number | null;
}

/**
 * 計算簡單移動平均線 (SMA)
 * @param candles K 線資料
 * @param period 天數 (如 5, 10, 20, 50, 200)
 * @returns 均線資料
 */
export function calculateSMA(candles: CandleData[], period: number): MAData[] {
  const result: MAData[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      // 數據不足，返回 null
      result.push({
        date: candles[i].date,
        ma: null,
      });
    } else {
      // 計算過去 period 天的平均收盤價
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += candles[j].close;
      }
      const ma = sum / period;
      result.push({
        date: candles[i].date,
        ma: Math.round(ma * 100) / 100, // 保留兩位小數
      });
    }
  }

  return result;
}

/**
 * 計算指數移動平均線 (EMA)
 * @param candles K 線資料
 * @param period 天數
 * @returns 均線資料
 */
export function calculateEMA(candles: CandleData[], period: number): MAData[] {
  const result: MAData[] = [];
  const k = 2 / (period + 1);

  let ema: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push({
        date: candles[i].date,
        ma: null,
      });
    } else if (i === period - 1) {
      // 計算初始 SMA
      let sum = 0;
      for (let j = 0; j <= i; j++) {
        sum += candles[j].close;
      }
      ema = sum / period;
      result.push({
        date: candles[i].date,
        ma: Math.round(ema * 100) / 100,
      });
    } else {
      // 計算 EMA
      ema = candles[i].close * k + (ema ?? 0) * (1 - k);
      result.push({
        date: candles[i].date,
        ma: Math.round(ema * 100) / 100,
      });
    }
  }

  return result;
}

/**
 * 計算多條均線
 * @param candles K 線資料
 * @param periods 天數陣列 (如 [5, 10, 20, 50, 200])
 * @returns 多條均線資料
 */
export function calculateMultipleMAs(
  candles: CandleData[],
  periods: number[]
): Record<string, MAData[]> {
  const result: Record<string, MAData[]> = {};

  for (const period of periods) {
    result[`MA${period}`] = calculateSMA(candles, period);
  }

  return result;
}

/**
 * 獲取均線顏色
 */
export function getMAColor(period: number): string {
  const colors: Record<number, string> = {
    5: "#FF6B6B",   // 紅色
    10: "#4ECDC4",  // 青色
    20: "#45B7D1",  // 藍色
    50: "#FFA502",  // 橙色
    200: "#95E1D3", // 薄荷綠
  };

  return colors[period] || "#888888";
}
