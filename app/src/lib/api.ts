import type { Candle, Setup, Tf } from "../engine/types";

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
  // ---- more crypto ----
  C("AAVE", "Aave"), C("ARB", "Arbitrum"), C("OP", "Optimism"), C("APT", "Aptos"), C("INJ", "Injective"), C("FIL", "Filecoin"), C("ICP", "Internet Computer"),
  C("HBAR", "Hedera"), C("VET", "VeChain"), C("ALGO", "Algorand"), C("ETC", "Ethereum Classic"), C("SHIB", "Shiba Inu"), C("WIF", "dogwifhat"), C("BONK", "Bonk"),
  C("FET", "Fetch.ai"), C("RENDER", "Render"), C("TIA", "Celestia"), C("SEI", "Sei"), C("STX", "Stacks"), C("IMX", "Immutable"), C("LDO", "Lido DAO"),
  C("GRT", "The Graph"), C("SAND", "The Sandbox"), C("MANA", "Decentraland"), C("AXS", "Axie Infinity"), C("CRV", "Curve"), C("RUNE", "THORChain"), C("JUP", "Jupiter"),
  C("PYTH", "Pyth"), C("ENA", "Ethena"), C("WLD", "Worldcoin"), C("TAO", "Bittensor"), C("ONDO", "Ondo"), C("FLOKI", "Floki"), C("TRUMP", "Official Trump"), C("ZEC", "Zcash"), C("XMR", "Monero"),
  // ---- more stocks ----
  S("ADBE", "Adobe"), S("CRM", "Salesforce"), S("ORCL", "Oracle"), S("INTC", "Intel"), S("QCOM", "Qualcomm"), S("CSCO", "Cisco"), S("IBM", "IBM"), S("SHOP", "Shopify"),
  S("PYPL", "PayPal"), S("ABNB", "Airbnb"), S("SNOW", "Snowflake"), S("MU", "Micron"), S("ASML", "ASML"), S("TSM", "TSMC"), S("BABA", "Alibaba"), S("PDD", "PDD Holdings"),
  S("NIO", "NIO"), S("JD", "JD.com"), S("SONY", "Sony"), S("TM", "Toyota"), S("NKE", "Nike"), S("MCD", "McDonald's"), S("SBUX", "Starbucks"), S("WMT", "Walmart"),
  S("COST", "Costco"), S("HD", "Home Depot"), S("TGT", "Target"), S("PG", "Procter & Gamble"), S("JNJ", "Johnson & Johnson"), S("PFE", "Pfizer"), S("MRK", "Merck"),
  S("LLY", "Eli Lilly"), S("ABBV", "AbbVie"), S("UNH", "UnitedHealth"), S("CVX", "Chevron"), S("COP", "ConocoPhillips"), S("BAC", "Bank of America"), S("WFC", "Wells Fargo"),
  S("GS", "Goldman Sachs"), S("MS", "Morgan Stanley"), S("C", "Citigroup"), S("BRK-B", "Berkshire Hathaway"), S("T", "AT&T"), S("VZ", "Verizon"), S("F", "Ford"), S("GM", "General Motors"),
  S("RIVN", "Rivian"), S("MSTR", "Strategy (MicroStrategy)"), S("HOOD", "Robinhood"), S("SOFI", "SoFi"), S("RBLX", "Roblox"), S("SPOT", "Spotify"), S("ARM", "Arm Holdings"),
  S("SMCI", "Super Micro"), S("DELL", "Dell"),
  S("NED.JO", "Nedbank (JSE)"), S("FSR.JO", "FirstRand (JSE)"), S("CPI.JO", "Capitec (JSE)"), S("SHP.JO", "Shoprite (JSE)"), S("SOL.JO", "Sasol (JSE)"), S("AGL.JO", "Anglo American (JSE)"),
  S("GFI.JO", "Gold Fields (JSE)"), S("ANG.JO", "AngloGold Ashanti (JSE)"), S("IMP.JO", "Impala Platinum (JSE)"), S("VOD.JO", "Vodacom (JSE)"), S("BTI.JO", "British American Tobacco (JSE)"),
  // ---- more indices and ETFs ----
  I("^IXIC", "Nasdaq", "Nasdaq Composite"), I("^RUT", "Russell 2000", "US small caps"), I("^STOXX50E", "Euro Stoxx 50", "Eurozone"), I("^FCHI", "CAC 40", "Paris"),
  I("^AXJO", "ASX 200", "Sydney"), I("^NSEI", "Nifty 50", "India"), I("^BSESN", "Sensex", "India"), I("^KS11", "KOSPI", "Seoul"), I("^GSPTSE", "TSX", "Toronto"), I("^BVSP", "Bovespa", "São Paulo"),
  I("GLD", "GLD", "Gold ETF"), I("SLV", "SLV", "Silver ETF"), I("TLT", "TLT", "20+ year US bonds ETF"), I("EEM", "EEM", "Emerging markets ETF"), I("XLE", "XLE", "Energy stocks ETF"),
  I("XLF", "XLF", "Financial stocks ETF"), I("XLK", "XLK", "Tech stocks ETF"), I("ARKK", "ARKK", "ARK Innovation ETF"), I("VTI", "VTI", "Total US market ETF"), I("IBIT", "IBIT", "Bitcoin ETF"),
  // ---- more forex ----
  F("EURCHF", "Euro / Franc"), F("EURAUD", "Euro / Aussie"), F("EURCAD", "Euro / Loonie"), F("GBPCHF", "Pound / Franc"), F("GBPAUD", "Pound / Aussie"), F("AUDJPY", "Aussie / Yen"),
  F("CADJPY", "Loonie / Yen"), F("CHFJPY", "Franc / Yen"), F("NZDJPY", "Kiwi / Yen"), F("AUDNZD", "Aussie / Kiwi"), F("USDMXN", "US dollar / Peso"), F("USDTRY", "US dollar / Lira"),
  F("USDINR", "US dollar / Rupee"), F("USDNGN", "US dollar / Naira"), F("USDEGP", "US dollar / Egyptian pound"), F("USDGHS", "US dollar / Cedi"), F("USDUGX", "US dollar / Ugandan shilling"),
  F("USDTZS", "US dollar / Tanzanian shilling"), F("USDCNH", "US dollar / Yuan"), F("USDSGD", "US dollar / Singapore dollar"), F("USDSEK", "US dollar / Krona"), F("USDNOK", "US dollar / Krone"), F("USDPLN", "US dollar / Zloty"),
  // ---- more commodities ----
  M("PA=F", "Palladium", "Palladium futures"), M("HO=F", "Heating oil", "Heating oil futures"), M("RB=F", "Gasoline", "Gasoline futures"), M("ZS=F", "Soybeans", "Soybean futures"),
  M("SB=F", "Sugar", "Sugar futures"), M("CC=F", "Cocoa", "Cocoa futures"), M("CT=F", "Cotton", "Cotton futures"), M("LE=F", "Live cattle", "Live cattle futures"), M("OJ=F", "Orange juice", "Orange juice futures"),
  // ---- v1: still more markets ----
  C("JTO", "Jito"), C("ZRO", "LayerZero"), C("STRK", "Starknet"), C("EIGEN", "EigenLayer"), C("ETHFI", "ether.fi"), C("PENDLE", "Pendle"), C("AR", "Arweave"), C("THETA", "Theta"), C("EGLD", "MultiversX"), C("FLOW", "Flow"), C("XTZ", "Tezos"), C("EOS", "EOS"), C("NEO", "Neo"), C("IOTA", "IOTA"), C("KAVA", "Kava"), C("CHZ", "Chiliz"), C("ENJ", "Enjin"), C("GALA", "Gala"), C("APE", "ApeCoin"), C("DYDX", "dYdX"), C("GMX", "GMX"), C("SNX", "Synthetix"), C("COMP", "Compound"), C("1INCH", "1inch"), C("SUSHI", "SushiSwap"), C("YFI", "yearn.finance"), C("CAKE", "PancakeSwap"), C("ORDI", "ORDI"), C("BOME", "Book of Meme"), C("PEOPLE", "ConstitutionDAO"), C("NOT", "Notcoin"), C("DOGS", "Dogs"), C("NEIRO", "Neiro"), C("TURBO", "Turbo"), C("PNUT", "Peanut"), C("VIRTUAL", "Virtuals"), C("BERA", "Berachain"), C("KAITO", "Kaito"), C("LAYER", "Solayer"), C("PENGU", "Pudgy Penguins"), C("MOVE", "Movement"), C("ME", "Magic Eden"), C("W", "Wormhole"), C("QNT", "Quant"), C("MKR", "Maker"),
  S("CRCL", "Circle"), S("CRWV", "CoreWeave"), S("RKLB", "Rocket Lab"), S("NBIS", "Nebius"), S("ASTS", "AST SpaceMobile"), S("IONQ", "IonQ"), S("MARA", "MARA Holdings"), S("HIMS", "Hims & Hers"), S("GME", "GameStop"), S("AMC", "AMC"), S("DKNG", "DraftKings"), S("NET", "Cloudflare"), S("DDOG", "Datadog"), S("CRWD", "CrowdStrike"), S("PANW", "Palo Alto Networks"), S("NOW", "ServiceNow"), S("AMAT", "Applied Materials"), S("LRCX", "Lam Research"), S("KLAC", "KLA"), S("TXN", "Texas Instruments"), S("MRVL", "Marvell"), S("ANET", "Arista"), S("APP", "AppLovin"), S("RDDT", "Reddit"), S("MELI", "MercadoLibre"), S("CVNA", "Carvana"), S("OKLO", "Oklo"), S("SMR", "NuScale"), S("CCJ", "Cameco"), S("MRNA", "Moderna"), S("AMGN", "Amgen"), S("MDT", "Medtronic"), S("CAT", "Caterpillar"), S("GEV", "GE Vernova"), S("ETN", "Eaton"), S("CEG", "Constellation Energy"), S("OXY", "Occidental"), S("IBKR", "Interactive Brokers"), S("BX", "Blackstone"), S("ACN", "Accenture"), S("EBAY", "eBay"), S("ZM", "Zoom"), S("TTWO", "Take-Two"), S("SNPS", "Synopsys"), S("TEAM", "Atlassian"), S("MDB", "MongoDB"), S("ZS", "Zscaler"), S("PATH", "UiPath"), S("NVO", "Novo Nordisk"), S("NOK", "Nokia"), S("HPE", "Hewlett Packard Enterprise"), S("CIEN", "Ciena"), S("WDC", "Western Digital"), S("GLW", "Corning"), S("ALAB", "Astera Labs"), S("TEM", "Tempus AI"), S("VKTX", "Viking Therapeutics"), S("IREN", "IREN"), S("HUT", "Hut 8"), S("CRDO", "Credo"),
  I("SOXL", "SOXL", "Chip stocks 3x ETF"), I("TQQQ", "TQQQ", "Nasdaq 3x ETF"), I("SQQQ", "SQQQ", "Nasdaq -3x ETF"), I("SMH", "SMH", "Semiconductor ETF"), I("SOXX", "SOXX", "Semiconductor ETF (iShares)"), I("GDX", "GDX", "Gold miners ETF"), I("XBI", "XBI", "Biotech ETF"), I("EWZ", "EWZ", "Brazil ETF"), I("EWJ", "EWJ", "Japan ETF"), I("EWY", "EWY", "South Korea ETF"), I("UVXY", "UVXY", "Volatility 1.5x ETF"), I("BITO", "BITO", "Bitcoin futures ETF"), I("IGV", "IGV", "Software ETF"), I("URNM", "URNM", "Uranium miners ETF"),
  F("EURNZD", "Euro / Kiwi"), F("GBPNZD", "Pound / Kiwi"), F("GBPCAD", "Pound / Loonie"), F("AUDCAD", "Aussie / Loonie"), F("AUDCHF", "Aussie / Franc"), F("NZDCAD", "Kiwi / Loonie"), F("CADCHF", "Loonie / Franc"), F("USDTHB", "US dollar / Baht"), F("USDPHP", "US dollar / Peso (PH)"), F("USDIDR", "US dollar / Rupiah"), F("USDKRW", "US dollar / Won"), F("USDBRL", "US dollar / Real"), F("EURZAR", "Euro / Rand"), F("GBPZAR", "Pound / Rand"), F("USDHKD", "US dollar / HK dollar"),
  M("ALI=F", "Aluminium", "Aluminium futures"), M("ZO=F", "Oats", "Oat futures"), M("ZR=F", "Rough rice", "Rice futures"), M("GF=F", "Feeder cattle", "Feeder cattle futures"), M("HE=F", "Lean hogs", "Lean hog futures"), M("ZL=F", "Soybean oil", "Soybean oil futures"), M("ZM=F", "Soybean meal", "Soybean meal futures"),
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
  // The server takes up to 120 symbols per call; larger lists are fetched in parallel chunks.
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 60) chunks.push(ids.slice(i, i + 60));
  const parts = await Promise.all(chunks.map(async (c) => {
    const r = await fetch(`${API}/quotes?symbols=${encodeURIComponent(c.join(","))}`);
    const j = await r.json().catch(() => ({}));
    return (j.quotes ?? {}) as Record<string, Quote>;
  }));
  return Object.assign({}, ...parts);
}

