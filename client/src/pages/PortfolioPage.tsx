import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Trash2, Wallet, RefreshCw, Lock, TrendingUp, TrendingDown, Layers } from "lucide-react";

const PW_KEY = "portfolio_pw";

const fmtMoney = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("zh-TW", { maximumFractionDigits: digits });

const pnlColor = (v: number | null | undefined) =>
  v == null ? "text-muted-foreground" : v >= 0 ? "text-destructive" : "text-chart-1";
// 台股習慣：紅漲綠跌

const pnlText = (v: number | null | undefined, digits = 0, suffix = "") =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toLocaleString("zh-TW", { maximumFractionDigits: digits })}${suffix}`;

const todayStr = () => new Date().toISOString().slice(0, 10);

interface HoldingRow {
  id: number;
  symbol: string;
  market: string;
  shares: number;
  avgCost: number;
  buyDate: string;
  note?: string;
  currentPrice: number | null;
  cost: number;
  marketValue: number | null;
  pnl: number | null;
  pnlPct: number | null;
}

export default function PortfolioPage() {
  const [password, setPassword] = useState<string>(() => sessionStorage.getItem(PW_KEY) || "");
  const [unlocked, setUnlocked] = useState<boolean>(() => !!sessionStorage.getItem(PW_KEY));

  return (
    <div className="container py-6">
      <div className="flex items-center gap-2 mb-6">
        <Wallet className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">我的庫存</h1>
      </div>
      {!unlocked ? (
        <PasswordGate
          onUnlock={(pw) => {
            sessionStorage.setItem(PW_KEY, pw);
            setPassword(pw);
            setUnlocked(true);
          }}
        />
      ) : (
        <PortfolioContent
          password={password}
          onAuthFail={() => {
            sessionStorage.removeItem(PW_KEY);
            setPassword("");
            setUnlocked(false);
          }}
        />
      )}
    </div>
  );
}

function PasswordGate({ onUnlock }: { onUnlock: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const authMut = trpc.holdings.auth.useMutation({
    onSuccess: (res, vars) => {
      if (res.ok) onUnlock(vars.password);
      else setErr("密碼錯誤");
    },
    onError: () => setErr("驗證失敗，請重試"),
  });

  return (
    <Card className="max-w-sm mx-auto bg-card border-border p-6">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Lock className="h-5 w-5 text-primary" />
        </div>
        <div className="text-sm text-muted-foreground">庫存頁受密碼保護，請輸入密碼解鎖</div>
        <form
          className="w-full flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            if (pw) authMut.mutate({ password: pw });
          }}
        >
          <Input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="輸入密碼"
            className="flex-1"
            autoFocus
          />
          <Button type="submit" disabled={authMut.isPending || !pw}>
            {authMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "解鎖"}
          </Button>
        </form>
        {err && <div className="text-xs text-destructive">{err}</div>}
      </div>
    </Card>
  );
}

function PortfolioContent({ password, onAuthFail }: { password: string; onAuthFail: () => void }) {
  const utils = trpc.useUtils();
  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState("TW");
  const [lots, setLots] = useState("");
  const [cost, setCost] = useState("");
  const [buyDate, setBuyDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isRefetching } = trpc.holdings.list.useQuery(
    { password },
    {
      staleTime: 60 * 1000,
      retry: (count, err: any) => err?.data?.code !== "UNAUTHORIZED" && count < 2,
    }
  );

  // 密碼失效 → 回到密碼閘
  if ((error as any)?.data?.code === "UNAUTHORIZED") {
    onAuthFail();
    return null;
  }

  const addMut = trpc.holdings.add.useMutation({
    onSuccess: () => {
      utils.holdings.list.invalidate();
      setSymbol("");
      setLots("");
      setCost("");
      setNote("");
      setFormErr(null);
    },
    onError: (e: any) => {
      if (e?.data?.code === "UNAUTHORIZED") onAuthFail();
      else setFormErr(e.message || "新增失敗");
    },
  });
  const removeMut = trpc.holdings.remove.useMutation({
    onSuccess: () => utils.holdings.list.invalidate(),
    onError: (e: any) => {
      if (e?.data?.code === "UNAUTHORIZED") onAuthFail();
    },
  });

  const rows = (data as HoldingRow[] | undefined) || [];

  // ── 總覽 & 分股票彙總 ──
  const { totals, bySymbol } = useMemo(() => {
    let totalCost = 0;
    let totalMV = 0;
    let mvKnown = true;
    const map = new Map<string, { symbol: string; market: string; shares: number; cost: number; marketValue: number | null; currentPrice: number | null; lots: number }>();
    for (const r of rows) {
      totalCost += r.cost;
      if (r.marketValue == null) mvKnown = false;
      else totalMV += r.marketValue;
      const g = map.get(r.symbol) || { symbol: r.symbol, market: r.market, shares: 0, cost: 0, marketValue: 0 as number | null, currentPrice: r.currentPrice, lots: 0 };
      g.shares += r.shares;
      g.cost += r.cost;
      g.lots += 1;
      if (g.marketValue != null && r.marketValue != null) g.marketValue = (g.marketValue || 0) + r.marketValue;
      else g.marketValue = null;
      if (r.currentPrice != null) g.currentPrice = r.currentPrice;
      map.set(r.symbol, g);
    }
    const bySymbol = Array.from(map.values()).sort((a, b) => (b.marketValue ?? b.cost) - (a.marketValue ?? a.cost));
    return {
      totals: {
        cost: totalCost,
        marketValue: mvKnown && rows.length ? totalMV : rows.length ? null : 0,
        pnl: mvKnown && rows.length ? totalMV - totalCost : null,
        pnlPct: mvKnown && totalCost > 0 ? ((totalMV - totalCost) / totalCost) * 100 : null,
        symbols: map.size,
        lots: rows.length,
      },
      bySymbol,
    };
  }, [rows]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const s = symbol.trim().toUpperCase();
    const l = parseFloat(lots);
    const c = parseFloat(cost);
    if (!s) return setFormErr("請輸入股票代號");
    if (!(l > 0)) return setFormErr("張數需大於 0（可輸入小數，0.5 = 500 股）");
    if (!(c >= 0)) return setFormErr("請輸入買入成本（每股）");
    if (!buyDate) return setFormErr("請選擇買入日期");
    addMut.mutate({
      password,
      symbol: s,
      market,
      shares: l * 1000,
      avgCost: c,
      buyDate,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* ══ 總覽卡 ══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border p-4">
          <div className="text-[11px] text-muted-foreground mb-1">總成本</div>
          <div className="text-xl font-bold tnum">{fmtMoney(totals.cost)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{totals.symbols} 檔 · {totals.lots} 筆</div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="text-[11px] text-muted-foreground mb-1">總市值</div>
          <div className="text-xl font-bold tnum">{fmtMoney(totals.marketValue)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">依即時報價</div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="text-[11px] text-muted-foreground mb-1">未實現損益</div>
          <div className={`text-xl font-bold tnum flex items-center gap-1 ${pnlColor(totals.pnl)}`}>
            {totals.pnl != null && (totals.pnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />)}
            {pnlText(totals.pnl)}
          </div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="text-[11px] text-muted-foreground mb-1">總報酬率</div>
          <div className={`text-xl font-bold tnum ${pnlColor(totals.pnlPct)}`}>{pnlText(totals.pnlPct, 2, "%")}</div>
        </Card>
      </div>

      {/* ══ 新增一筆買入 ══ */}
      <Card className="bg-card border-border p-4">
        <h2 className="section-head mb-3">新增買入紀錄</h2>
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">市場</label>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="TW">台股</option>
              <option value="US">美股</option>
              <option value="HK">港股</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">代號</label>
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="2330 / AAPL" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">張數</label>
            <Input type="number" step="any" min="0" value={lots} onChange={(e) => setLots(e.target.value)} placeholder="1 = 1000股" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">買入成本/股</label>
            <Input type="number" step="any" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="每股價格" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">買入日期</label>
            <Input type="date" value={buyDate} max={todayStr()} onChange={(e) => setBuyDate(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">備註（選填）</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：定期定額" />
          </div>
          <Button type="submit" disabled={addMut.isPending} className="h-9">
            {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />新增</>}
          </Button>
        </form>
        {formErr && <div className="mt-2 text-xs text-destructive">{formErr}</div>}
        <div className="mt-2 text-[11px] text-muted-foreground">
          同一檔股票可新增多筆（分批買入），系統會自動加總持股與平均成本。
        </div>
      </Card>

      {/* ══ 持股彙總（依股票加總）══ */}
      <Card className="bg-card border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-head">持股彙總</h2>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRefetching ? "animate-spin" : ""}`} />
            更新報價
          </Button>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />抓取即時報價中…
          </div>
        ) : bySymbol.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">尚無持股，從上方新增第一筆買入紀錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground border-b border-border">
                  <th className="text-left py-2 pr-2 font-normal">代號</th>
                  <th className="text-right py-2 px-2 font-normal">持股</th>
                  <th className="text-right py-2 px-2 font-normal">平均成本</th>
                  <th className="text-right py-2 px-2 font-normal">現價</th>
                  <th className="text-right py-2 px-2 font-normal">總成本</th>
                  <th className="text-right py-2 px-2 font-normal">市值</th>
                  <th className="text-right py-2 px-2 font-normal">損益</th>
                  <th className="text-right py-2 pl-2 font-normal">報酬率</th>
                </tr>
              </thead>
              <tbody>
                {bySymbol.map((g) => {
                  const avg = g.shares > 0 ? g.cost / g.shares : 0;
                  const pnl = g.marketValue != null ? g.marketValue - g.cost : null;
                  const pnlPct = pnl != null && g.cost > 0 ? (pnl / g.cost) * 100 : null;
                  return (
                    <tr key={g.symbol} className="border-b border-border/50 hover:bg-background/60 transition-colors">
                      <td className="py-2.5 pr-2">
                        <span className="font-semibold text-primary">{g.symbol}</span>
                        <span className="ml-1.5 text-[10px] text-muted-foreground">{g.market === "TW" ? "台股" : g.market === "HK" ? "港股" : "美股"}</span>
                        {g.lots > 1 && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-accent-foreground bg-accent/20 border border-accent/40 rounded px-1">
                            <Layers className="h-2.5 w-2.5" />{g.lots} 筆
                          </span>
                        )}
                      </td>
                      <td className="text-right py-2.5 px-2 tnum">{(g.shares / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 3 })} 張</td>
                      <td className="text-right py-2.5 px-2 tnum">{avg.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}</td>
                      <td className="text-right py-2.5 px-2 tnum">{g.currentPrice != null ? g.currentPrice.toLocaleString("zh-TW", { maximumFractionDigits: 2 }) : "—"}</td>
                      <td className="text-right py-2.5 px-2 tnum">{fmtMoney(g.cost)}</td>
                      <td className="text-right py-2.5 px-2 tnum">{fmtMoney(g.marketValue)}</td>
                      <td className={`text-right py-2.5 px-2 tnum font-semibold ${pnlColor(pnl)}`}>{pnlText(pnl)}</td>
                      <td className={`text-right py-2.5 pl-2 tnum font-semibold ${pnlColor(pnlPct)}`}>{pnlText(pnlPct, 2, "%")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ══ 買入明細（新→舊）══ */}
      <Card className="bg-card border-border p-4">
        <h2 className="section-head mb-3">買入明細</h2>
        {isLoading ? null : rows.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-6">尚無紀錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground border-b border-border">
                  <th className="text-left py-2 pr-2 font-normal">買入日期</th>
                  <th className="text-left py-2 px-2 font-normal">代號</th>
                  <th className="text-right py-2 px-2 font-normal">張數</th>
                  <th className="text-right py-2 px-2 font-normal">買入成本/股</th>
                  <th className="text-right py-2 px-2 font-normal">成本</th>
                  <th className="text-right py-2 px-2 font-normal">損益</th>
                  <th className="text-left py-2 px-2 font-normal">備註</th>
                  <th className="py-2 pl-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id} className="border-b border-border/50 hover:bg-background/60 transition-colors">
                    <td className="py-2 pr-2 tnum text-muted-foreground">{h.buyDate}</td>
                    <td className="py-2 px-2 font-semibold text-primary">{h.symbol}</td>
                    <td className="text-right py-2 px-2 tnum">{(h.shares / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 3 })}</td>
                    <td className="text-right py-2 px-2 tnum">{h.avgCost.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}</td>
                    <td className="text-right py-2 px-2 tnum">{fmtMoney(h.cost)}</td>
                    <td className={`text-right py-2 px-2 tnum ${pnlColor(h.pnl)}`}>{pnlText(h.pnl)}</td>
                    <td className="py-2 px-2 text-xs text-muted-foreground max-w-[10rem] truncate">{h.note || ""}</td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`確定刪除 ${h.buyDate} 買入的 ${h.symbol}（${h.shares / 1000} 張）？`))
                            removeMut.mutate({ password, id: h.id });
                        }}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="刪除這筆"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-[11px] text-muted-foreground">
          依買入日期新→舊排序。刪除只會移除該筆紀錄，不影響同股票的其他買入。
        </div>
      </Card>
    </div>
  );
}
