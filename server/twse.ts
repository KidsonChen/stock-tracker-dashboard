/**
 * TWSE (台灣證交所) API 客戶端
 * 官方免費 API，無需認證
 * 文檔: https://openapi.twse.com.tw/
 */

export interface TWSEQuote {
  symbol: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

export interface TWSECandle {
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
export async function getTWSEQuote(symbol: string): Promise<TWSEQuote> {
  try {
    // 移除 .TW 後綴
    const cleanSymbol = symbol.replace(/\.TW$/, "");

    // TWSE 即時報價 API
    const url = `https://api.tse.com.tw/api/v1/stock/${cleanSymbol}/intraday`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`TWSE API error: ${response.status}`);
    }

    const data = await response.json();

    // 解析最新成交資訊
    const latestData = data.data?.[data.data.length - 1];
    if (!latestData) {
      throw new Error("No data available");
    }

    // TWSE 格式: [時間, 成交價, 成交量, 成交筆數]
    const price = parseFloat(latestData[1]);
    const volume = parseInt(latestData[2] || "0");

    // 獲取日線資料以取得開盤、高、低價
    const dailyUrl = `https://api.tse.com.tw/api/v1/exchangeReport/DAILY_CLOSE?response=json&date=${getTWSEDateString()}`;
    const dailyResponse = await fetch(dailyUrl);
    const dailyData = await dailyResponse.json();

    let open = price;
    let high = price;
    let low = price;

    // 在日線資料中查找該股票
    if (dailyData.data) {
      const stockData = dailyData.data.find(
        (row: any) => row[0] === cleanSymbol
      );
      if (stockData) {
        open = parseFloat(stockData[4]); // 開盤價
        high = parseFloat(stockData[5]); // 最高價
        low = parseFloat(stockData[6]); // 最低價
      }
    }

    return {
      symbol: cleanSymbol,
      name: data.name || cleanSymbol,
      price,
      open,
      high,
      low,
      volume,
      change: price - open,
      changePercent: ((price - open) / open) * 100,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error(`[TWSE] Failed to fetch quote for ${symbol}:`, error);
    throw error;
  }
}

/**
 * 獲取台股歷史 K 線資料
 * @param symbol 股票代號
 * @param days 天數 (預設 30 天)
 */
export async function getTWSECandles(
  symbol: string,
  days: number = 30
): Promise<TWSECandle[]> {
  try {
    // 移除 .TW 後綴
    const cleanSymbol = symbol.replace(/\.TW$/, "");

    // 計算日期範圍
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const candles: TWSECandle[] = [];

    // TWSE 按月份提供資料，需要逐月查詢
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateString = getTWSEMonthString(currentDate);

      try {
        const url = `https://api.tse.com.tw/api/v1/exchangeReport/OHLC?response=json&date=${dateString}&symbol=${cleanSymbol}`;

        const response = await fetch(url);

        if (!response.ok) {
          console.warn(`[TWSE] No data for ${dateString}`);
          currentDate.setMonth(currentDate.getMonth() + 1);
          continue;
        }

        const data = await response.json();

        if (data.data) {
          for (const row of data.data) {
            // TWSE 格式: [日期, 開盤, 最高, 最低, 收盤, 成交量]
            candles.push({
              date: row[0],
              open: parseFloat(row[1]),
              high: parseFloat(row[2]),
              low: parseFloat(row[3]),
              close: parseFloat(row[4]),
              volume: parseInt(row[5] || "0"),
            });
          }
        }
      } catch (error) {
        console.warn(`[TWSE] Error fetching ${dateString}:`, error);
      }

      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // 排序並返回最近 N 筆
    return candles
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-days);
  } catch (error) {
    console.error(`[TWSE] Failed to fetch candles for ${symbol}:`, error);
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

/**
 * 獲取 TWSE 日期字符串 (YYYYMMDD)
 */
function getTWSEDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * 獲取 TWSE 月份字符串 (YYYYMM)
 */
function getTWSEMonthString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}