const cache = new Map<string, { at: number; data: Candle[] }>();

export async function getCandles(symbol: string, tf: Tf, fresh = false): Promise<Candle[]> {
  const key = `${symbol}|${tf}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 25_000) return hit.data;
  const r = await fetch(`${API}/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(j.candles)) throw new Error(j.error ?? `Market data request failed (${r.status})`);
  if (j.candles.length < 120) throw new Error(tf === "1M" || tf === "1w" ? `This market doesn't have enough ${tf === "1M" ? "monthly" : "weekly"} history yet to read waves (${j.candles.length} candles). Try a ${tf === "1M" ? "weekly" : "daily"} chart.` : "Not enough price history on this timeframe to read waves. Try a higher timeframe.");
  cache.set(key, { at: Date.now(), data: j.candles });
  return j.candles;
}

export const HTF: Record<Tf, Tf | null> = { "5m": "1h", "15m": "1h", "30m": "4h", "1h": "4h", "2h": "1d", "4h": "1d", "1d": "1w", "1w": "1M", "1M": null };

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
export type PaperTrade = { id: string; symbol: string; label: string; tf: string; dir: "long" | "short"; setup: string; score: number; source: "manual" | "auto"; status: "open" | "closed"; opened_at: string; closed_at: string | null; entry: number; stop: number; initial_stop: number; target1: number; target2: number; qty: number; qty_open: number; t1_hit: boolean; realized: number; exit_price: number | null; close_reason: string | null; last_price: number | null; tip: string | null; close_by?: string | null };
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
  /** Delete finished paper trades: some by id, or all of them. Open trades and the balance are untouched. */
  deleteHistory: (key: string, b: { ids?: string[]; all?: boolean }): Promise<{ deleted: number }> => pfetch(key, "history-delete", b),
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
  if (hit && Date.now() - hit.at < 9 * 60_000) return hit.data;
  const r = await fetch(NEWS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: inst.id, name: inst.name, market: inst.market, tf, technical }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.headlines) throw new Error(j.error ?? "News is unavailable right now.");
  newsCache.set(key, { at: Date.now(), data: j });
  return j;
}

