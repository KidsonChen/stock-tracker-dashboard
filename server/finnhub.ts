import axios, { AxiosInstance } from "axios";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

export interface QuoteData {
  c: number; // Current price
  h: number; // High price of the day
  l: number; // Low price of the day
  o: number; // Open price of the day
  pc: number; // Previous close price
  t: number; // Unix timestamp
}

export interface CandelData {
  c: number[]; // Close prices
  h: number[]; // High prices
  l: number[]; // Low prices
  o: number[]; // Open prices
  s: string; // Status (ok or no_data)
  t: number[]; // Unix timestamps
  v: number[]; // Volume
}

export interface CompanyProfile {
  country: string;
  currency: string;
  description: string;
  estimateCurrency: string;
  exchange: string;
  finnhubIndustry: string;
  ipo: string;
  logo: string;
  marketCapitalization: number;
  name: string;
  phone: string;
  shareOutstanding: number;
  ticker: string;
  weburl: string;
}

class FinnhubClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: FINNHUB_BASE_URL,
      timeout: 10000,
    });
  }

  /**
   * 獲取股票即時報價
   */
  async getQuote(symbol: string): Promise<QuoteData> {
    try {
      const response = await this.client.get<QuoteData>("/quote", {
        params: {
          symbol: symbol.toUpperCase(),
          token: this.apiKey,
        },
      });
      return response.data;
    } catch (error) {
      console.error(`[Finnhub] Failed to fetch quote for ${symbol}:`, error);
      throw new Error(`Failed to fetch quote for ${symbol}`);
    }
  }

  /**
   * 獲取股票 K 線資料
   * resolution: 1, 5, 15, 30, 60, D, W, M
   */
  async getCandles(
    symbol: string,
    resolution: string = "D",
    from: number,
    to: number
  ): Promise<CandelData> {
    try {
      const response = await this.client.get<CandelData>("/stock/candle", {
        params: {
          symbol: symbol.toUpperCase(),
          resolution,
          from,
          to,
          token: this.apiKey,
        },
      });
      return response.data;
    } catch (error) {
      console.error(`[Finnhub] Failed to fetch candles for ${symbol}:`, error);
      throw new Error(`Failed to fetch candles for ${symbol}`);
    }
  }

  /**
   * 獲取公司資訊
   */
  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    try {
      const response = await this.client.get<CompanyProfile>(
        "/stock/profile2",
        {
          params: {
            symbol: symbol.toUpperCase(),
            token: this.apiKey,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        `[Finnhub] Failed to fetch company profile for ${symbol}:`,
        error
      );
      throw new Error(`Failed to fetch company profile for ${symbol}`);
    }
  }
}

let finnhubClient: FinnhubClient | null = null;

export function getFinnhubClient(): FinnhubClient {
  if (!finnhubClient) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw new Error("FINNHUB_API_KEY environment variable is not set");
    }
    finnhubClient = new FinnhubClient(apiKey);
  }
  return finnhubClient;
}

export async function testFinnhubConnection(): Promise<boolean> {
  try {
    const client = getFinnhubClient();
    const quote = await client.getQuote("AAPL");
    return quote.c > 0;
  } catch (error) {
    console.error("[Finnhub] Connection test failed:", error);
    return false;
  }
}
