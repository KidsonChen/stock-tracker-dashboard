import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

export interface StockQuote {
  symbol: string;
  currentPrice: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  timestamp: number;
  change: number;
  changePercent: number;
}

export function useStockQuote(symbol: string | null, market?: string) {
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading: queryLoading, error: queryError } = trpc.stock.getQuote.useQuery(
    { symbol: symbol || "", market: market ?? "TW" },
    { enabled: !!symbol }
  );

  useEffect(() => {
    if (data && symbol) {
      const change = data.currentPrice - data.previousClose;
      const changePercent = (change / data.previousClose) * 100;

      setQuote({
        ...data,
        change: parseFloat(change.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2)),
      });
    }
  }, [data, symbol]);

  useEffect(() => {
    setIsLoading(queryLoading);
  }, [queryLoading]);

  useEffect(() => {
    if (queryError) {
      setError(queryError.message);
    }
  }, [queryError]);

  return { quote, isLoading, error };
}

export interface ChartData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function useStockHistory(symbol: string | null, market?: string) {
  const { data, isLoading, error } = trpc.stock.getHistory.useQuery(
    { symbol: symbol || "", market: market ?? "TW" },
    { enabled: !!symbol }
  );

  return {
    data: (data as ChartData[] | undefined) || [],
    isLoading,
    error: error?.message || null,
  };
}

export interface StockExtraData {
  symbol: string;
  market: string;
  name?: string;
  currency?: string;
  fiftyTwoWeek?: { high?: number; low?: number } | null;
  valuation: {
    date: string;
    rawDate?: string;
    dividendYield: number;
    peRatio: number;
    pbRatio: number;
    fiscalYear: string;
    isRealtime?: boolean;
    price?: number;
    volume?: number;
    marketCap?: number | null;
  } | null;
  orderBook: {
    symbol: string;
    isEstimate: true;
    note: string;
    levels: {
      bidPrice: number;
      bidVol: number;
      askPrice: number;
      askVol: number;
    }[];
    avgPrice: number;
    totalVol: number;
  } | null;
  margin: {
    symbol: string;
    marginBalance: number;
    marginBuy: number;
    marginSell: number;
    shortBalance: number;
    shortBuy: number;
    shortSell: number;
  } | null;
  foreignTrade: {
    symbol: string;
    foreignNet: number;
    foreignBuy: number;
    foreignSell: number;
    trustNet: number;
    dealerNet: number;
  } | null;
  recentCandles?: { date: string; close: number; volume: number }[];
  indicators?: {
    ema12: number;
    ema26: number;
    macd: number;
    macdSignal: number;
    macdHist: number;
    rsi14: number;
    kdK: number;
    kdD: number;
    bollUpper: number;
    bollMid: number;
    bollLower: number;
    bollPercentB: number;
    bias20: number;
    volumeRatio5: number;
    signals: string[];
  } | null;
  fundamentals?: {
    symbol: string;
    companyName: string;
    industry: string;
    monthlyRevenue: {
      yearMonth: string;
      revenue: number;
      lastMonthRevenue: number;
      lastYearRevenue: number;
      momPct: number;
      yoyPct: number;
      ytdRevenue: number;
      ytdYoyPct: number;
      note: string;
    } | null;
    quarterlyEps: {
      year: string;
      quarter: string;
      eps: number;
      revenue: number;
      operatingIncome: number;
      netIncome: number;
      netMarginPct: number;
      opMarginPct: number;
    } | null;
  } | null;
}

export function useStockExtra(symbol: string | null, market?: string) {
  const { data, isLoading, error } = trpc.getExtra.useQuery(
    { symbol: symbol || "", market: market ?? "TW" },
    { enabled: !!symbol, staleTime: 5 * 60 * 1000 }
  );

  return {
    data: (data as StockExtraData | undefined) || null,
    isLoading,
    error: error?.message || null,
  };
}
