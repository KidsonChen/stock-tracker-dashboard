/**
 * 均線技術分析工具
 * 計算均線交叉信號、趨勢強度等技術指標
 */

export interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MAValues {
  ma5: number;
  ma10: number;
  ma20: number;
  ma50: number;
  ma200: number;
}

export interface TechnicalAnalysis {
  currentPrice: number;
  maValues: MAValues;
  trend: 'uptrend' | 'downtrend' | 'consolidation';
  trendStrength: 'strong' | 'moderate' | 'weak';
  signals: string[];
  support: number;
  resistance: number;
  description: string;
}

/**
 * 計算簡單移動平均線
 */
function calculateSMA(candles: CandleData[], period: number): number {
  if (candles.length < period) return 0;
  const sum = candles.slice(-period).reduce((acc, c) => acc + c.close, 0);
  return Math.round((sum / period) * 100) / 100;
}

/**
 * 計算所有均線值
 */
export function calculateMAValues(candles: CandleData[]): MAValues {
  return {
    ma5: calculateSMA(candles, 5),
    ma10: calculateSMA(candles, 10),
    ma20: calculateSMA(candles, 20),
    ma50: calculateSMA(candles, 50),
    ma200: calculateSMA(candles, 200),
  };
}

/**
 * 判斷趨勢方向
 */
function determineTrend(
  currentPrice: number,
  maValues: MAValues
): 'uptrend' | 'downtrend' | 'consolidation' {
  const { ma5, ma10, ma20, ma50, ma200 } = maValues;

  // 上升趨勢：短期均線 > 中期均線 > 長期均線，且價格在均線上方
  if (
    ma5 > ma10 &&
    ma10 > ma20 &&
    ma20 > ma50 &&
    ma50 > ma200 &&
    currentPrice > ma5
  ) {
    return 'uptrend';
  }

  // 下降趨勢：短期均線 < 中期均線 < 長期均線，且價格在均線下方
  if (
    ma5 < ma10 &&
    ma10 < ma20 &&
    ma20 < ma50 &&
    ma50 < ma200 &&
    currentPrice < ma5
  ) {
    return 'downtrend';
  }

  return 'consolidation';
}

/**
 * 計算趨勢強度
 */
function calculateTrendStrength(
  currentPrice: number,
  maValues: MAValues,
  trend: 'uptrend' | 'downtrend' | 'consolidation'
): 'strong' | 'moderate' | 'weak' {
  const { ma5, ma10, ma20, ma50, ma200 } = maValues;

  if (trend === 'consolidation') {
    return 'weak';
  }

  // 計算均線距離
  const avgMA = (ma5 + ma10 + ma20 + ma50 + ma200) / 5;
  const distance = Math.abs(currentPrice - avgMA);
  const distancePercent = (distance / avgMA) * 100;

  if (distancePercent > 5) {
    return 'strong';
  } else if (distancePercent > 2) {
    return 'moderate';
  } else {
    return 'weak';
  }
}

/**
 * 生成技術信號
 */
function generateSignals(
  currentPrice: number,
  maValues: MAValues,
  trend: 'uptrend' | 'downtrend' | 'consolidation'
): string[] {
  const signals: string[] = [];
  const { ma5, ma10, ma20, ma50, ma200 } = maValues;

  // 金叉信號 (Golden Cross)
  if (ma50 > ma200 && currentPrice > ma50) {
    signals.push('金叉信號：50日線穿過200日線，強勢上升信號');
  }

  // 死叉信號 (Death Cross)
  if (ma50 < ma200 && currentPrice < ma50) {
    signals.push('死叉信號：50日線穿過200日線，強勢下降信號');
  }

  // 短期上升信號
  if (ma5 > ma10 && ma10 > ma20) {
    signals.push('短期上升信號：5日線 > 10日線 > 20日線');
  }

  // 短期下降信號
  if (ma5 < ma10 && ma10 < ma20) {
    signals.push('短期下降信號：5日線 < 10日線 < 20日線');
  }

  // 價格與均線關係
  if (currentPrice > ma5 && currentPrice > ma20 && currentPrice > ma50) {
    signals.push('強勢信號：價格在所有主要均線上方');
  } else if (currentPrice < ma5 && currentPrice < ma20 && currentPrice < ma50) {
    signals.push('弱勢信號：價格在所有主要均線下方');
  }

  // 均線粘合信號（盤整）
  const maSpread = Math.abs(ma5 - ma20) / ma20;
  if (maSpread < 0.01) {
    signals.push('均線粘合：短期均線與中期均線接近，可能發生突破');
  }

  return signals;
}