// ---------- Background picks (scanned every 15 minutes on the server) ----------
export const PICKS = "https://fkrgiaeglingmogcsyik.supabase.co/functions/v1/viko-picks";
export type PickSetup = Pick<Setup, "name" | "degree" | "dir" | "entry" | "stop" | "invalidation" | "target1" | "target2" | "score" | "verdict" | "hardFail" | "triggered" | "rr1" | "rr2" | "expectBars">;
export type PickRow = { symbol: string; tf: Tf; label: string; market: string; price: number; candle_t: number; scanned_at: string; verdict: Setup["verdict"] | null; dir: "long" | "short" | null; score: number | null; hard_fail: boolean | null; triggered: boolean | null; rr1: number | null; setup: PickSetup | null; news_warn: string | null };
export async function getPicks(): Promise<{ rows: PickRow[]; now: number }> {
  const r = await fetch(`${PICKS}/list`);
  if (!r.ok) throw new Error(`Couldn't load today's picks (${r.status}).`);
  return r.json();
}

// ---------- Binance USD-M futures (real or demo orders, keys stay on the server) ----------
export const BINANCE = "https://fkrgiaeglingmogcsyik.supabase.co/functions/v1/viko-binance";
export type BnMode = "demo" | "live";
export type BnPosition = { symbol: string; qty: number; entry: number; mark: number; pnl: number; liq: number; leverage: number; margin: number; orders: { type: string; trigger: number; qty: number; close: boolean }[] };
export type BnStatus = { mode: BnMode; region: string | null; reachable: boolean; keysSet: boolean; liveKeysSet: boolean; connected: boolean; balance?: number; available?: number; unrealized?: number; positions?: BnPosition[]; error?: string };
export type BnOrderResult = { ok: true; mode: BnMode; symbol: string; dir: string; qty: number; entry: number; leverage: number; margin: number; stop: number; target1: number; target2: number; notes: string[] };
export type BnHistory = { id: number; at: string; mode: BnMode; symbol: string; dir: string; qty: number; entry: number; leverage: number; margin: number; stop: number; target1: number; target2: number; status: string; note: string | null; label: string | null };
export const BN_REGIONS: [string, string][] = [["ap-south-1", "Mumbai (recommended)"], ["ap-southeast-1", "Singapore"], ["ap-northeast-1", "Tokyo"], ["eu-central-1", "Frankfurt"], ["sa-east-1", "São Paulo"]];
async function bfetch(key: string, region: string, route: string, body?: unknown, query = "") {
  const r = await fetch(`${BINANCE}/${route}?forceFunctionRegion=${encodeURIComponent(region)}${query}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "x-viko-key": key }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Binance request failed (${r.status}).`);
  return j;
}
export const binance = {
  status: (key: string, region: string, mode: BnMode): Promise<BnStatus> => bfetch(key, region, "status", undefined, `&mode=${mode}`),
  order: (key: string, region: string, b: Record<string, unknown>): Promise<BnOrderResult> => bfetch(key, region, "order", b),
  close: (key: string, region: string, mode: BnMode, symbol: string) => bfetch(key, region, "close", { mode, symbol }),
  history: (key: string, region: string): Promise<{ rows: BnHistory[] }> => bfetch(key, region, "history"),
};

