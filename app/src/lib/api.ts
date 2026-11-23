import type { Candle, Tf } from "../engine/types";

export const API = "https://fkrgiaeglingmogcsyik.supabase.co/functions/v1/viko-market";

export type Market = "Crypto" | "Stocks" | "Indices" | "Forex" | "Commodities";
export type Instrument = { id: string; label: string; name: string; market: Market };

const C = (sym: string, name: string): Instrument => ({ id: `crypto:${sym}USDT`, label: `${sym}/USDT`, name, market: "Crypto" });
const S = (sym: string, name: string): Instrument => ({ id: `yahoo:${sym}`, label: sym.replace(".JO", ""), name, market: "Stocks" });
const I = (sym: string, label: string, name: string): Instrument => ({ id: `yahoo:${sym}`, label, name, market: "Indices" });
const F = (pair: string, name: string): Instrument => ({ id: `yahoo:${pair}=X`, label: `${pair.slice(0, 3)}/${pair.slice(3)}`, name, market: "Forex" });
const M = (sym: string, label: string, name: string): Instrument => ({ id: `yahoo:${sym}`, label, name, market: "Commodities" });

/** Every market Viko knows about. Search finds thousands more. */
export const CATALOG: Instrument[] = [
  C("BTC", "Bitcoin"), C("ETH", "Ether"), C("SOL", "Solana"), C("BNB", "BNB"), C("XRP", "XRP"), C("ADA", "Cardano"), C("DOGE", "Dogecoin"),
  C("AVAX", "Avalanche"), C("LINK", "Chainlink"), C("DOT", "Polkadot"), C("LTC", "Litecoin"), C("TRX", "Tron"), C("TON", "Toncoin"),
  C("NEAR", "Near"), C("ATOM", "Cosmos"), C("UNI", "Uniswap"), C("XLM", "Stellar"), C("BCH", "Bitcoin Cash"), C("SUI", "Sui"), C("PEPE", "Pepe"),
  S("AAPL", "Apple"), S("MSFT", "Microsoft"), S("NVDA", "Nvidia"), S("AMZN", "Amazon"), S("GOOGL", "Alphabet"), S("META", "Meta"), S("TSLA", "Tesla"),
  S("AVGO", "Broadcom"), S("AMD", "AMD"), S("NFLX", "Netflix"), S("JPM", "JPMorgan"), S("V", "Visa"), S("MA", "Mastercard"), S("KO", "Coca-Cola"),
  S("DIS", "Disney"), S("BA", "Boeing"), S("XOM", "Exxon Mobil"), S("COIN", "Coinbase"), S("PLTR", "Palantir"), S("UBER", "Uber"),
  S("NPN.JO", "Naspers (JSE)"), S("MTN.JO", "MTN Group (JSE)"), S("SBK.JO", "Standard Bank (JSE)"),
  I("SPY", "SPY", "S&P 500 ETF"), I("QQQ", "QQQ", "Nasdaq 100 ETF"), I("DIA", "DIA", "Dow Jones ETF"), I("IWM", "IWM", "Russell 2000 ETF"),
  I("^GSPC", "S&P 500", "S&P 500 index"), I("^NDX", "Nasdaq 100", "Nasdaq 100 index"), I("^DJI", "Dow Jones", "Dow Jones index"),
  I("^FTSE", "FTSE 100", "London"), I("^GDAXI", "DAX", "Frankfurt"), I("^N225", "Nikkei 225", "Tokyo"), I("^HSI", "Hang Seng", "Hong Kong"), I("^VIX", "VIX", "Volatility index"),
  F("EURUSD", "Euro / US dollar"), F("GBPUSD", "Pound / US dollar"), F("USDJPY", "US dollar / Yen"), F("AUDUSD", "Aussie / US dollar"),
  F("USDCAD", "US dollar / Loonie"), F("USDCHF", "US dollar / Franc"), F("NZDUSD", "Kiwi / US dollar"), F("EURGBP", "Euro / Pound"),
  F("EURJPY", "Euro / Yen"), F("GBPJPY", "Pound / Yen"), F("USDZAR", "US dollar / Rand"), F("USDKES", "US dollar / Kenyan shilling"),
  M("GC=F", "Gold", "Gold futures"), M("SI=F", "Silver", "Silver futures"), M("CL=F", "Crude oil", "WTI crude futures"), M("BZ=F", "Brent", "Brent crude futures"),
  M("NG=F", "Natural gas", "Natural gas futures"), M("HG=F", "Copper", "Copper futures"), M("PL=F", "Platinum", "Platinum futures"),
  M("ZC=F", "Corn", "Corn futures"), M("ZW=F", "Wheat", "Wheat futures"), M("KC=F", "Coffee", "Coffee futures"),
];
export const MARKETS: Market[] = ["Crypto", "Stocks", "Indices", "Forex", "Commodities"];
const pick = (ids: string[]) => ids.map((id) => CATALOG.find((x) => x.id === id)!).filter(Boolean);
export const DEFAULT_WATCHLIST: Instrument[] = pick([
  "crypto:BTCUSDT", "crypto:ETHUSDT", "crypto:SOLUSDT", "crypto:BNBUSDT", "crypto:XRPUSDT",
  "yahoo:AAPL", "yahoo:NVDA", "yahoo:MSFT", "yahoo:TSLA", "yahoo:SPY", "yahoo:QQQ",
  "yahoo:EURUSD=X", "yahoo:GBPUSD=X", "yahoo:USDJPY=X", "yahoo:GC=F", "yahoo:CL=F",
]);

