import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { calculateSMA, getMAColor } from "@/lib/ma-calculator";

interface ChartData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockChartProps {
  data: ChartData[];
  symbol: string;
  chartType: "line" | "candlestick";
  timeframe: string;
  isLoading?: boolean;
}

const MA_PERIODS = [5, 10, 20, 50, 200];

export function StockChart({ data, symbol, chartType, timeframe, isLoading }: StockChartProps) {
  const [selectedMAs, setSelectedMAs] = useState<number[]>([5, 20]);

  if (isLoading) {
    return (
      <Card className="bg-card border-border p-4">
        <div className="h-64 bg-background rounded border border-border flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="text-sm">[ 圖表資料載入中... ]</div>
          </div>
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="bg-card border-border p-4">
        <div className="h-64 bg-background rounded border border-border flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="text-sm">[ 無可用資料 ]</div>
          </div>
        </div>
      </Card>
    );
  }

  // 計算均線資料
  const maDataMap: Record<number, any[]> = {};
  for (const period of selectedMAs) {
    const maData = calculateSMA(data, period);
    maDataMap[period] = maData;
  }

  // 合併圖表資料
  const chartData = data.map((candle, index) => ({
    ...candle,
    ...Object.fromEntries(
      selectedMAs.map(period => [`MA${period}`, maDataMap[period][index]?.ma])
    ),
  }));

  const toggleMA = (period: number) => {
    setSelectedMAs(prev =>
      prev.includes(period)
        ? prev.filter(p => p !== period)
        : [...prev, period].sort((a, b) => a - b)
    );
  };

  return (
    <Card className="bg-card border-border p-4">
      {/* 均線選擇器 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground mr-2">[ 均線 ]</span>
        {MA_PERIODS.map(period => (
          <Button
            key={period}
            size="sm"
            variant={selectedMAs.includes(period) ? "default" : "outline"}
            onClick={() => toggleMA(period)}
            className={selectedMAs.includes(period) ? "bg-green-500 text-black hover:bg-green-600" : ""}
          >
            MA{period}
          </Button>
        ))}
      </div>

      {/* 圖表 */}
      <div className="h-64">
        {chartType === "line" ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.2 0.03 260)" />
              <XAxis dataKey="date" stroke="oklch(0.6 0.04 150)" style={{ fontSize: "12px" }} />
              <YAxis stroke="oklch(0.6 0.04 150)" style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.12 0.02 260)",
                  border: "1px solid oklch(0.2 0.03 260)",
                  borderRadius: "4px",
                }}
                labelStyle={{ color: "oklch(0.8 0.08 150)" }}
              />
              {/* 收盤價線 */}
              <Line
                type="monotone"
                dataKey="close"
                stroke="oklch(0.8 0.3 150)"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              {/* 均線 */}
              {selectedMAs.map(period => (
                <Line
                  key={`MA${period}`}
                  type="monotone"
                  dataKey={`MA${period}`}
                  stroke={getMAColor(period)}
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  strokeDasharray="5 5"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.2 0.03 260)" />
              <XAxis dataKey="date" stroke="oklch(0.6 0.04 150)" style={{ fontSize: "12px" }} />
              <YAxis stroke="oklch(0.6 0.04 150)" style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.12 0.02 260)",
                  border: "1px solid oklch(0.2 0.03 260)",
                  borderRadius: "4px",
                }}
                labelStyle={{ color: "oklch(0.8 0.08 150)" }}
              />
              <Bar dataKey="volume" fill="oklch(0.65 0.25 160)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
