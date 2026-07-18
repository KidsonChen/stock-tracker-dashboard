import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";
import type { User } from "../drizzle/schema";
import { formatDateYMD } from "../shared/date";

export type Watchlist = {
  id: number;
  symbol: string;
  addedAt: string;
  updatedAt: string;
};

export type AnalysisCache = {
  id: number;
  userId: number;
  symbol: string;
  analysisType: string;
  result: string;
  createdAt: string;
};

export type QuoteData = {
  c: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
};

export type CandleRow = {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

function getSupabase() {
  const url = ENV.supabaseUrl;
  const key = ENV.supabaseAnonKey;
  if (!url || !key) {
    throw new Error("Supabase credentials are not configured");
  }
  return createClient(url, key);
}

export async function getWatchlist(): Promise<Watchlist[]> {
  const { data, error } = await getSupabase()
    .from("watchlist")
    .select("*")
    .order("addedAt", { ascending: true });

  if (error) {
    console.error("[DB] getWatchlist failed", error);
    return [];
  }
  return (data as Watchlist[]) ?? [];
}

export async function addToWatchlist(symbol: string): Promise<Watchlist> {
  const { data, error } = await getSupabase()
    .from("watchlist")
    .insert({ symbol: symbol.toUpperCase() })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to add watchlist");
  }

  return data as Watchlist;
}

export async function removeFromWatchlist(symbol: string): Promise<void> {
  const { error } = await getSupabase()
    .from("watchlist")
    .delete()
    .eq("symbol", symbol.toUpperCase());

  if (error) {
    throw new Error(error.message || "Failed to remove watchlist");
  }
}

export async function getStockDataBySymbol(symbol: string, limit = 100): Promise<CandleRow[]> {
  const { data, error } = await getSupabase()
    .from("stockData")
    .select("*")
    .eq("symbol", symbol.toUpperCase())
    .order("date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[DB] getStockDataBySymbol failed", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    symbol: row.symbol as string,
    date: formatDateYMD(row.date as string),
    open: Number(row.open ?? 0),
    high: Number(row.high ?? 0),
    low: Number(row.low ?? 0),
    close: Number(row.close ?? 0),
    volume: Number(row.volume ?? 0),
  }));
}

export async function saveStockData(rows: CandleRow[]): Promise<void> {
  if (!rows.length) {
    return;
  }

  const payload = rows.map((row) => ({
    symbol: row.symbol,
    date: row.date,
    open: String(row.open),
    high: String(row.high),
    low: String(row.low),
    close: String(row.close),
    volume: String(row.volume),
  }));

  const { error } = await getSupabase().from("stockData").insert(payload);

  if (error) {
    console.error("[DB] saveStockData failed", error);
  }
}

export async function isCacheExpired(symbol: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("stockData")
    .select("cachedAt")
    .eq("symbol", symbol.toUpperCase())
    .order("cachedAt", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return true;
  }

  const cachedAt = new Date(data[0].cachedAt as string).getTime();
  return Date.now() - cachedAt > CACHE_EXPIRY_MS;
}

export async function getAnalysisCache(
  userId: number,
  symbol: string,
  analysisType: string
): Promise<AnalysisCache | null> {
  const { data, error } = await getSupabase()
    .from("analysisCache")
    .select("*")
    .eq("userId", userId)
    .eq("symbol", symbol.toUpperCase())
    .eq("analysisType", analysisType)
    .order("createdAt", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0] as AnalysisCache;
}

export async function getStockQuote(symbol: string): Promise<QuoteData> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("stockData")
    .select("*")
    .eq("symbol", symbol.toUpperCase())
    .order("cachedAt", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Quote not found for ${symbol}`);
  }

  return {
    c: Number(data.close),
    h: Number(data.high),
    l: Number(data.low),
    o: Number(data.open),
    pc: Number(data.open), // 使用開盤價作為前收價的近似值
    t: Math.floor(new Date(data.cachedAt).getTime() / 1000),
  };
}

export async function fetchAndCacheStockData(symbol: string): Promise<void> {
  const quote = await getStockQuote(symbol);
  await saveStockData([
    {
      symbol: symbol.toUpperCase(),
      date: formatDateYMD(new Date()),
      open: quote.o,
      high: quote.h,
      low: quote.l,
      close: quote.c,
      volume: 0,
    },
  ]);
}

export async function getUserByOpenId(
  _openId: string
): Promise<User | null> {
  const { data } = await getSupabase()
    .from("users")
    .select("*")
    .eq("openId", _openId)
    .maybeSingle();

  return (data as User | null) ?? null;
}

export async function upsertUser(_user: Partial<User>): Promise<User | null> {
  const { data } = await getSupabase()
    .from("users")
    .upsert(_user)
    .select("*")
    .maybeSingle();

  return (data as User | null) ?? null;
}

export async function saveAnalysisCache(
  userId: number,
  symbol: string,
  analysisType: string,
  result: string
): Promise<void> {
  const { error } = await getSupabase().from("analysisCache").insert({
    userId,
    symbol: symbol.toUpperCase(),
    analysisType,
    result,
  });

  if (error) {
    console.error("[DB] saveAnalysisCache failed", error);
  }
}