// ---------- Auto-trader (Binance or Deriv, managed on the server) ----------
export const AUTO = "https://fkrgiaeglingmogcsyik.supabase.co/functions/v1/viko-auto";
export type AutoAlloc = "each" | "equal" | "score" | "custom";
/** A setup the user chose to trade as it stands (from a chart tip or Today's picks). */
export type AutoPick = { symbol: string; label: string; market: string; tf: string; dir: "long" | "short"; score: number; name: string; stop: number; target1: number; target2: number; expectBars: number };
export type AutoCfg = { broker: "binance" | "deriv" | "bybit" | "mt5" | "both"; mode: "demo" | "live"; amount: number; count: number; horizon: "24h" | "48h" | "72h" | "1w" | "1m"; strict: number; risk: "careful" | "balanced" | "bold" | "max"; alloc: AutoAlloc; custom?: Record<string, number> | null; fallback: boolean; picks?: AutoPick[] };
export type AutoPreviewTrade = { symbol: string; label: string; market: string; tf: string; dir: "long" | "short"; score: number; agree: number; against: number; opinion: string; stance: string; setup: string; broker: "binance" | "deriv"; brokerSymbol: string; below: boolean; entry: number; stop: number; target1: number; target2: number; money: number; leverage: number; loss: number; profit1: number; profit2: number; hours: [number, number]; newsAgainst?: boolean };
export type Limits = { on: boolean; money: number | null; trades: number | null; loss: number | null; closeOnLoss: boolean; applies: "live" | "all"; tz: string };
export type LimitUsage = { applies: boolean; money: number; trades: number; pnl: number; lossHit: boolean; moneyLeft: number | null; tradesLeft: number | null };
export type AutoDiag = { quality: number; time: number; broker: number; news: number; opinionDropped: number; near: number; examples: string[] };
export type AutoPreview = { trades: AutoPreviewTrade[]; skipped: string[]; total: number; horizon: string; closeBy?: number | null; limits?: { money: number | null; trades: number | null; loss: number | null; used: number; count: number; pnl: number; lossHit: boolean } | null; diag?: AutoDiag; venues?: { binance: number | null; deriv: number | null }; connected?: { binance: boolean; deriv: boolean; bybit?: boolean; mt5?: boolean } };
export type DerivContract = { id: number; symbol: string; type: string; stake: number; profit: number; spot: number; entry: number; multiplier: number };
export type DerivStatus = { mode: string; keysSet: boolean; connected: boolean; account?: string; currency?: string; balance?: number; contracts?: DerivContract[] };
export type AutoPlan = { id: string; created_at: string; broker: string; mode: string; amount: number; count: number; horizon: string; strict: number; risk: string; status: string; ends_at: string; enter_until: string; closed_at: string | null };
export type AutoPosition = { id: string; plan_id: string; broker: string; mode: string; symbol: string; label: string; tf: string; dir: string; setup: string; score: number; opinion: string | null; stake: number; leverage: number; entry: number; stop: number; initial_stop: number; target1: number; target2: number; t1_hit: boolean; status: string; opened_at: string; closed_at: string | null; pnl: number | null; close_reason: string | null; last_price: number | null; last_pnl: number | null };
export type AutoEvent = { id: number; at: string; plan_id: string | null; message: string };
export type AutoHistory = { id: string; plan_id: string; broker: string; mode: string; symbol: string; label: string; tf: string; dir: string; stake: number; leverage: number; entry: number; pnl: number; close_reason: string; opened_at: string; closed_at: string; score: number };
async function afetch(key: string, route: string, body?: unknown, query = "") {
  const r = await fetch(`${AUTO}/${route}?forceFunctionRegion=ap-south-1${query}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "x-viko-key": key }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Auto-trader request failed (${r.status}).`);
  return j;
}
export const auto = {
  preview: (key: string, c: AutoCfg): Promise<AutoPreview> => afetch(key, "preview", c),
  start: (key: string, c: AutoCfg): Promise<{ ok: true; plan_id: string; placed: number; skipped: string[] }> => afetch(key, "start", c),
  state: (key: string, refresh = false): Promise<{ plans: AutoPlan[]; positions: AutoPosition[]; events: AutoEvent[]; now: number }> => afetch(key, "state", undefined, refresh ? "&refresh=1" : ""),
  close: (key: string, b: { plan_id?: string; position_id?: string }) => afetch(key, "close", b),
  history: (key: string): Promise<{ rows: AutoHistory[] }> => afetch(key, "history"),
  deleteHistory: (key: string, b: { ids?: string[]; all?: boolean }): Promise<{ deleted: number }> => afetch(key, "history-delete", b),
  connect: (key: string, broker: string, mode: string): Promise<{ ok: true; balance: number; currency: string; account?: string }> => afetch(key, "connect", undefined, `&broker=${broker}&mode=${mode}`),
  derivStatus: (key: string, mode: string): Promise<DerivStatus> => afetch(key, "deriv-status", undefined, `&mode=${mode}`),
  derivClose: (key: string, mode: string, contract_id: number) => afetch(key, "deriv-close", { mode, contract_id }),
  limits: (key: string, set?: Limits): Promise<{ limits: Limits; today: { demo: LimitUsage; live: LimitUsage } }> => afetch(key, "limits", set),
  markets: async (): Promise<{ total: number; binance_demo: number; binance_live: number; deriv?: number; deriv_symbols?: number; bybit?: number; mt5_demo?: number; mt5_live?: number }> => { const r = await fetch(`${AUTO}/markets?forceFunctionRegion=ap-south-1`); return r.json(); },
};

