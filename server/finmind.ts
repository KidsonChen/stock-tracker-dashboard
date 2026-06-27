/**
 * FinMind 台股 API 客戶端
 * 官方免費 API，無需認證
 * 文檔: https://finmind.github.io/
 */

export interface FinMindQuote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

export interface FinMindCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 獲取台股即時報價
 * @param symbol 股票代號 (如: 2330, 2330.TW)
 */
export async function getFinMindQuote(symbol: string): Promise<FinMindQuote> {
  try {
    // 移除 .TW 後綴
    const cleanSymbol = symbol.replace(/\.TW$/, "");

    // 獲取最近一天的數據
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const startDate = yesterday.toISOString().split("T")[0];
    const endDate = today.toISOString().split("T")[0];

    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${cleanSymbol}&start_date=${startDate}&end_date=${endDate}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`FinMind API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      throw new Error("No data available");
    }

    // 取最新的一筆資料
    const latestData = data.data[data.data.length - 1];

    const price = latestData.close;
    const open = latestData.open;
    const high = latestData.max;
    const low = latestData.min;
    const volume = latestData.Trading_Volume;
    const change = latestData.spread;
    const changePercent = (change / (price - change)) * 100;

    return {
      symbol: cleanSymbol,
      price,
      open,
      high,
      low,
      volume,
      change,
      changePercent,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error(`[FinMind] Failed to fetch quote for ${symbol}:`, error);
    throw error;
  }
}

/**
 * 獲取台股歷史 K 線資料
 * @param symbol 股票代號
 * @param days 天數 (預設 30 天)
 */
export async function getFinMindCandles(
  symbol: string,
  days: number = 30
): Promise<FinMindCandle[]> {
  try {
    // 移除 .TW 後綴
    const cleanSymbol = symbol.replace(/\.TW$/, "");

    // 計算日期範圍
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${cleanSymbol}&start_date=${startDateStr}&end_date=${endDateStr}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`FinMind API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      return [];
    }

    // 轉換為標準格式
    const candles: FinMindCandle[] = data.data.map((item: any) => ({
      date: item.date,
      open: item.open,
      high: item.max,
      low: item.min,
      close: item.close,
      volume: item.Trading_Volume,
    }));

    return candles;
  } catch (error) {
    console.error(`[FinMind] Failed to fetch candles for ${symbol}:`, error);
    throw error;
  }
}

/**
 * 判斷是否為台股代號
 */
export function isTaiwanStock(symbol: string): boolean {
  // 台股代號通常是 4 位數字，或以 .TW 結尾
  const cleanSymbol = symbol.replace(/\.TW$/, "");
  return /^\d{4}$/.test(cleanSymbol);
}
