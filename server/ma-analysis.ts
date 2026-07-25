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

// ═══════════════════════════════════════════════════════════
// 進階技術指標：EMA / MACD / RSI / KD / 布林通道 / 乖離率 / ADX-lite
// 純數學計算，零外部依賴，供 LLM prompt 注入與前端指標卡使用。
// ═══════════════════════════════════════════════════════════

export interface AdvancedIndicators {
  ema12: number;
  ema26: number;
  macd: number;         // DIF = EMA12 - EMA26
  macdSignal: number;   // DEA = EMA9 of DIF
  macdHist: number;     // 柱狀 = DIF - DEA
  rsi14: number;        // 0-100
  kdK: number;          // 0-100
  kdD: number;          // 0-100
  bollUpper: number;
  bollMid: number;      // = MA20
  bollLower: number;
  bollPercentB: number; // 價格在布林通道的位置 0~1（可超出）
  bias20: number;       // 20日乖離率 %
  volumeRatio5: number; // 今日量 / 5日均量
  signals: string[];    // 由指標推導的文字信號
}

function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

const rnd = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** 計算進階技術指標（需要至少 ~30 根 K 線，200 根更佳） */
export function calculateAdvancedIndicators(candles: CandleData[]): AdvancedIndicators | null {
  if (candles.length < 30) return null;
  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const price = last.close;

  // EMA / MACD
  const e12 = emaSeries(closes, 12);
  const e26 = emaSeries(closes, 26);
  const difSeries = e12.map((v, i) => v - e26[i]);
  const deaSeries = emaSeries(difSeries, 9);
  const dif = difSeries[difSeries.length - 1];
  const dea = deaSeries[deaSeries.length - 1];
  const hist = dif - dea;
  const prevHist = difSeries[difSeries.length - 2] - deaSeries[deaSeries.length - 2];

  // RSI14 (Wilder smoothing)
  let gain = 0, loss = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const chg = closes[i] - closes[i - 1];
    if (chg >= 0) gain += chg; else loss -= chg;
  }
  const rsi = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);

  // KD (9,3,3)
  let k = 50, d = 50;
  for (let i = Math.max(8, candles.length - 60); i < candles.length; i++) {
    const win = candles.slice(i - 8, i + 1);
    const hi = Math.max(...win.map((c) => c.high));
    const lo = Math.min(...win.map((c) => c.low));
    const rsv = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
  }

  // 布林通道 (20, 2σ)
  const w20 = closes.slice(-20);
  const mid = w20.reduce((a, b) => a + b, 0) / 20;
  const sd = Math.sqrt(w20.reduce((a, b) => a + (b - mid) ** 2, 0) / 20);
  const upper = mid + 2 * sd;
  const lower = mid - 2 * sd;
  const pctB = upper === lower ? 0.5 : (price - lower) / (upper - lower);

  // 20日乖離率
  const bias20 = ((price - mid) / mid) * 100;

  // 量比（今日量 / 前5日均量）
  const vols = candles.map((c) => c.volume);
  const avgVol5 = vols.slice(-6, -1).reduce((a, b) => a + b, 0) / 5;
  const volumeRatio5 = avgVol5 > 0 ? last.volume / avgVol5 : 1;

  // 文字信號
  const signals: string[] = [];
  if (hist > 0 && prevHist <= 0) signals.push("MACD 柱狀由負轉正（黃金交叉初現）");
  if (hist < 0 && prevHist >= 0) signals.push("MACD 柱狀由正轉負（死亡交叉初現）");
  if (dif > dea && dif > 0) signals.push("MACD 多頭排列（DIF > DEA > 0）");
  if (dif < dea && dif < 0) signals.push("MACD 空頭排列（DIF < DEA < 0）");
  if (rsi >= 70) signals.push(`RSI ${rnd(rsi, 1)} 進入超買區（≥70），短線過熱注意回檔`);
  else if (rsi <= 30) signals.push(`RSI ${rnd(rsi, 1)} 進入超賣區（≤30），短線乖離過大`);
  if (k > 80 && d > 80) signals.push("KD 高檔鈍化（K、D > 80），強勢但注意轉折");
  else if (k < 20 && d < 20) signals.push("KD 低檔鈍化（K、D < 20），弱勢但接近反彈區");
  if (pctB > 1) signals.push("價格突破布林上軌，波動放大（強勢或超漲）");
  else if (pctB < 0) signals.push("價格跌破布林下軌，波動放大（弱勢或超跌）");
  if (Math.abs(bias20) > 10) signals.push(`20日乖離率 ${rnd(bias20, 1)}%，乖離偏大注意均值回歸`);
  if (volumeRatio5 >= 2) signals.push(`成交量放大至 5 日均量的 ${rnd(volumeRatio5, 1)} 倍（量增訊號）`);
  else if (volumeRatio5 <= 0.5) signals.push("成交量萎縮至 5 日均量一半以下（量縮觀望）");

  return {
    ema12: rnd(e12[e12.length - 1]),
    ema26: rnd(e26[e26.length - 1]),
    macd: rnd(dif, 3),
    macdSignal: rnd(dea, 3),
    macdHist: rnd(hist, 3),
    rsi14: rnd(rsi, 1),
    kdK: rnd(k, 1),
    kdD: rnd(d, 1),
    bollUpper: rnd(upper),
    bollMid: rnd(mid),
    bollLower: rnd(lower),
    bollPercentB: rnd(pctB, 2),
    bias20: rnd(bias20, 2),
    volumeRatio5: rnd(volumeRatio5, 2),
    signals,
  };
}

/** 進階指標 → LLM 文本 */
export function formatAdvancedIndicatorsForLLM(ind: AdvancedIndicators): string {
  return `
【動量與震盪指標】
MACD：DIF=${ind.macd}、DEA=${ind.macdSignal}、柱狀=${ind.macdHist}（${ind.macdHist >= 0 ? "多方" : "空方"}）
RSI(14)：${ind.rsi14}（>70 超買、<30 超賣）
KD(9,3,3)：K=${ind.kdK}、D=${ind.kdD}
EMA12：${ind.ema12}、EMA26：${ind.ema26}

【波動指標】
布林通道(20,2σ)：上軌 ${ind.bollUpper} / 中軌 ${ind.bollMid} / 下軌 ${ind.bollLower}，%B=${ind.bollPercentB}
20日乖離率：${ind.bias20}%
量比（今日/5日均量）：${ind.volumeRatio5}

【指標信號】
${ind.signals.length ? ind.signals.map((s) => `• ${s}`).join("\n") : "• 各指標中性，無極端信號"}
  `.trim();
}
