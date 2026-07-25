import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatDateYMD } from "../../../shared/date";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Plus, Trash2, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { useState } from "react";
import { StockChart } from "@/components/StockChart";
import { StreamingAnalysis } from "@/components/StreamingAnalysis";
import { StockInfoPanel } from "@/components/StockInfoPanel";
import { useStockQuote, useStockHistory } from "@/hooks/useStockData";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Market = "TW" | "US" | "HK";
const MARKETS: { value: Market; label: string }[] = [
  { value: "TW", label: "台股" },
  { value: "US", label: "美股" },
  { value: "HK", label: "港股" },
];
const marketLabel = (m?: string) =>
  MARKETS.find((x) => x.value === (m || "TW"))?.label ?? "台股";

interface WatchlistItem {
  id: number;
  symbol: string;
  market: string;
  addedAt: string;
  updatedAt: string;
}

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stockInput, setStockInput] = useState("");
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<Market>("TW");
  const [timeframe, setTimeframe] = useState("1Y");
  const [chartType, setChartType] = useState("line");

  const { data: watchlistData, isLoading: watchlistLoading, refetch: refetchWatchlist } = trpc.watchlist.list.useQuery();

  const addMutation = trpc.watchlist.add.useMutation({
    onSuccess: () => {
      refetchWatchlist();
      setStockInput("");
    },
    onError: (error) => {
      toast.error(`新增失敗: ${error.message}`);
    },
  });

  const removeMutation = trpc.watchlist.remove.useMutation({
    onSuccess: () => {
      refetchWatchlist();
      toast.success("股票已從追蹤清單移除");
    },
    onError: (error) => {
      toast.error(`移除失敗: ${error.message}`);
    },
  });

  const watchlist = (watchlistData as WatchlistItem[]) || [];
  const currentItem = watchlist.find(
    (s) => s.symbol === selectedStock && s.market === (selectedMarket || "TW")
  );
  const currentStock = selectedStock || watchlist[0]?.symbol || null;
  const currentMarket =
    currentItem?.market || watchlist[0]?.market || "TW";

  const { quote, isLoading: quoteLoading, error: quoteError } = useStockQuote(currentStock, currentMarket);
  const { data: chartData, isLoading: historyLoading, error: historyError } = useStockHistory(currentStock, currentMarket);

  const handleAddStock = async () => {
    if (stockInput.trim()) {
      const sym = stockInput.toUpperCase();
      await addMutation.mutateAsync({ symbol: sym, market: selectedMarket });
      setSelectedStock(sym);
      setSelectedMarket(selectedMarket);
    }
  };

  const handleRemoveStock = async (symbol: string) => {
    await removeMutation.mutateAsync({ symbol });
    if (selectedStock === symbol) {
      setSelectedStock(watchlist.length > 1 ? watchlist[0].symbol : null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden">
      <div
        className={`transition-all duration-300 ease-in-out flex flex-col border-r border-border ${
          sidebarOpen ? "w-64" : "w-0"
        } overflow-hidden`}
      >
        <div className="p-4 border-b border-border">
          <div className="section-head mb-4 text-sm">追蹤清單</div>
          <div className="flex gap-2">
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value as Market)}
              className="bg-input text-foreground border-border text-xs rounded px-2"
            >
              {MARKETS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <Input
              placeholder="股票代號..."
              value={stockInput}
              onChange={(e) => setStockInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAddStock()}
              className="bg-input text-foreground placeholder-muted-foreground border-border text-xs"
            />
            <Button
              onClick={handleAddStock}
              size="sm"
              disabled={addMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {watchlistLoading ? (
            <div className="text-xs text-muted-foreground p-2">[ 載入中... ]</div>
          ) : watchlist.length === 0 ? (
            <div className="text-xs text-muted-foreground p-2">[ 無追蹤股票 ]</div>
          ) : (
            watchlist.map((stock) => (
              <div
                key={`${stock.symbol}-${stock.market}`}
                onClick={() => {
                  setSelectedStock(stock.symbol);
                  setSelectedMarket((stock.market || "TW") as Market);
                }}
                className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                  selectedStock === stock.symbol && (stock.market || "TW") === currentMarket
                    ? "bg-card border-primary"
                    : "bg-transparent border-border hover:bg-card/50"
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-sm tracking-tight">
                    {stock.symbol}
                    <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                      {marketLabel(stock.market)}
                    </span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveStock(stock.symbol);
                    }}
                    disabled={removeMutation.isPending}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                {selectedStock === stock.symbol && quote && (
                  <>
                    <div className="tnum text-xs text-right text-muted-foreground">{quote.currentPrice.toFixed(2)}</div>
                    <div
                      className={`tnum text-xs font-semibold flex items-center justify-end gap-1 ${
                        quote.change >= 0 ? "text-chart-1" : "text-destructive"
                      }`}
                    >
                      {quote.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-primary hover:text-primary/80 transition-colors"
            >
              {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </button>
            {currentStock && quote ? (
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{currentStock}</h1>
                <p className="tnum text-xs text-muted-foreground">
                  {quote.currentPrice.toFixed(2)} {quote.change >= 0 ? "+" : ""}
                  {quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                </p>
              </div>
            ) : (
              <div className="text-muted-foreground">[ 請從左側選擇或新增股票 ]</div>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            [ {formatDateYMD(new Date())} ]
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {!currentStock ? (
            <Card className="bg-card border-border p-10 text-center">
              <div className="brand-glow text-foreground text-xl font-bold mb-2 tracking-tight">股市追蹤儀表板</div>
              <p className="text-muted-foreground">請在左側新增股票代號以開始追蹤，或點選既有的自選股。</p>
            </Card>
          ) : (
          <>
          {(quoteError || historyError) && (
            <Card className="bg-destructive/10 border-destructive p-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">{quoteError || historyError}</span>
              </div>
            </Card>
          )}

          <Card className="bg-card border-border p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="section-head">股價走勢</h2>
              <div className="flex gap-2">
                <Tabs value={timeframe} onValueChange={setTimeframe} className="w-auto">
                  <TabsList className="bg-input border-border">
                    {["1D", "1W", "1M", "3M", "1Y"].map((tf) => (
                      <TabsTrigger key={tf} value={tf} className="text-xs">
                        {tf}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <Tabs value={chartType} onValueChange={setChartType} className="w-auto">
                  <TabsList className="bg-input border-border">
                    <TabsTrigger value="line" className="text-xs">
                      折線
                    </TabsTrigger>
                    <TabsTrigger value="candlestick" className="text-xs">
                      K線
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
            <StockChart
              data={chartData}
              symbol={currentStock}
              chartType={chartType as "line" | "candlestick"}
              timeframe={timeframe}
              isLoading={historyLoading}
            />
          </Card>

          {quote && (
            <Card className="bg-card border-border p-4">
              <h2 className="section-head mb-4">基本資料</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "開盤價", value: quote.open.toFixed(2) },
                  { label: "收盤價", value: quote.currentPrice.toFixed(2) },
                  { label: "最高價", value: quote.high.toFixed(2) },
                  { label: "最低價", value: quote.low.toFixed(2) },
                ].map((item) => (
                  <div key={item.label} className="border border-border rounded-lg p-3 bg-background">
                    <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                    <div className="tnum text-lg font-semibold text-foreground text-right">{item.value}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {currentStock && (
            <StockInfoPanel symbol={currentStock} market={currentMarket} />
          )}

          <StreamingAnalysis symbol={currentStock} market={currentMarket} />
          </>
          )}
        </div>
      </div>
    </div>
  );
}
