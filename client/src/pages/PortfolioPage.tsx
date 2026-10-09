import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { computePortfolio, estimateFee } from "@shared/portfolio";
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

interface TxRow {
  id: number;
  symbol: string;
  market: string;
  type: "buy" | "sell";
  shares: number;
  avgCost: number; // 成交單價（買＝買價、賣＝賣價）
  fee: number; // 該筆手續費
  fromLotId?: number; // 賣出：引用的買入批次 id
  buyDate: string;
  note?: string;
  currentPrice: number | null;
  remaining: number | null; // 買入批次剩餘股數
  perShareCost: number | null; // 含手續費均攤的每股成本（買入批次）
  realizedPnl: number | null; // 賣出已實現損益
  cost: number | null; // 剩餘成本基礎
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
  // 買入表單
  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState("TW");
  const [lots, setLots] = useState("");
  const [cost, setCost] = useState("");
  const [buyFee, setBuyFee] = useState("");
  const [buyFeeDirty, setBuyFeeDirty] = useState(false); // 手動改過手續費 → 停止自動預填
  const [buyDate, setBuyDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  // 賣出表單
  const [selLotId, setSelLotId] = useState("");
  const [sellLots, setSellLots] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellFee, setSellFee] = useState("");
  const [sellFeeDirty, setSellFeeDirty] = useState(false);
  const [sellDate, setSellDate] = useState(todayStr());
  const [sellNote, setSellNote] = useState("");
  const [sellErr, setSellErr] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isRefetching } = trpc.holdings.list.useQuery(
    { password },
    {
      staleTime: 60 * 1000,
      retry: (count, err: any) => err?.data?.code !== "UNAUTHORIZED" && count < 2,
    }
  );

  const addMut = trpc.holdings.add.useMutation({
    onSuccess: () => {
      utils.holdings.list.invalidate();
      setSymbol("");
      setLots("");
      setCost("");
      setNote("");
      setBuyFeeDirty(false); // 恢復自動試算預填
      setFormErr(null);
    },
    onError: (e: any) => {
      if (e?.data?.code === "UNAUTHORIZED") onAuthFail();
      else setFormErr(e.message || "新增失敗");
    },
  });
  const sellMut = trpc.holdings.sell.useMutation({
    onSuccess: () => {
      utils.holdings.list.invalidate();
      setSelLotId("");
      setSellLots("");
      setSellPrice("");
      setSellNote("");
      setSellFeeDirty(false);
      setSellErr(null);
    },
    onError: (e: any) => {
      if (e?.data?.code === "UNAUTHORIZED") onAuthFail();
      else setSellErr(e.message || "賣出失敗");
    },
  });
  const removeMut = trpc.holdings.remove.useMutation({
    onSuccess: () => utils.holdings.list.invalidate(),
    onError: (e: any) => {
      if (e?.data?.code === "UNAUTHORIZED") onAuthFail();
      else alert(e?.message || "刪除失敗"); // 含「已被賣出引用」等保護訊息
    },
  });

  const rows = (data as TxRow[] | undefined) || [];

  // 指定批次結算（剩餘股數、含手續費均價、已實現損益）
  const pf = useMemo(() => computePortfolio(rows), [rows]);
  // 可賣批次：剩餘 > 0，依買入日期舊→新（預設先賣早買的）
  const openLots = useMemo(
    () =>
      pf.lots
        .filter((l) => l.remaining > 0)
        .sort((a, b) => (a.buyDate || "").localeCompare(b.buyDate || "") || a.lotId - b.lotId),
    [pf]
  );
  const selectedLot = openLots.find((l) => l.lotId === Number(selLotId));

  // 手續費自動試算（未手動覆寫時預填；台股賣出含 0.3% 證交稅）
  const estBuyFee = estimateFee({
    market,
    side: "buy",
    shares: (parseFloat(lots) || 0) * 1000,
    price: parseFloat(cost) || 0,
  });
  useEffect(() => {
    if (!buyFeeDirty) setBuyFee(estBuyFee > 0 ? String(estBuyFee) : "");
  }, [estBuyFee, buyFeeDirty]);

  const sellShares = (parseFloat(sellLots) || 0) * 1000;
  const sellPriceNum = parseFloat(sellPrice) || 0;
  const estSellFee = selectedLot
    ? estimateFee({ market: selectedLot.market, side: "sell", shares: sellShares, price: sellPriceNum })
    : 0;
  useEffect(() => {
    if (!sellFeeDirty) setSellFee(estSellFee > 0 ? String(estSellFee) : "");
  }, [estSellFee, sellFeeDirty]);

  // 賣出預覽（賣出收入已扣手續費；已實現 = 收入 − 批次含費成本）
  const sellFeeNum = parseFloat(sellFee) || 0;
  const sellPreview =
    selectedLot && sellShares > 0 && sellPriceNum > 0
      ? (() => {
          const proceeds = sellShares * sellPriceNum - sellFeeNum;
          return { proceeds, realized: proceeds - selectedLot.perShareCost * sellShares };
        })()
      : null;

  // ── 總覽 & 分股票彙總（依指定批次結算結果）──
  const { totals, bySymbol } = useMemo(() => {
    const priceBySymbol = new Map<string, number>();
    for (const r of rows)
      if (r.currentPrice != null) priceBySymbol.set(r.symbol.toUpperCase(), r.currentPrice);
    let totalCost = 0;
    let totalMV = 0;
    let mvKnown = true;
    let openCount = 0;
    for (const p of pf.positions) {
      totalCost += p.cost; // 剩餘成本（含攤入手續費）
      if (p.shares <= 0) continue;
      openCount += 1;
      const price = priceBySymbol.get(p.symbol);
      if (price == null) mvKnown = false;
      else totalMV += p.shares * price;
    }
    const marketValue = mvKnown && openCount > 0 ? totalMV : openCount === 0 ? 0 : null;
    const unrealized = marketValue != null ? marketValue - totalCost : null;
    const bySymbol = pf.positions
      .filter((p) => p.shares > 0)
      .map((p) => {
        const currentPrice = priceBySymbol.get(p.symbol) ?? null;
        const mv = currentPrice != null ? p.shares * currentPrice : null;
        const pnl = mv != null ? mv - p.cost : null;
        const pnlPct = pnl != null && p.cost > 0 ? (pnl / p.cost) * 100 : null;
        return { ...p, currentPrice, marketValue: mv, pnl, pnlPct };
      })
      .sort((a, b) => (b.marketValue ?? b.cost) - (a.marketValue ?? a.cost));
    return {
      totals: {
        cost: totalCost,
        marketValue,
        unrealized,
        unrealizedPct: unrealized != null && totalCost > 0 ? (unrealized / totalCost) * 100 : null,
        realized: pf.totals.realized, // 已實現（含已全數賣出的標的）
        fees: pf.totals.fees, // 累計手續費（買＋賣）
        symbols: pf.totals.symbols,
        openLots: pf.totals.openLots,
      },
      bySymbol,
    };
  }, [rows, pf]);

  const submitBuy = (e: React.FormEvent) => {
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
      fee: Math.max(0, parseFloat(buyFee) || 0),
      note: note.trim() || undefined,
    });
  };

  const submitSell = (e: React.FormEvent) => {
    e.preventDefault();
    setSellErr(null);
    if (!selectedLot) return setSellErr("請選擇要賣出的買入批次");
    const l = parseFloat(sellLots);
    const p = parseFloat(sellPrice);
    if (!(l > 0)) return setSellErr("張數需大於 0（可輸入小數，0.5 = 500 股）");
    const shares = l * 1000;
    if (shares > selectedLot.remaining + 1e-9)
      return setSellErr(
        `賣出股數超過該批次剩餘（剩餘 ${(selectedLot.remaining / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 3 })} 張）`
      );
    if (!(p > 0)) return setSellErr("請輸入賣出價格");
    if (!sellDate) return setSellErr("請選擇賣出日期");
    sellMut.mutate({
      password,
      symbol: selectedLot.symbol,
      fromLotId: selectedLot.lotId,
      shares,
      price: p,
      sellDate,
      fee: Math.max(0, parseFloat(sellFee) || 0),
      note: sellNote.trim() || undefined,
    });
  };

  // 密碼失效 → 回到密碼閘（放在所有 hooks 之後，避免條件式呼叫 hook）
  if ((error as any)?.data?.code === "UNAUTHORIZED") {
    onAuthFail();
    return null;
  }

  return (
    <div className="space-y-6">
      {/* ══ 總覽卡 ══ */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="bg-card border-border p-4">
          <div className="text-[11px] text-muted-foreground mb-1">總成本</div>
          <div className="text-xl font-bold tnum">{fmtMoney(totals.cost)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {totals.symbols} 檔 · {totals.openLots} 個批次 · 含手續費
          </div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="text-[11px] text-muted-foreground mb-1">總市值</div>
          <div className="text-xl font-bold tnum">{fmtMoney(totals.marketValue)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">依即時報價</div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="text-[11px] text-muted-foreground mb-1">未實現損益</div>
          <div className={`text-xl font-bold tnum flex items-center gap-1 ${pnlColor(totals.unrealized)}`}>
            {totals.unrealized != null &&
              (totals.unrealized >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />)}
            {pnlText(totals.unrealized)}
          </div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="text-[11px] text-muted-foreground mb-1">未實現報酬率</div>
          <div className={`text-xl font-bold tnum ${pnlColor(totals.unrealizedPct)}`}>
            {pnlText(totals.unrealizedPct, 2, "%")}
          </div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="text-[11px] text-muted-foreground mb-1">已實現損益</div>
          <div className={`text-xl font-bold tnum ${pnlColor(totals.realized)}`}>{pnlText(totals.realized)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">賣出收入已扣手續費</div>
        </Card>
        <Card className="bg-card border-border p-4">
          <div className="text-[11px] text-muted-foreground mb-1">累計手續費</div>
          <div className="text-xl font-bold tnum">{fmtMoney(totals.fees)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">買＋賣合計（已計入損益）</div>
        </Card>
      </div>

      {/* ══ 新增一筆買入 ══ */}
      <Card className="bg-card border-border p-4">
        <h2 className="section-head mb-3">新增買入紀錄</h2>
        <form onSubmit={submitBuy} className="grid grid-cols-2 md:grid-cols-8 gap-2 items-end">
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
            <label className="text-[11px] text-muted-foreground block mb-1">手續費（可覆寫）</label>
            <Input
              type="number"
              step="any"
              min="0"
              value={buyFee}
              onChange={(e) => {
                setBuyFee(e.target.value);
                setBuyFeeDirty(true);
              }}
              placeholder={estBuyFee > 0 ? `試算 ${estBuyFee}` : "台股自動試算"}
            />
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
          同一檔股票可新增多筆（分批買入），系統會自動加總持股與平均成本。台股手續費自動試算（0.1425%、最低
          20 元，可覆寫），買入手續費會攤入持股成本。
        </div>
      </Card>

      {/* ══ 新增一筆賣出（指定批次）══ */}
      <Card className="bg-card border-border p-4">
        <h2 className="section-head mb-3">新增賣出紀錄</h2>
        {openLots.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-4">尚無可賣出的持股，請先新增買入紀錄</div>
        ) : (
          <form onSubmit={submitSell} className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground block mb-1">賣出批次（指定成本）</label>
              <select
                value={selLotId}
                onChange={(e) => {
                  setSelLotId(e.target.value);
                  setSellFeeDirty(false); // 換批次 → 依新市場重新試算
                }}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">選擇買入批次…</option>
                {openLots.map((l) => (
                  <option key={l.lotId} value={l.lotId}>
                    {l.symbol} · {l.buyDate} 買 · 剩餘{" "}
                    {(l.remaining / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 3 })} 張 · 均價{" "}
                    {l.perShareCost.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">
                賣出張數{selectedLot ? `（最多 ${(selectedLot.remaining / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 3 })}）` : ""}
              </label>
              <Input
                type="number"
                step="any"
                min="0"
                value={sellLots}
                onChange={(e) => setSellLots(e.target.value)}
                placeholder="1 = 1000股"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">賣出價格/股</label>
              <Input
                type="number"
                step="any"
                min="0"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="每股成交價"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">手續費（可覆寫）</label>
              <Input
                type="number"
                step="any"
                min="0"
                value={sellFee}
                onChange={(e) => {
                  setSellFee(e.target.value);
                  setSellFeeDirty(true);
                }}
                placeholder={estSellFee > 0 ? `試算 ${estSellFee}` : "台股自動試算"}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">賣出日期</label>
              <Input type="date" value={sellDate} max={todayStr()} onChange={(e) => setSellDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">備註（選填）</label>
              <Input value={sellNote} onChange={(e) => setSellNote(e.target.value)} placeholder="例：停利" />
            </div>
            <Button type="submit" disabled={sellMut.isPending || !selectedLot} className="h-9">
              {sellMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "賣出"}
            </Button>
          </form>
        )}
        {sellPreview && (
          <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-x-5 gap-y-1">
            <span>
              賣出收入 <span className="tnum font-semibold">{fmtMoney(sellPreview.proceeds)}</span>（已扣手續費）
            </span>
            <span>
              預估已實現損益{" "}
              <span className={`tnum font-semibold ${pnlColor(sellPreview.realized)}`}>{pnlText(sellPreview.realized)}</span>
            </span>
          </div>
        )}
        {sellErr && <div className="mt-2 text-xs text-destructive">{sellErr}</div>}
        <div className="mt-2 text-[11px] text-muted-foreground">
          一次賣出一個買入批次（成本最精確）；跨批次請分多筆登錄。台股手續費自動試算（0.1425% 最低 20 元＋0.3%
          證交稅，可覆寫），賣出手續費從收入扣除。
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
                  <th className="text-right py-2 px-2 font-normal">報酬率</th>
                  <th className="text-right py-2 pl-2 font-normal">已實現</th>
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
                        {g.openLots > 1 && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-accent-foreground bg-accent/20 border border-accent/40 rounded px-1">
                            <Layers className="h-2.5 w-2.5" />{g.openLots} 批次
                          </span>
                        )}
                      </td>
                      <td className="text-right py-2.5 px-2 tnum">{(g.shares / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 3 })} 張</td>
                      <td className="text-right py-2.5 px-2 tnum">{avg.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}</td>
                      <td className="text-right py-2.5 px-2 tnum">{g.currentPrice != null ? g.currentPrice.toLocaleString("zh-TW", { maximumFractionDigits: 2 }) : "—"}</td>
                      <td className="text-right py-2.5 px-2 tnum">{fmtMoney(g.cost)}</td>
                      <td className="text-right py-2.5 px-2 tnum">{fmtMoney(g.marketValue)}</td>
                      <td className={`text-right py-2.5 px-2 tnum font-semibold ${pnlColor(pnl)}`}>{pnlText(pnl)}</td>
                      <td className={`text-right py-2.5 px-2 tnum font-semibold ${pnlColor(pnlPct)}`}>{pnlText(pnlPct, 2, "%")}</td>
                      <td className={`text-right py-2.5 pl-2 tnum ${pnlColor(g.realizedPnl)}`}>{pnlText(g.realizedPnl)}</td>
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
        <h2 className="section-head mb-3">交易明細</h2>
        {isLoading ? null : rows.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-6">尚無紀錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground border-b border-border">
                  <th className="text-left py-2 pr-2 font-normal">日期</th>
                  <th className="text-left py-2 px-2 font-normal">類型</th>
                  <th className="text-left py-2 px-2 font-normal">代號</th>
                  <th className="text-right py-2 px-2 font-normal">張數</th>
                  <th className="text-right py-2 px-2 font-normal">成交價/股</th>
                  <th className="text-right py-2 px-2 font-normal">手續費</th>
                  <th className="text-right py-2 px-2 font-normal">損益</th>
                  <th className="text-right py-2 px-2 font-normal">剩餘</th>
                  <th className="text-left py-2 px-2 font-normal">備註</th>
                  <th className="py-2 pl-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => {
                  const isSell = h.type === "sell";
                  return (
                    <tr key={h.id} className="border-b border-border/50 hover:bg-background/60 transition-colors">
                      <td className="py-2 pr-2 tnum text-muted-foreground">{h.buyDate}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`inline-flex items-center text-[10px] border rounded px-1 ${
                            isSell ? "text-chart-1 border-chart-1/40" : "text-destructive border-destructive/40"
                          }`}
                        >
                          {isSell ? "賣" : "買"}
                        </span>
                      </td>
                      <td className="py-2 px-2 font-semibold text-primary">{h.symbol}</td>
                      <td className="text-right py-2 px-2 tnum">
                        {(h.shares / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 3 })}
                      </td>
                      <td className="text-right py-2 px-2 tnum">
                        {h.avgCost.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="text-right py-2 px-2 tnum text-muted-foreground">{fmtMoney(h.fee)}</td>
                      <td className={`text-right py-2 px-2 tnum ${pnlColor(isSell ? h.realizedPnl : h.pnl)}`}>
                        {pnlText(isSell ? h.realizedPnl : h.pnl)}
                      </td>
                      <td className="text-right py-2 px-2 tnum text-muted-foreground">
                        {h.remaining != null
                          ? `${(h.remaining / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 3 })} 張`
                          : "—"}
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground max-w-[10rem] truncate">{h.note || ""}</td>
                      <td className="py-2 pl-2 text-right">
                        <button
                          onClick={() => {
                            const kind = isSell ? "賣出" : "買入";
                            if (
                              confirm(
                                `確定刪除 ${h.buyDate} ${kind}的 ${h.symbol}（${(h.shares / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 3 })} 張）？`
                              )
                            )
                              removeMut.mutate({ password, id: h.id });
                          }}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="刪除這筆"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-[11px] text-muted-foreground">
          依交易日期新→舊排序。買入手續費攤入成本、賣出手續費從收入扣除；買入的「損益」為該批次剩餘持股的未實現數，賣出為已實現。已被賣出引用的買入批次無法刪除（需先刪除對應賣出紀錄）。
        </div>
      </Card>
    </div>
  );
}