export type Quote = { price: number; change: number };
export async function getQuotes(ids: string[]): Promise<Record<string, Quote>> {
  if (!ids.length) return {};
  const r = await fetch(`${API}/quotes?symbols=${encodeURIComponent(ids.join(","))}`);
  const j = await r.json().catch(() => ({}));
  return j.quotes ?? {};
}

const cache = new Map<string, { at: number; data: Candle[] }>();

export async function getCandles(symbol: string, tf: Tf, fresh = false): Promise<Candle[]> {
  const key = `${symbol}|${tf}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 25_000) return hit.data;
  const r = await fetch(`${API}/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(j.candles)) throw new Error(j.error ?? `Market data request failed (${r.status})`);
  if (j.candles.length < 120) throw new Error("Not enough price history on this timeframe to read waves. Try a higher timeframe.");
  cache.set(key, { at: Date.now(), data: j.candles });
  return j.candles;
}

export const HTF: Record<Tf, Tf | null> = { "5m": "1h", "15m": "1h", "30m": "4h", "1h": "4h", "2h": "1d", "4h": "1d", "1d": "1w", "1w": null };

export async function searchSymbols(q: string): Promise<Instrument[]> {
  const out: Instrument[] = [];
  const up = q.trim().toUpperCase();
  if (/^[A-Z0-9]{2,10}$/.test(up)) out.push({ id: `crypto:${up.endsWith("USDT") ? up : up + "USDT"}`, label: `${up.replace(/USDT$/, "")}/USDT`, name: "Crypto (Binance)", market: "Crypto" });
  try {
    const r = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    for (const x of j.quotes ?? []) {
      const market: Market = x.type === "CURRENCY" ? "Forex" : x.type === "FUTURE" ? "Commodities" : x.type === "CRYPTOCURRENCY" ? "Crypto" : x.type === "INDEX" || x.type === "ETF" ? "Indices" : "Stocks";
      out.push({ id: `yahoo:${x.symbol}`, label: x.symbol, name: x.name, market });
    }
  } catch { /* search is best-effort */ }
  return out.slice(0, 9);
}

export type JournalRow = { id: string; created_at: string; symbol: string; timeframe: string; direction: string; verdict: string; score: number; entry: number; stop: number; target1: number; target2: number | null; rr: number; setup: string; outcome: string; notes: string };

