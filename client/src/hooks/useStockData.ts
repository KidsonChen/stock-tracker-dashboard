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