/**
 * 計算支撐和阻力位
 */
function calculateSupportResistance(
  candles: CandleData[],
  maValues: MAValues
): { support: number; resistance: number } {
  const { ma20, ma50 } = maValues;
  const recentCandles = candles.slice(-20);

  const lows = recentCandles.map(c => c.low);
  const highs = recentCandles.map(c => c.high);

  const support = Math.min(...lows, ma20, ma50);
  const resistance = Math.max(...highs, ma20, ma50);

  return {
    support: Math.round(support * 100) / 100,
    resistance: Math.round(resistance * 100) / 100,
  };
}

/**
 * 生成技術分析描述
 */
function generateDescription(
  trend: 'uptrend' | 'downtrend' | 'consolidation',
  trendStrength: 'strong' | 'moderate' | 'weak',
  signals: string[]
): string {
  let description = '';

  if (trend === 'uptrend') {
    description = `目前處於${trendStrength === 'strong' ? '強勢' : trendStrength === 'moderate' ? '溫和' : '弱'}上升趨勢。`;
  } else if (trend === 'downtrend') {
    description = `目前處於${trendStrength === 'strong' ? '強勢' : trendStrength === 'moderate' ? '溫和' : '弱'}下降趨勢。`;
  } else {
    description = '目前處於盤整狀態，等待突破方向確認。';
  }

  if (signals.length > 0) {
    description += `主要信號：${signals.slice(0, 2).join('；')}。`;
  }

  return description;
}

/**
 * 執行完整的技術分析
 */
export function analyzeTechnicals(candles: CandleData[]): TechnicalAnalysis {
  if (candles.length === 0) {
    throw new Error('無可用的 K 線資料');
  }

  const currentPrice = candles[candles.length - 1].close;
  const maValues = calculateMAValues(candles);
  const trend = determineTrend(currentPrice, maValues);
  const trendStrength = calculateTrendStrength(currentPrice, maValues, trend);
  const signals = generateSignals(currentPrice, maValues, trend);
  const { support, resistance } = calculateSupportResistance(candles, maValues);
  const description = generateDescription(trend, trendStrength, signals);

  return {
    currentPrice,
    maValues,
    trend,
    trendStrength,
    signals,
    support,
    resistance,
    description,
  };
}

/**
 * 格式化技術分析為文本，用於 LLM 分析
 */
export function formatTechnicalAnalysisForLLM(analysis: TechnicalAnalysis): string {
  const { currentPrice, maValues, trend, trendStrength, signals, support, resistance, description } = analysis;

  return `
【技術面分析數據】
當前股價：$${currentPrice}
趨勢方向：${trend === 'uptrend' ? '上升趨勢' : trend === 'downtrend' ? '下降趨勢' : '盤整'}
趨勢強度：${trendStrength === 'strong' ? '強勢' : trendStrength === 'moderate' ? '溫和' : '弱勢'}

【均線數據】
5日均線 (MA5)：$${maValues.ma5}
10日均線 (MA10)：$${maValues.ma10}
20日均線 (MA20)：$${maValues.ma20}
50日均線 (MA50)：$${maValues.ma50}
200日均線 (MA200)：$${maValues.ma200}

【技術信號】
${signals.length > 0 ? signals.map(s => `• ${s}`).join('\n') : '• 無明顯信號'}

【支撐與阻力】
支撐位：$${support}
阻力位：$${resistance}

【技術描述】
${description}
  `.trim();
}