// ---------------- alerts ----------------
export const NOTIFY = "https://fkrgiaeglingmogcsyik.supabase.co/functions/v1/viko-notify";
export type NotifySettings = {
  events: { open: boolean; t1: boolean; close: boolean; limit: boolean };
  accounts: { live: boolean; demo: boolean; paper: boolean };
  push: { on: boolean; devices: { endpoint: string; ua: string; added: string }[] };
  telegram: { on: boolean; token: string; chat: string };
  whatsapp: { on: boolean; phone: string; apikey: string };
  email: { on: boolean; to: string; key: string };
  ntfy: { on: boolean; topic: string };
  discord: { on: boolean; url: string };
  slack: { on: boolean; url: string };
};
export type SentAlert = { id: number; at: string; kind: string; mode: string; title: string; sent_at: string | null; result: Record<string, string> | null };
async function nfetch(key: string, route: string, body?: unknown) {
  const r = await fetch(`${NOTIFY}/${route}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "x-viko-key": key }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Alerts request failed (${r.status}).`);
  return j;
}
export const notify = {
  get: (key: string): Promise<{ settings: NotifySettings; recent: SentAlert[]; pushKey: string }> => nfetch(key, "settings"),
  save: (key: string, s: Partial<NotifySettings> | Record<string, unknown>): Promise<{ settings: NotifySettings }> => nfetch(key, "settings", s),
  subscribe: (key: string, sub: PushSubscriptionJSON, ua: string) => nfetch(key, "subscribe", { sub, ua }),
  unsubscribe: (key: string, endpoint: string) => nfetch(key, "unsubscribe", { endpoint }),
  test: (key: string, channel?: string): Promise<{ results: Record<string, string> }> => nfetch(key, "test", { channel }),
  telegramFind: (key: string, token?: string): Promise<{ chat: string; who: string; settings: NotifySettings }> => nfetch(key, "telegram-find", { token }),
};
