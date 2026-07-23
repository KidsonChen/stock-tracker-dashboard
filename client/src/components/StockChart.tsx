import { useMemo, useState, useCallback, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

// 日期格式化
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
};

// 成交量格式化
const formatVolume = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toString();
};

// 西元年格式化（資料本身已是西元 YYYY/MM/DD 或 YYYY-MM-DD，直接輸出西元）
const formatWesternDate = (dateStr: string) => formatDate(dateStr);

export function StockChart({ data, symbol, chartType, timeframe, isLoading }: StockChartProps) {
  const [selectedMAs, setSelectedMAs] = useState<number[]>([5, 20]);
  const [chartRef, setChartRef] = useState<ReactECharts | null>(null);

  // 根據時段過濾資料（改用「交易日數」slice，避免時區/盤後導致時間視窗算錯而空白）
  const filteredData = useMemo(() => {
    if (!data.length) return [];
    // K 線圖至少需要 2 根才能正確呈現（否則 ECharts 會退化成單根怪線）。
    // 若切到 K 線但當前時段過濾後只剩 1 筆（例如 1D 只有一根日 K），
    // 直接退回全部資料，保證 K 線可視。
    const minForCandle = chartType === "candlestick" ? 2 : 1;

    // 各時段對應的交易日數（data 已由舊到新排序）
    const dayCount: Record<string, number> = {
      "1D": 1,
      "1W": 5,
      "1M": 22,
      "3M": 66,
      "1Y": 250,
    };
    const n = dayCount[timeframe] ?? data.length;
    const sliced = data.slice(-n);
    return sliced.length >= minForCandle ? sliced : data;
  }, [data, timeframe, chartType]);

  // 計算均線
  const maDataMap = useMemo(() => {
    const map: Record<number, (number | null)[]> = {};
    for (const period of selectedMAs) {
      const maResult = calculateSMA(filteredData, period);
      map[period] = maResult.map((item) => item.ma ?? null);
    }
    return map;
  }, [filteredData, selectedMAs]);

  // 處理圖表資料
  const chartData = useMemo(() => {
    return filteredData.map((candle) => ({
      ...candle,
      isBullish: candle.close >= candle.open,
    }));
  }, [filteredData]);

  // 計算價格範圍
  const priceExtent = useMemo(() => {
    if (!chartData.length) return { min: 0, max: 100 };
    const prices = chartData.flatMap((d) => [d.high, d.low]);
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  }, [chartData]);

  // 均線開關
  const toggleMA = (period: number) => {
    setSelectedMAs((prev) =>
      prev.includes(period)
        ? prev.filter((p) => p !== period)
        : [...prev, period].sort((a, b) => a - b)
    );
  };

  // ECharts 選項
  const getOption = useCallback((): echarts.EChartsOption => {
    const showCandlestick = chartType === "candlestick";

    // 準備 K 線資料 [open, close, lowest, highest]
    const candlestickData = chartData.map((d) => [
      d.open,
      d.close,
      d.low,
      d.high,
    ]);

    // 準備成交量資料
    const volumeData = chartData.map((d, index) => ({
      value: d.volume,
      itemStyle: {
        color: d.isBullish ? "#22c55e" : "#ef4444",
      },
    }));

    // 準備 X 軸資料
    const categoryData = chartData.map((d) => formatWesternDate(d.date));

    // 均線系列
    const maSeries = selectedMAs.map((period) => ({
      name: `MA${period}`,
      type: "line" as const,
      data: maDataMap[period],
      smooth: true,
      symbol: "none",
      lineStyle: {
        color: getMAColor(period),
        width: 1.5,
        type: "dashed" as const,
      },
      z: 10,
    }));

    // 價格線系列 (折線圖模式)
    const lineSeries = [
      {
        name: "收盤價",
        type: "line" as const,
        data: chartData.map((d) => d.close),
        smooth: true,
        symbol: "none",
        lineStyle: {
          color: "oklch(0.8 0.3 150)",
          width: 2,
        },
        z: 10,
      },
    ];

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis" as const,
        axisPointer: {
          type: "cross" as const,
          label: {
            backgroundColor: "#6a7985",
          },
        },
        backgroundColor: "oklch(0.12 0.02 260)",
        borderColor: "oklch(0.2 0.03 260)",
        borderWidth: 1,
        textStyle: {
          color: "oklch(0.8 0.08 150)",
        },
        formatter: (params: any) => {
          if (!params.length) return "";

          const dateIndex = params[0].dataIndex;
          const item = chartData[dateIndex];
          if (!item) return "";

          let content = `<div style="font-weight: bold; margin-bottom: 8px;">${formatWesternDate(item.date)}</div>`;

          if (showCandlestick) {
            content += `
              <div style="display: flex; justify-content: space-between; gap: 16px;">
                <span>開盤:</span>
                <span style="color: ${item.isBullish ? "#22c55e" : "#ef4444"}">$${item.open.toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px;">
                <span>收盤:</span>
                <span style="color: ${item.isBullish ? "#22c55e" : "#ef4444"}">$${item.close.toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px;">
                <span>最高:</span>
                <span style="color: #22c55e">$${item.high.toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px;">
                <span>最低:</span>
                <span style="color: #ef4444">$${item.low.toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 4px;">
                <span>成交量:</span>
                <span>${item.volume.toLocaleString()}</span>
              </div>
            `;
          } else {
            content += `
              <div style="display: flex; justify-content: space-between; gap: 16px;">
                <span>價格:</span>
                <span>$${item.close.toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 16px;">
                <span>成交量:</span>
                <span>${item.volume.toLocaleString()}</span>
              </div>
            `;
          }

          return content;
        },
      },
      grid: [
        {
          left: "10%",
          right: "5%",
          height: "55%",
          top: "5%",
        },
        {
          left: "10%",
          right: "5%",
          top: "68%",
          height: "22%",
        },
      ],
      xAxis: [
        {
          type: "category" as const,
          data: categoryData,
          boundaryGap: false,
          axisLine: { lineStyle: { color: "oklch(0.6 0.04 150)" } },
          axisLabel: { color: "oklch(0.6 0.04 150)", fontSize: 11 },
          splitLine: { show: false },
        },
        {
          type: "category" as const,
          data: categoryData,
          boundaryGap: false,
          gridIndex: 1,
          axisLine: { lineStyle: { color: "oklch(0.6 0.04 150)" } },
          axisLabel: { color: "oklch(0.6 0.04 150)", fontSize: 11 },
          splitLine: { show: false },
        },
      ],
      yAxis: [
        {
          scale: true,
          splitArea: { show: true },
          axisLine: { lineStyle: { color: "oklch(0.6 0.04 150)" } },
          axisLabel: {
            color: "oklch(0.6 0.04 150)",
            fontSize: 11,
            formatter: (value: number) => `$${value.toFixed(0)}`,
          },
          splitLine: { lineStyle: { color: "oklch(0.2 0.03 260)", type: "dashed" } },
        },
        {
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisLine: { lineStyle: { color: "oklch(0.6 0.04 150)" } },
          axisLabel: {
            color: "oklch(0.6 0.04 150)",
            fontSize: 10,
            formatter: (value: number) => formatVolume(value),
          },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        {
          type: "slider" as const,
          xAxisIndex: [0, 1],
          start: 0,
          end: 100,
          bottom: 5,
          height: 15,
          borderColor: "oklch(0.2 0.03 260)",
          fillerColor: "rgba(34, 197, 94, 0.2)",
          handleStyle: {
            color: "#22c55e",
          },
          textStyle: {
            color: "oklch(0.6 0.04 150)",
          },
        },
        {
          type: "inside" as const,
          xAxisIndex: [0, 1],
          start: 0,
          end: 100,
        },
      ],
      series: [
        ...(showCandlestick
          ? [
              {
                name: "K線",
                type: "candlestick" as const,
                data: candlestickData,
                itemStyle: {
                  color: "#22c55e",
                  color0: "#ef4444",
                  borderColor: "#22c55e",
                  borderColor0: "#ef4444",
                },
                z: 5,
              },
            ]
          : lineSeries),
        ...maSeries,
        {
          name: "成交量",
          type: "bar" as const,
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumeData,
          z: 5,
        },
      ],
    };
  }, [chartData, chartType, maDataMap, selectedMAs]);

  // 初始化 ECharts 主題
  useEffect(() => {
    if (chartRef?.getEchartsInstance()) {
      const chart = chartRef.getEchartsInstance();
      chart.setOption({
        color: ["#22c55e", "#ef4444"],
      });
    }
  }, [chartRef]);

  if (isLoading) {
    return (
      <Card className="bg-card border-border p-4">
        <div className="h-[500px] bg-background rounded border border-border flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="text-sm">[ 圖表資料載入中... ]</div>
          </div>
        </div>
      </Card>
    );
  }

  if (!filteredData || filteredData.length === 0) {
    return (
      <Card className="bg-card border-border p-4">
        <div className="h-[500px] bg-background rounded border border-border flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="text-sm">[ 無可用資料 ]</div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border p-4">
      {/* 均線選擇器 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground mr-2">[ 均線 ]</span>
        {MA_PERIODS.map((period) => (
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
      <div className="h-[500px]">
        <ReactECharts
          ref={(e) => setChartRef(e)}
          option={getOption()}
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" as const }}
        />
      </div>
    </Card>
  );
}