async function jfetch(key: string, init: RequestInit & { query?: string } = {}) {
  const r = await fetch(`${API}/journal${init.query ?? ""}`, { ...init, headers: { "content-type": "application/json", "x-viko-key": key } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("Your app key is missing or wrong. Add it in Settings.");
  if (!r.ok) throw new Error(j.error ?? "Journal request failed.");
  return j;
}
export const journal = {
  list: async (key: string): Promise<JournalRow[]> => (await jfetch(key)).rows,
  add: async (key: string, row: Record<string, unknown>): Promise<JournalRow> => (await jfetch(key, { method: "POST", body: JSON.stringify(row) })).row,
  update: async (key: string, id: string, patch: { outcome?: string; notes?: string }): Promise<JournalRow> => (await jfetch(key, { method: "PATCH", query: `?id=${id}`, body: JSON.stringify(patch) })).row,
};

export function store<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem("viko:" + key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function save(key: string, v: unknown) {
  try { localStorage.setItem("viko:" + key, JSON.stringify(v)); } catch { /* private mode */ }
}

// ---------- Paper trading ----------
export const PAPER = "https://fkrgiaeglingmogcsyik.supabase.co/functions/v1/viko-paper";
export type PaperTrade = { id: string; symbol: string; label: string; tf: string; dir: "long" | "short"; setup: string; score: number; source: "manual" | "auto"; status: "open" | "closed"; opened_at: string; closed_at: string | null; entry: number; stop: number; initial_stop: number; target1: number; target2: number; qty: number; qty_open: number; t1_hit: boolean; realized: number; exit_price: number | null; close_reason: string | null; last_price: number | null; tip: string | null };
export type PaperAccount = { starting_balance: number; balance: number; risk_pct: number; autopilot: boolean; auto_level: "approved" | "practice"; auto_tfs: string[]; watchlist: { id: string; label: string }[]; last_tick: string | null; last_scan: string | null };
export type PaperEvent = { id: number; at: string; kind: string; message: string };
export type PaperState = { account: PaperAccount; open: PaperTrade[]; closed: PaperTrade[]; events: PaperEvent[]; now: number };
async function pfetch(key: string, route: string, body?: unknown) {
  const r = await fetch(`${PAPER}/${route}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "x-viko-key": key }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Paper trading request failed (${r.status}).`);
  return j;
}
export const paper = {
  state: (key: string): Promise<PaperState> => pfetch(key, "state"),
  open: (key: string, b: Record<string, unknown>) => pfetch(key, "open", b),
  close: (key: string, id: string) => pfetch(key, "close", { id }),
  settings: (key: string, b: Record<string, unknown>) => pfetch(key, "settings", b),
  tick: (key: string, force = false) => pfetch(key, "tick", { force }),
};

// ---------- News, events and opinion ----------
export const NEWS = "https://fkrgiaeglingmogcsyik.supabase.co/functions/v1/viko-news";
export type Headline = { title: string; source: string; url: string; at: number; score: number };
export type MarketEvent = { title: string; currency: string; impact: string; at: number; forecast: string; previous: string };
export type NewsBrief = { headlines: Headline[]; mood: number; moodLabel: "positive" | "negative" | "mixed"; events: MarketEvent[]; currencies: string[]; opinion: { text: string; stance: "bullish" | "bearish" | "neutral"; by: "ai" | "rules" }; at: number };
const newsCache = new Map<string, { at: number; data: NewsBrief }>();
export async function getNews(inst: Instrument, tf: string, technical: { verdict: string; dir: string; score: number; setup: string; price: number } | null): Promise<NewsBrief> {
  const key = `${inst.id}|${tf}|${technical?.verdict}|${technical?.dir}|${technical?.setup}`;
  const hit = newsCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.data;
  const r = await fetch(NEWS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: inst.id, name: inst.name, market: inst.market, tf, technical }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.headlines) throw new Error(j.error ?? "News is unavailable right now.");
  newsCache.set(key, { at: Date.now(), data: j });
  return j;
}
