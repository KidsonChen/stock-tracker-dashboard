/**
 * 庫存交易計算純函式（前端與後端共用）。
 * - 手續費自動試算（台股 0.1425% 最低 20 元；賣出加 0.3% 證交稅）
 * - 指定批次賣出：每筆買入為一個批次（lot），賣出須引用 fromLotId
 * - 已實現／未實現損益、批次剩餘股數、成本基礎（買入手續費攤入批次單價）
 *
 * 舊資料相容：type 缺省視為 "buy"、fee 缺省視為 0。
 */

export type TradeSide = "buy" | "sell";

/** 前後端共用的交易輸入（對應 db-r2.ts 的 Holding，欄位可缺省以相容舊資料） */
export type PortfolioTxInput = {
  id: number;
  symbol: string;
  market: string;
  type?: "buy" | "sell" | null;
  shares: number;
  avgCost: number; // 成交單價（買＝買價、賣＝賣價）
  fee?: number | null;
  fromLotId?: number | null;
  buyDate?: string | null;
  note?: string | null;
};

/** 一個買入批次（含賣出後的剩餘狀態） */
export type LotState = {
  lotId: number;
  symbol: string;
  market: string;
  buyDate: string;
  origShares: number;
  soldShares: number;
  remaining: number;
  rawPrice: number; // 原始成交單價
  fee: number;
  perShareCost: number; // 含攤入手續費的每股成本
  remainingCost: number; // perShareCost * remaining（剩餘成本基礎）
  note?: string;
};

/** 一筆賣出的結算結果 */
export type SellCalc = {
  txId: number;
  symbol: string;
  fromLotId: number | null;
  shares: number;
  price: number;
  fee: number;
  proceeds: number; // shares * price - fee（賣出收入已扣手續費）
  basis: number; // 批次成本 × 賣出股數
  realizedPnl: number; // proceeds - basis
};

/** 每檔股票的持倉彙總 */
export type SymbolPosition = {
  symbol: string;
  market: string;
  shares: number; // 剩餘股數
  cost: number; // 剩餘成本基礎（含攤入手續費）
  realizedPnl: number; // 累計已實現損益
  fees: number; // 累計手續費（買＋賣）
  openLots: number; // 尚有剩餘的批數
};

export const TW_FEE_RATE = 0.001425; // 台股證券交易手續費率
export const TW_TAX_RATE = 0.003; // 台股證交稅（僅賣出）
export const TW_MIN_FEE = 20; // 台股每筆手續費最低

/**
 * 手續費自動試算。
 * - 台股：max(金額 × 0.1425%, 20)，賣出另加 0.3% 證交稅（四捨五入到元）
 * - 美股／港股：無標準費率先回傳 0，由使用者手動輸入
 */
export function estimateFee(opts: {
  market: string;
  side: TradeSide;
  shares: number;
  price: number;
}): number {
  const amount = opts.shares * opts.price;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const market = (opts.market || "").toUpperCase();
  if (market !== "TW") return 0;
  const commission = Math.max(amount * TW_FEE_RATE, TW_MIN_FEE);
  const tax = opts.side === "sell" ? amount * TW_TAX_RATE : 0;
  return Math.round(commission + tax);
}

/**
 * 依交易清單計算批次狀態、賣出結算、持倉彙總與總計。
 * - 買入手續費攤入該批次每股成本：perShareCost = (shares × price + fee) / shares
 * - 賣出：以引用批次的 perShareCost 計算成本基礎，賣出手續費從收入扣除
 * - 防禦：無效的 fromLotId（不存在／不同檔）退化為以賣價當成本（已實現 ≈ −手續費）；
 *         賣出股數超過批次剩餘時，soldShares 以批次原始股數為上限截斷
 */
export function computePortfolio(txs: PortfolioTxInput[]): {
  lots: LotState[];
  sellCalcs: SellCalc[];
  positions: SymbolPosition[];
  totals: { openLots: number; symbols: number; cost: number; realized: number; fees: number };
} {
  const isSell = (t: PortfolioTxInput) => (t.type ?? "buy") === "sell";
  const buys = txs.filter((t) => !isSell(t));
  const sells = txs.filter(isSell);
  const buyById = new Map(buys.map((b) => [b.id, b]));

  // 每個批次被賣出的總股數
  const soldByLot = new Map<number, number>();
  for (const s of sells) {
    if (s.fromLotId == null) continue;
    const lot = buyById.get(s.fromLotId);
    if (!lot || lot.symbol.toUpperCase() !== s.symbol.toUpperCase()) continue; // 防禦：無效引用
    soldByLot.set(s.fromLotId, (soldByLot.get(s.fromLotId) || 0) + s.shares);
  }

  const lots: LotState[] = buys.map((b) => {
    const fee = b.fee ?? 0;
    const sold = Math.max(0, Math.min(soldByLot.get(b.id) || 0, b.shares));
    const perShare = b.shares > 0 ? (b.shares * b.avgCost + fee) / b.shares : b.avgCost;
    const remaining = b.shares - sold;
    return {
      lotId: b.id,
      symbol: b.symbol.toUpperCase(),
      market: b.market,
      buyDate: b.buyDate || "",
      origShares: b.shares,
      soldShares: sold,
      remaining,
      rawPrice: b.avgCost,
      fee,
      perShareCost: perShare,
      remainingCost: perShare * remaining,
      note: b.note ?? undefined,
    };
  });
  const lotById = new Map(lots.map((l) => [l.lotId, l]));

  const sellCalcs: SellCalc[] = sells.map((s) => {
    const fee = s.fee ?? 0;
    const proceeds = s.shares * s.avgCost - fee;
    const lot = s.fromLotId != null ? lotById.get(s.fromLotId) : undefined;
    const basis = (lot ? lot.perShareCost : s.avgCost) * s.shares; // 無效引用 → 退化為賣價當成本
    return {
      txId: s.id,
      symbol: s.symbol.toUpperCase(),
      fromLotId: s.fromLotId ?? null,
      shares: s.shares,
      price: s.avgCost,
      fee,
      proceeds,
      basis,
      realizedPnl: proceeds - basis,
    };
  });

  const posMap = new Map<string, SymbolPosition>();
  const ensurePos = (symbol: string, market: string): SymbolPosition => {
    const key = symbol.toUpperCase();
    let p = posMap.get(key);
    if (!p) {
      p = { symbol: key, market, shares: 0, cost: 0, realizedPnl: 0, fees: 0, openLots: 0 };
      posMap.set(key, p);
    }
    return p;
  };
  for (const l of lots) {
    const p = ensurePos(l.symbol, l.market);
    p.shares += l.remaining;
    p.cost += l.remainingCost;
    p.fees += l.fee;
    if (l.remaining > 0) p.openLots += 1;
  }
  for (const s of sells) {
    const src = txs.find((t) => t.id === s.id);
    const p = ensurePos(s.symbol, src?.market ?? "");
    p.fees += s.fee ?? 0;
  }
  for (const sc of sellCalcs) {
    const p = posMap.get(sc.symbol);
    if (p) p.realizedPnl += sc.realizedPnl;
  }
  const positions = Array.from(posMap.values());

  const totals = {
    openLots: lots.filter((l) => l.remaining > 0).length,
    symbols: positions.filter((p) => p.shares > 0).length,
    cost: positions.reduce((sum, p) => sum + p.cost, 0),
    realized: sellCalcs.reduce((sum, s) => sum + s.realizedPnl, 0),
    fees: positions.reduce((sum, p) => sum + p.fees, 0),
  };
  return { lots, sellCalcs, positions, totals };
}
