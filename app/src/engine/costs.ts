// Trading costs used by paper trades, the ticket previews and the track-record report, so practice results
// look like real ones. Estimates of typical retail costs, per side of a trade, as a fraction of the price:
//  fee  - commission or spread, paid on every fill (entry and each exit)
//  slip - how far a market order fills from the price you saw (entries, stop-losses, time limits, manual closes).
//         Targets are limit orders, so they fill at the target with no slippage.
export type Costs = { fee: number; slip: number; label: string };

const MAJORS = new Set(["BTC", "ETH", "BNB", "SOL", "XRP"]);

export function costsFor(symbol: string): Costs {
  const [src, raw = ""] = symbol.split(":");
  const s = raw.toUpperCase();
  if (src === "crypto") {
    const base = s.replace(/(USDT|USDC|FDUSD|BUSD)$/, "");
    return MAJORS.has(base)
      ? { fee: 0.0005, slip: 0.0002, label: "major coin: 0.05% fee + 0.02% slippage per side" }
      : { fee: 0.0005, slip: 0.0008, label: "smaller coin: 0.05% fee + 0.08% slippage per side" };
  }
  if (s.endsWith("=X")) return { fee: 0.0001, slip: 0.0001, label: "currency pair: 0.01% spread + 0.01% slippage per side" };
  if (s.endsWith("=F")) return { fee: 0.0002, slip: 0.0002, label: "commodity: 0.02% spread + 0.02% slippage per side" };
  return { fee: 0.0005, slip: 0.0003, label: "stock or index: 0.05% spread + 0.03% slippage per side" };
}

/** Price you actually get on a market order: a little worse than the quote. */
export function marketFill(price: number, side: "buy" | "sell", c: Costs): number {
  return side === "buy" ? price * (1 + c.slip) : price * (1 - c.slip);
}

/**
 * Cost of a full round trip as a share of the money in the trade, for previews:
 * fee in and out, slippage on entry, plus slippage on the exit when it's a market exit (stop or time limit).
 */
export function roundTripPct(c: Costs, marketExit: boolean): number {
  return 2 * c.fee + c.slip + (marketExit ? c.slip : 0);
}
