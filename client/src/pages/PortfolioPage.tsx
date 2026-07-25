import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Trash2, RefreshCw, Wallet, Plus, Lock } from "lucide-react";

const fmt = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("zh-TW", { maximumFractionDigits: digits, minimumFractionDigits: digits });

const PW_KEY = "portfolio_pw";

export default function PortfolioPage() {
  // 密碼閘：sessionStorage 記住本分頁的已驗證密碼（關閉分頁即失效）
  const [password, setPassword] = useState<string | null>(() => sessionStorage.getItem(PW_KEY));
  if (!password) {
    return <PasswordGate onUnlock={(pw) => { sessionStorage.setItem(PW_KEY, pw); setPassword(pw); }} />;
  }
  return <PortfolioContent password={password} onAuthFail={() => { sessionStorage.removeItem(PW_KEY); setPassword(null); }} />;
}

function PasswordGate({ onUnlock }: { onUnlock: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const authMut = trpc.holdings.auth.useMutation({
    onSuccess: (res, vars) => {
      if (res.ok) onUnlock(vars.password);
      else toast.error("密碼錯誤");
    },
    onError: () => toast.error("驗證失敗，請稍後再試"),
  });
  const submit = () => {
    if (!pw) return toast.error("請輸入密碼");
    authMut.mutate({ password: pw });
  };
  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <Card className="bg-card border-border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold">我的庫存 — 需要密碼</h1>
        </div>
        <p className="text-sm text-muted-foreground">此頁包含個人持股資料，請輸入存取密碼。</p>
        <div className="flex gap-2">
          <Input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="密碼"
            autoFocus
          />
          <Button onClick={submit} disabled={authMut.isPending}>
            {authMut.isPending ? "驗證中..." : "解鎖"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function PortfolioContent({ password, onAuthFail }: { password: string; onAuthFail: () => void }) {
  const utils = trpc.useUtils();
  const handleAuthError = (e: { message: string; data?: { code?: string } | null }) => {
    if (e.data?.code === "UNAUTHORIZED") {
      toast.error("密碼已失效，請重新輸入");
      onAuthFail();
      return true;
    }
    return false;
  };
  const { data: holdings, isLoading, isFetching, refetch } = trpc.holdings.list.useQuery(
    { password },
    { staleTime: 60 * 1000, retry: false }
  );

  const upsertMut = trpc.holdings.upsert.useMutation({
    onSuccess: () => {
      toast.success("持股已儲存");
      utils.holdings.list.invalidate();
      setSymbol(""); setLots(""); setAvgCost("");
    },
    onError: (e) => { if (!handleAuthError(e)) toast.error(`儲存失敗：${e.message}`); },
  });
  const removeMut = trpc.holdings.remove.useMutation({
    onSuccess: () => {
      toast.success("已刪除");
      utils.holdings.list.invalidate();
    },
    onError: (e) => { if (!handleAuthError(e)) toast.error(`刪除失敗：${e.message}`); },
  });

  const [symbol, setSymbol] = useState("");
  const [lots, setLots] = useState("");       // 以「張」輸入（台股習慣），可小數（零股）
  const [avgCost, setAvgCost] = useState("");

  const submit = () => {
    const sym = symbol.trim().toUpperCase();
    const lotsN = Number(lots);
    const costN = Number(avgCost);
    if (!sym) return toast.error("請輸入股票代號");
    if (!lotsN || lotsN <= 0) return toast.error("請輸入正確的張數（可小數，如 0.5 = 500 股）");
    if (isNaN(costN) || costN < 0) return toast.error("請輸入平均成本（每股）");
    upsertMut.mutate({ password, symbol: sym, shares: Math.round(lotsN * 1000), avgCost: costN });
  };

  // 總覽統計
  const total = (holdings ?? []).reduce(
    (acc, h) => {
      acc.cost += h.cost;
      if (h.marketValue != null) {
        acc.value += h.marketValue;
        acc.pricedCost += h.cost;
      }
      return acc;
    },
    { cost: 0, value: 0, pricedCost: 0 }
  );
  const totalPnl = total.value - total.pricedCost;
  const totalPnlPct = total.pricedCost > 0 ? (totalPnl / total.pricedCost) * 100 : 0;
  const pnlColor = (v: number | null | undefined) =>
    v == null ? "text-muted-foreground" : v >= 0 ? "text-chart-1" : "text-destructive";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Wallet className="w-5 h-5" /> 我的庫存
        </h1>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          更新報價
        </Button>
      </div>

      {/* 總覽 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "總成本", value: fmt(total.cost) },
          { label: "總市值", value: fmt(total.value) },
          { label: "未實現損益", value: (totalPnl >= 0 ? "+" : "") + fmt(totalPnl), color: pnlColor(totalPnl) },
          { label: "報酬率", value: (totalPnlPct >= 0 ? "+" : "") + totalPnlPct.toFixed(2) + "%", color: pnlColor(totalPnl) },
        ].map((it) => (
          <Card key={it.label} className="bg-card border-border p-4">
            <div className="text-xs text-muted-foreground mb-1">{it.label}</div>
            <div className={`text-xl font-bold ${it.color ?? "text-primary"}`}>{it.value}</div>
          </Card>
        ))}
      </div>

      {/* 新增 / 更新持股 */}
      <Card className="bg-card border-border p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> 新增 / 更新持股（同代號會覆寫）
        </h2>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <div className="text-xs text-muted-foreground mb-1">代號（2330 / AAPL / 0700.HK）</div>
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="2330" className="w-40" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">張數（0.5 = 500 股）</div>
            <Input value={lots} onChange={(e) => setLots(e.target.value)} placeholder="1" type="number" step="0.001" className="w-32" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">平均成本（每股）</div>
            <Input value={avgCost} onChange={(e) => setAvgCost(e.target.value)} placeholder="600" type="number" step="0.01" className="w-32" />
          </div>
          <Button onClick={submit} disabled={upsertMut.isPending}>
            {upsertMut.isPending ? "儲存中..." : "儲存"}
          </Button>
        </div>
      </Card>

      {/* 持股明細 */}
      <Card className="bg-card border-border p-4">
        <h2 className="text-sm font-semibold mb-3">持股明細</h2>
        {isLoading ? (
          <div className="text-muted-foreground text-sm">[ 載入中... ]</div>
        ) : !holdings || holdings.length === 0 ? (
          <div className="text-muted-foreground text-sm">尚無持股，請在上方輸入你的第一筆持股。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left py-2 pr-3">代號</th>
                  <th className="text-right py-2 px-3">股數</th>
                  <th className="text-right py-2 px-3">平均成本</th>
                  <th className="text-right py-2 px-3">現價</th>
                  <th className="text-right py-2 px-3">成本</th>
                  <th className="text-right py-2 px-3">市值</th>
                  <th className="text-right py-2 px-3">損益</th>
                  <th className="text-right py-2 px-3">報酬率</th>
                  <th className="py-2 pl-3"></th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.symbol} className="border-b border-border/50 hover:bg-accent/10">
                    <td className="py-2 pr-3 font-semibold">
                      {h.symbol}
                      <span className="ml-1.5 text-[10px] text-muted-foreground">{h.market}</span>
                    </td>
                    <td className="text-right py-2 px-3 font-mono">{fmt(h.shares)}</td>
                    <td className="text-right py-2 px-3 font-mono">{fmt(h.avgCost, 2)}</td>
                    <td className="text-right py-2 px-3 font-mono">{h.currentPrice != null ? fmt(h.currentPrice, 2) : "—"}</td>
                    <td className="text-right py-2 px-3 font-mono">{fmt(h.cost)}</td>
                    <td className="text-right py-2 px-3 font-mono">{fmt(h.marketValue)}</td>
                    <td className={`text-right py-2 px-3 font-mono font-semibold ${pnlColor(h.pnl)}`}>
                      {h.pnl != null ? (h.pnl >= 0 ? "+" : "") + fmt(h.pnl) : "—"}
                    </td>
                    <td className={`text-right py-2 px-3 font-mono font-semibold ${pnlColor(h.pnl)}`}>
                      {h.pnlPct != null ? (h.pnlPct >= 0 ? "+" : "") + h.pnlPct.toFixed(2) + "%" : "—"}
                    </td>
                    <td className="py-2 pl-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm(`確定刪除 ${h.symbol}？`)) removeMut.mutate({ password, symbol: h.symbol });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-[11px] text-muted-foreground">
          持股資料為手動輸入（存於伺服器 R2）。現價來源：台股 = 證交所即時；美/港股 = Yahoo Finance。損益未含手續費與證交稅。
        </div>
      </Card>
    </div>
  );
}
