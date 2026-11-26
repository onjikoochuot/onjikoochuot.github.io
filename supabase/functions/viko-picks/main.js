// supabase/functions/viko-picks/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// supabase/functions/viko-picks/market.ts
var UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
async function binance(sym, tf) {
  const hosts = ["https://data-api.binance.vision", "https://api.binance.com", "https://api1.binance.com"];
  let lastErr = "";
  for (const h of hosts) {
    try {
      const r = await fetch(`${h}/api/v3/klines?symbol=${sym}&interval=${tf}&limit=1000`);
      if (!r.ok) {
        lastErr = `${h} ${r.status}`;
        continue;
      }
      const rows = await r.json();
      return rows.map((k) => ({ t: Math.floor(Number(k[0]) / 1e3), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
    } catch (e) {
      lastErr = String(e);
    }
  }
  throw new Error(`binance: ${lastErr}`);
}
async function yahoo(sym, tf) {
  const cfg = {
    "5m": ["5m", "60d", 0],
    "15m": ["15m", "60d", 0],
    "30m": ["30m", "60d", 0],
    "1h": ["60m", "730d", 0],
    "2h": ["60m", "730d", 7200],
    "4h": ["60m", "730d", 14400],
    "1d": ["1d", "10y", 0],
    "1w": ["1wk", "max", 0],
    "1M": ["1mo", "max", 0]
  };
  const [iv, range, bucketSec] = cfg[tf];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${iv}&range=${range}&includePrePost=false`;
  let r = await fetch(url, { headers: UA });
  if (!r.ok) r = await fetch(url.replace("query1", "query2"), { headers: UA });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(j?.chart?.error?.description ?? "yahoo: no data");
  const ts = res.timestamp ?? [];
  const q = res.indicators.quote[0];
  let out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((x) => x == null || Number.isNaN(x))) continue;
    out.push({ t: ts[i], o, h, l, c, v: q.volume?.[i] ?? 0 });
  }
  if (bucketSec) {
    const agg = [];
    for (const k of out) {
      const bucket = Math.floor(k.t / bucketSec) * bucketSec;
      const last = agg[agg.length - 1];
      if (last && last.t === bucket) {
        last.h = Math.max(last.h, k.h);
        last.l = Math.min(last.l, k.l);
        last.c = k.c;
        last.v += k.v;
      } else agg.push({ ...k, t: bucket });
    }
    out = agg;
  }
  return out.slice(-1e3);
}
async function candles(symbol, tf) {
  const m = symbol.match(/^(crypto|yahoo):([A-Za-z0-9.=^\-]{1,24})$/);
  if (!m) throw new Error("bad symbol");
  return m[1] === "crypto" ? binance(m[2].toUpperCase(), tf) : yahoo(m[2].toUpperCase(), tf);
}
async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// supabase/functions/viko-picks/index.ts
import { analyze } from "https://cdn.jsdelivr.net/gh/onjikoochuot/onjikoochuot.github.io@43d904fd3ac51fbb1788f560f3d55f82a723b40e/supabase/functions/viko-paper/engine.js";

// supabase/functions/viko-picks/universe.ts
var UNIVERSE = [["crypto:BTCUSDT", "BTC/USDT", "Crypto"], ["crypto:ETHUSDT", "ETH/USDT", "Crypto"], ["crypto:SOLUSDT", "SOL/USDT", "Crypto"], ["crypto:BNBUSDT", "BNB/USDT", "Crypto"], ["crypto:XRPUSDT", "XRP/USDT", "Crypto"], ["crypto:ADAUSDT", "ADA/USDT", "Crypto"], ["crypto:DOGEUSDT", "DOGE/USDT", "Crypto"], ["crypto:AVAXUSDT", "AVAX/USDT", "Crypto"], ["crypto:LINKUSDT", "LINK/USDT", "Crypto"], ["crypto:DOTUSDT", "DOT/USDT", "Crypto"], ["crypto:LTCUSDT", "LTC/USDT", "Crypto"], ["crypto:TRXUSDT", "TRX/USDT", "Crypto"], ["crypto:TONUSDT", "TON/USDT", "Crypto"], ["crypto:NEARUSDT", "NEAR/USDT", "Crypto"], ["crypto:ATOMUSDT", "ATOM/USDT", "Crypto"], ["crypto:UNIUSDT", "UNI/USDT", "Crypto"], ["crypto:XLMUSDT", "XLM/USDT", "Crypto"], ["crypto:BCHUSDT", "BCH/USDT", "Crypto"], ["crypto:SUIUSDT", "SUI/USDT", "Crypto"], ["crypto:PEPEUSDT", "PEPE/USDT", "Crypto"], ["yahoo:AAPL", "AAPL", "Stocks"], ["yahoo:MSFT", "MSFT", "Stocks"], ["yahoo:NVDA", "NVDA", "Stocks"], ["yahoo:AMZN", "AMZN", "Stocks"], ["yahoo:GOOGL", "GOOGL", "Stocks"], ["yahoo:META", "META", "Stocks"], ["yahoo:TSLA", "TSLA", "Stocks"], ["yahoo:AVGO", "AVGO", "Stocks"], ["yahoo:AMD", "AMD", "Stocks"], ["yahoo:NFLX", "NFLX", "Stocks"], ["yahoo:JPM", "JPM", "Stocks"], ["yahoo:V", "V", "Stocks"], ["yahoo:MA", "MA", "Stocks"], ["yahoo:KO", "KO", "Stocks"], ["yahoo:DIS", "DIS", "Stocks"], ["yahoo:BA", "BA", "Stocks"], ["yahoo:XOM", "XOM", "Stocks"], ["yahoo:COIN", "COIN", "Stocks"], ["yahoo:PLTR", "PLTR", "Stocks"], ["yahoo:UBER", "UBER", "Stocks"], ["yahoo:NPN.JO", "NPN", "Stocks"], ["yahoo:MTN.JO", "MTN", "Stocks"], ["yahoo:SBK.JO", "SBK", "Stocks"], ["yahoo:SPY", "SPY", "Indices"], ["yahoo:QQQ", "QQQ", "Indices"], ["yahoo:DIA", "DIA", "Indices"], ["yahoo:IWM", "IWM", "Indices"], ["yahoo:^GSPC", "S&P 500", "Indices"], ["yahoo:^NDX", "Nasdaq 100", "Indices"], ["yahoo:^DJI", "Dow Jones", "Indices"], ["yahoo:^FTSE", "FTSE 100", "Indices"], ["yahoo:^GDAXI", "DAX", "Indices"], ["yahoo:^N225", "Nikkei 225", "Indices"], ["yahoo:^HSI", "Hang Seng", "Indices"], ["yahoo:^VIX", "VIX", "Indices"], ["yahoo:EURUSD=X", "EUR/USD", "Forex"], ["yahoo:GBPUSD=X", "GBP/USD", "Forex"], ["yahoo:USDJPY=X", "USD/JPY", "Forex"], ["yahoo:AUDUSD=X", "AUD/USD", "Forex"], ["yahoo:USDCAD=X", "USD/CAD", "Forex"], ["yahoo:USDCHF=X", "USD/CHF", "Forex"], ["yahoo:NZDUSD=X", "NZD/USD", "Forex"], ["yahoo:EURGBP=X", "EUR/GBP", "Forex"], ["yahoo:EURJPY=X", "EUR/JPY", "Forex"], ["yahoo:GBPJPY=X", "GBP/JPY", "Forex"], ["yahoo:USDZAR=X", "USD/ZAR", "Forex"], ["yahoo:USDKES=X", "USD/KES", "Forex"], ["yahoo:GC=F", "Gold", "Commodities"], ["yahoo:SI=F", "Silver", "Commodities"], ["yahoo:CL=F", "Crude oil", "Commodities"], ["yahoo:BZ=F", "Brent", "Commodities"], ["yahoo:NG=F", "Natural gas", "Commodities"], ["yahoo:HG=F", "Copper", "Commodities"], ["yahoo:PL=F", "Platinum", "Commodities"], ["yahoo:ZC=F", "Corn", "Commodities"], ["yahoo:ZW=F", "Wheat", "Commodities"], ["yahoo:KC=F", "Coffee", "Commodities"], ["crypto:AAVEUSDT", "AAVE/USDT", "Crypto"], ["crypto:ARBUSDT", "ARB/USDT", "Crypto"], ["crypto:OPUSDT", "OP/USDT", "Crypto"], ["crypto:APTUSDT", "APT/USDT", "Crypto"], ["crypto:INJUSDT", "INJ/USDT", "Crypto"], ["crypto:FILUSDT", "FIL/USDT", "Crypto"], ["crypto:ICPUSDT", "ICP/USDT", "Crypto"], ["crypto:HBARUSDT", "HBAR/USDT", "Crypto"], ["crypto:VETUSDT", "VET/USDT", "Crypto"], ["crypto:ALGOUSDT", "ALGO/USDT", "Crypto"], ["crypto:ETCUSDT", "ETC/USDT", "Crypto"], ["crypto:SHIBUSDT", "SHIB/USDT", "Crypto"], ["crypto:WIFUSDT", "WIF/USDT", "Crypto"], ["crypto:BONKUSDT", "BONK/USDT", "Crypto"], ["crypto:FETUSDT", "FET/USDT", "Crypto"], ["crypto:RENDERUSDT", "RENDER/USDT", "Crypto"], ["crypto:TIAUSDT", "TIA/USDT", "Crypto"], ["crypto:SEIUSDT", "SEI/USDT", "Crypto"], ["crypto:STXUSDT", "STX/USDT", "Crypto"], ["crypto:IMXUSDT", "IMX/USDT", "Crypto"], ["crypto:LDOUSDT", "LDO/USDT", "Crypto"], ["crypto:GRTUSDT", "GRT/USDT", "Crypto"], ["crypto:SANDUSDT", "SAND/USDT", "Crypto"], ["crypto:MANAUSDT", "MANA/USDT", "Crypto"], ["crypto:AXSUSDT", "AXS/USDT", "Crypto"], ["crypto:CRVUSDT", "CRV/USDT", "Crypto"], ["crypto:RUNEUSDT", "RUNE/USDT", "Crypto"], ["crypto:JUPUSDT", "JUP/USDT", "Crypto"], ["crypto:PYTHUSDT", "PYTH/USDT", "Crypto"], ["crypto:ENAUSDT", "ENA/USDT", "Crypto"], ["crypto:WLDUSDT", "WLD/USDT", "Crypto"], ["crypto:TAOUSDT", "TAO/USDT", "Crypto"], ["crypto:ONDOUSDT", "ONDO/USDT", "Crypto"], ["crypto:FLOKIUSDT", "FLOKI/USDT", "Crypto"], ["crypto:TRUMPUSDT", "TRUMP/USDT", "Crypto"], ["crypto:ZECUSDT", "ZEC/USDT", "Crypto"], ["crypto:XMRUSDT", "XMR/USDT", "Crypto"], ["yahoo:ADBE", "ADBE", "Stocks"], ["yahoo:CRM", "CRM", "Stocks"], ["yahoo:ORCL", "ORCL", "Stocks"], ["yahoo:INTC", "INTC", "Stocks"], ["yahoo:QCOM", "QCOM", "Stocks"], ["yahoo:CSCO", "CSCO", "Stocks"], ["yahoo:IBM", "IBM", "Stocks"], ["yahoo:SHOP", "SHOP", "Stocks"], ["yahoo:PYPL", "PYPL", "Stocks"], ["yahoo:ABNB", "ABNB", "Stocks"], ["yahoo:SNOW", "SNOW", "Stocks"], ["yahoo:MU", "MU", "Stocks"], ["yahoo:ASML", "ASML", "Stocks"], ["yahoo:TSM", "TSM", "Stocks"], ["yahoo:BABA", "BABA", "Stocks"], ["yahoo:PDD", "PDD", "Stocks"], ["yahoo:NIO", "NIO", "Stocks"], ["yahoo:JD", "JD", "Stocks"], ["yahoo:SONY", "SONY", "Stocks"], ["yahoo:TM", "TM", "Stocks"], ["yahoo:NKE", "NKE", "Stocks"], ["yahoo:MCD", "MCD", "Stocks"], ["yahoo:SBUX", "SBUX", "Stocks"], ["yahoo:WMT", "WMT", "Stocks"], ["yahoo:COST", "COST", "Stocks"], ["yahoo:HD", "HD", "Stocks"], ["yahoo:TGT", "TGT", "Stocks"], ["yahoo:PG", "PG", "Stocks"], ["yahoo:JNJ", "JNJ", "Stocks"], ["yahoo:PFE", "PFE", "Stocks"], ["yahoo:MRK", "MRK", "Stocks"], ["yahoo:LLY", "LLY", "Stocks"], ["yahoo:ABBV", "ABBV", "Stocks"], ["yahoo:UNH", "UNH", "Stocks"], ["yahoo:CVX", "CVX", "Stocks"], ["yahoo:COP", "COP", "Stocks"], ["yahoo:BAC", "BAC", "Stocks"], ["yahoo:WFC", "WFC", "Stocks"], ["yahoo:GS", "GS", "Stocks"], ["yahoo:MS", "MS", "Stocks"], ["yahoo:C", "C", "Stocks"], ["yahoo:BRK-B", "BRK-B", "Stocks"], ["yahoo:T", "T", "Stocks"], ["yahoo:VZ", "VZ", "Stocks"], ["yahoo:F", "F", "Stocks"], ["yahoo:GM", "GM", "Stocks"], ["yahoo:RIVN", "RIVN", "Stocks"], ["yahoo:MSTR", "MSTR", "Stocks"], ["yahoo:HOOD", "HOOD", "Stocks"], ["yahoo:SOFI", "SOFI", "Stocks"], ["yahoo:RBLX", "RBLX", "Stocks"], ["yahoo:SPOT", "SPOT", "Stocks"], ["yahoo:ARM", "ARM", "Stocks"], ["yahoo:SMCI", "SMCI", "Stocks"], ["yahoo:DELL", "DELL", "Stocks"], ["yahoo:NED.JO", "NED", "Stocks"], ["yahoo:FSR.JO", "FSR", "Stocks"], ["yahoo:CPI.JO", "CPI", "Stocks"], ["yahoo:SHP.JO", "SHP", "Stocks"], ["yahoo:SOL.JO", "SOL", "Stocks"], ["yahoo:AGL.JO", "AGL", "Stocks"], ["yahoo:GFI.JO", "GFI", "Stocks"], ["yahoo:ANG.JO", "ANG", "Stocks"], ["yahoo:IMP.JO", "IMP", "Stocks"], ["yahoo:VOD.JO", "VOD", "Stocks"], ["yahoo:BTI.JO", "BTI", "Stocks"], ["yahoo:^IXIC", "Nasdaq", "Indices"], ["yahoo:^RUT", "Russell 2000", "Indices"], ["yahoo:^STOXX50E", "Euro Stoxx 50", "Indices"], ["yahoo:^FCHI", "CAC 40", "Indices"], ["yahoo:^AXJO", "ASX 200", "Indices"], ["yahoo:^NSEI", "Nifty 50", "Indices"], ["yahoo:^BSESN", "Sensex", "Indices"], ["yahoo:^KS11", "KOSPI", "Indices"], ["yahoo:^GSPTSE", "TSX", "Indices"], ["yahoo:^BVSP", "Bovespa", "Indices"], ["yahoo:GLD", "GLD", "Indices"], ["yahoo:SLV", "SLV", "Indices"], ["yahoo:TLT", "TLT", "Indices"], ["yahoo:EEM", "EEM", "Indices"], ["yahoo:XLE", "XLE", "Indices"], ["yahoo:XLF", "XLF", "Indices"], ["yahoo:XLK", "XLK", "Indices"], ["yahoo:ARKK", "ARKK", "Indices"], ["yahoo:VTI", "VTI", "Indices"], ["yahoo:IBIT", "IBIT", "Indices"], ["yahoo:EURCHF=X", "EUR/CHF", "Forex"], ["yahoo:EURAUD=X", "EUR/AUD", "Forex"], ["yahoo:EURCAD=X", "EUR/CAD", "Forex"], ["yahoo:GBPCHF=X", "GBP/CHF", "Forex"], ["yahoo:GBPAUD=X", "GBP/AUD", "Forex"], ["yahoo:AUDJPY=X", "AUD/JPY", "Forex"], ["yahoo:CADJPY=X", "CAD/JPY", "Forex"], ["yahoo:CHFJPY=X", "CHF/JPY", "Forex"], ["yahoo:NZDJPY=X", "NZD/JPY", "Forex"], ["yahoo:AUDNZD=X", "AUD/NZD", "Forex"], ["yahoo:USDMXN=X", "USD/MXN", "Forex"], ["yahoo:USDTRY=X", "USD/TRY", "Forex"], ["yahoo:USDINR=X", "USD/INR", "Forex"], ["yahoo:USDNGN=X", "USD/NGN", "Forex"], ["yahoo:USDEGP=X", "USD/EGP", "Forex"], ["yahoo:USDGHS=X", "USD/GHS", "Forex"], ["yahoo:USDUGX=X", "USD/UGX", "Forex"], ["yahoo:USDTZS=X", "USD/TZS", "Forex"], ["yahoo:USDCNH=X", "USD/CNH", "Forex"], ["yahoo:USDSGD=X", "USD/SGD", "Forex"], ["yahoo:USDSEK=X", "USD/SEK", "Forex"], ["yahoo:USDNOK=X", "USD/NOK", "Forex"], ["yahoo:USDPLN=X", "USD/PLN", "Forex"], ["yahoo:PA=F", "Palladium", "Commodities"], ["yahoo:HO=F", "Heating oil", "Commodities"], ["yahoo:RB=F", "Gasoline", "Commodities"], ["yahoo:ZS=F", "Soybeans", "Commodities"], ["yahoo:SB=F", "Sugar", "Commodities"], ["yahoo:CC=F", "Cocoa", "Commodities"], ["yahoo:CT=F", "Cotton", "Commodities"], ["yahoo:LE=F", "Live cattle", "Commodities"], ["yahoo:OJ=F", "Orange juice", "Commodities"], ["crypto:JTOUSDT", "JTO/USDT", "Crypto"], ["crypto:ZROUSDT", "ZRO/USDT", "Crypto"], ["crypto:STRKUSDT", "STRK/USDT", "Crypto"], ["crypto:EIGENUSDT", "EIGEN/USDT", "Crypto"], ["crypto:ETHFIUSDT", "ETHFI/USDT", "Crypto"], ["crypto:PENDLEUSDT", "PENDLE/USDT", "Crypto"], ["crypto:ARUSDT", "AR/USDT", "Crypto"], ["crypto:THETAUSDT", "THETA/USDT", "Crypto"], ["crypto:EGLDUSDT", "EGLD/USDT", "Crypto"], ["crypto:FLOWUSDT", "FLOW/USDT", "Crypto"], ["crypto:XTZUSDT", "XTZ/USDT", "Crypto"], ["crypto:EOSUSDT", "EOS/USDT", "Crypto"], ["crypto:NEOUSDT", "NEO/USDT", "Crypto"], ["crypto:IOTAUSDT", "IOTA/USDT", "Crypto"], ["crypto:KAVAUSDT", "KAVA/USDT", "Crypto"], ["crypto:CHZUSDT", "CHZ/USDT", "Crypto"], ["crypto:ENJUSDT", "ENJ/USDT", "Crypto"], ["crypto:GALAUSDT", "GALA/USDT", "Crypto"], ["crypto:APEUSDT", "APE/USDT", "Crypto"], ["crypto:DYDXUSDT", "DYDX/USDT", "Crypto"], ["crypto:GMXUSDT", "GMX/USDT", "Crypto"], ["crypto:SNXUSDT", "SNX/USDT", "Crypto"], ["crypto:COMPUSDT", "COMP/USDT", "Crypto"], ["crypto:1INCHUSDT", "1INCH/USDT", "Crypto"], ["crypto:SUSHIUSDT", "SUSHI/USDT", "Crypto"], ["crypto:YFIUSDT", "YFI/USDT", "Crypto"], ["crypto:CAKEUSDT", "CAKE/USDT", "Crypto"], ["crypto:ORDIUSDT", "ORDI/USDT", "Crypto"], ["crypto:BOMEUSDT", "BOME/USDT", "Crypto"], ["crypto:PEOPLEUSDT", "PEOPLE/USDT", "Crypto"], ["crypto:NOTUSDT", "NOT/USDT", "Crypto"], ["crypto:DOGSUSDT", "DOGS/USDT", "Crypto"], ["crypto:NEIROUSDT", "NEIRO/USDT", "Crypto"], ["crypto:TURBOUSDT", "TURBO/USDT", "Crypto"], ["crypto:PNUTUSDT", "PNUT/USDT", "Crypto"], ["crypto:VIRTUALUSDT", "VIRTUAL/USDT", "Crypto"], ["crypto:BERAUSDT", "BERA/USDT", "Crypto"], ["crypto:KAITOUSDT", "KAITO/USDT", "Crypto"], ["crypto:LAYERUSDT", "LAYER/USDT", "Crypto"], ["crypto:PENGUUSDT", "PENGU/USDT", "Crypto"], ["crypto:MOVEUSDT", "MOVE/USDT", "Crypto"], ["crypto:MEUSDT", "ME/USDT", "Crypto"], ["crypto:WUSDT", "W/USDT", "Crypto"], ["crypto:QNTUSDT", "QNT/USDT", "Crypto"], ["crypto:MKRUSDT", "MKR/USDT", "Crypto"], ["yahoo:CRCL", "CRCL", "Stocks"], ["yahoo:CRWV", "CRWV", "Stocks"], ["yahoo:RKLB", "RKLB", "Stocks"], ["yahoo:NBIS", "NBIS", "Stocks"], ["yahoo:ASTS", "ASTS", "Stocks"], ["yahoo:IONQ", "IONQ", "Stocks"], ["yahoo:MARA", "MARA", "Stocks"], ["yahoo:HIMS", "HIMS", "Stocks"], ["yahoo:GME", "GME", "Stocks"], ["yahoo:AMC", "AMC", "Stocks"], ["yahoo:DKNG", "DKNG", "Stocks"], ["yahoo:NET", "NET", "Stocks"], ["yahoo:DDOG", "DDOG", "Stocks"], ["yahoo:CRWD", "CRWD", "Stocks"], ["yahoo:PANW", "PANW", "Stocks"], ["yahoo:NOW", "NOW", "Stocks"], ["yahoo:AMAT", "AMAT", "Stocks"], ["yahoo:LRCX", "LRCX", "Stocks"], ["yahoo:KLAC", "KLAC", "Stocks"], ["yahoo:TXN", "TXN", "Stocks"], ["yahoo:MRVL", "MRVL", "Stocks"], ["yahoo:ANET", "ANET", "Stocks"], ["yahoo:APP", "APP", "Stocks"], ["yahoo:RDDT", "RDDT", "Stocks"], ["yahoo:MELI", "MELI", "Stocks"], ["yahoo:CVNA", "CVNA", "Stocks"], ["yahoo:OKLO", "OKLO", "Stocks"], ["yahoo:SMR", "SMR", "Stocks"], ["yahoo:CCJ", "CCJ", "Stocks"], ["yahoo:MRNA", "MRNA", "Stocks"], ["yahoo:AMGN", "AMGN", "Stocks"], ["yahoo:MDT", "MDT", "Stocks"], ["yahoo:CAT", "CAT", "Stocks"], ["yahoo:GEV", "GEV", "Stocks"], ["yahoo:ETN", "ETN", "Stocks"], ["yahoo:CEG", "CEG", "Stocks"], ["yahoo:OXY", "OXY", "Stocks"], ["yahoo:IBKR", "IBKR", "Stocks"], ["yahoo:BX", "BX", "Stocks"], ["yahoo:ACN", "ACN", "Stocks"], ["yahoo:EBAY", "EBAY", "Stocks"], ["yahoo:ZM", "ZM", "Stocks"], ["yahoo:TTWO", "TTWO", "Stocks"], ["yahoo:SNPS", "SNPS", "Stocks"], ["yahoo:TEAM", "TEAM", "Stocks"], ["yahoo:MDB", "MDB", "Stocks"], ["yahoo:ZS", "ZS", "Stocks"], ["yahoo:PATH", "PATH", "Stocks"], ["yahoo:NVO", "NVO", "Stocks"], ["yahoo:NOK", "NOK", "Stocks"], ["yahoo:HPE", "HPE", "Stocks"], ["yahoo:CIEN", "CIEN", "Stocks"], ["yahoo:WDC", "WDC", "Stocks"], ["yahoo:GLW", "GLW", "Stocks"], ["yahoo:ALAB", "ALAB", "Stocks"], ["yahoo:TEM", "TEM", "Stocks"], ["yahoo:VKTX", "VKTX", "Stocks"], ["yahoo:IREN", "IREN", "Stocks"], ["yahoo:HUT", "HUT", "Stocks"], ["yahoo:CRDO", "CRDO", "Stocks"], ["yahoo:SOXL", "SOXL", "Indices"], ["yahoo:TQQQ", "TQQQ", "Indices"], ["yahoo:SQQQ", "SQQQ", "Indices"], ["yahoo:SMH", "SMH", "Indices"], ["yahoo:SOXX", "SOXX", "Indices"], ["yahoo:GDX", "GDX", "Indices"], ["yahoo:XBI", "XBI", "Indices"], ["yahoo:EWZ", "EWZ", "Indices"], ["yahoo:EWJ", "EWJ", "Indices"], ["yahoo:EWY", "EWY", "Indices"], ["yahoo:UVXY", "UVXY", "Indices"], ["yahoo:BITO", "BITO", "Indices"], ["yahoo:IGV", "IGV", "Indices"], ["yahoo:URNM", "URNM", "Indices"], ["yahoo:EURNZD=X", "EUR/NZD", "Forex"], ["yahoo:GBPNZD=X", "GBP/NZD", "Forex"], ["yahoo:GBPCAD=X", "GBP/CAD", "Forex"], ["yahoo:AUDCAD=X", "AUD/CAD", "Forex"], ["yahoo:AUDCHF=X", "AUD/CHF", "Forex"], ["yahoo:NZDCAD=X", "NZD/CAD", "Forex"], ["yahoo:CADCHF=X", "CAD/CHF", "Forex"], ["yahoo:USDTHB=X", "USD/THB", "Forex"], ["yahoo:USDPHP=X", "USD/PHP", "Forex"], ["yahoo:USDIDR=X", "USD/IDR", "Forex"], ["yahoo:USDKRW=X", "USD/KRW", "Forex"], ["yahoo:USDBRL=X", "USD/BRL", "Forex"], ["yahoo:EURZAR=X", "EUR/ZAR", "Forex"], ["yahoo:GBPZAR=X", "GBP/ZAR", "Forex"], ["yahoo:USDHKD=X", "USD/HKD", "Forex"], ["yahoo:ALI=F", "Aluminium", "Commodities"], ["yahoo:ZO=F", "Oats", "Commodities"], ["yahoo:ZR=F", "Rough rice", "Commodities"], ["yahoo:GF=F", "Feeder cattle", "Commodities"], ["yahoo:HE=F", "Lean hogs", "Commodities"], ["yahoo:ZL=F", "Soybean oil", "Commodities"], ["yahoo:ZM=F", "Soybean meal", "Commodities"], ["yahoo:PEP", "PEP", "Stocks"], ["yahoo:ADI", "ADI", "Stocks"], ["yahoo:INTU", "INTU", "Stocks"], ["yahoo:ISRG", "ISRG", "Stocks"], ["yahoo:TMO", "TMO", "Stocks"], ["yahoo:DHR", "DHR", "Stocks"], ["yahoo:ABT", "ABT", "Stocks"], ["yahoo:BMY", "BMY", "Stocks"], ["yahoo:GILD", "GILD", "Stocks"], ["yahoo:CVS", "CVS", "Stocks"], ["yahoo:CI", "CI", "Stocks"], ["yahoo:ELV", "ELV", "Stocks"], ["yahoo:HON", "HON", "Stocks"], ["yahoo:GE", "GE", "Stocks"], ["yahoo:RTX", "RTX", "Stocks"], ["yahoo:LMT", "LMT", "Stocks"], ["yahoo:NOC", "NOC", "Stocks"], ["yahoo:DE", "DE", "Stocks"], ["yahoo:UNP", "UNP", "Stocks"], ["yahoo:UPS", "UPS", "Stocks"], ["yahoo:FDX", "FDX", "Stocks"], ["yahoo:LOW", "LOW", "Stocks"], ["yahoo:TJX", "TJX", "Stocks"], ["yahoo:BKNG", "BKNG", "Stocks"], ["yahoo:MAR", "MAR", "Stocks"], ["yahoo:CMG", "CMG", "Stocks"], ["yahoo:LULU", "LULU", "Stocks"], ["yahoo:AXP", "AXP", "Stocks"], ["yahoo:SCHW", "SCHW", "Stocks"], ["yahoo:BLK", "BLK", "Stocks"], ["yahoo:SPGI", "SPGI", "Stocks"], ["yahoo:ICE", "ICE", "Stocks"], ["yahoo:CME", "CME", "Stocks"], ["yahoo:PGR", "PGR", "Stocks"], ["yahoo:CB", "CB", "Stocks"], ["yahoo:MMC", "MMC", "Stocks"], ["yahoo:PLD", "PLD", "Stocks"], ["yahoo:AMT", "AMT", "Stocks"], ["yahoo:EQIX", "EQIX", "Stocks"], ["yahoo:NEE", "NEE", "Stocks"], ["yahoo:DUK", "DUK", "Stocks"], ["yahoo:SO", "SO", "Stocks"], ["yahoo:LIN", "LIN", "Stocks"], ["yahoo:SHW", "SHW", "Stocks"], ["yahoo:NEM", "NEM", "Stocks"], ["yahoo:FCX", "FCX", "Stocks"], ["yahoo:MO", "MO", "Stocks"], ["yahoo:PM", "PM", "Stocks"], ["yahoo:MDLZ", "MDLZ", "Stocks"], ["yahoo:CL", "CL", "Stocks"], ["yahoo:ADP", "ADP", "Stocks"], ["yahoo:ORLY", "ORLY", "Stocks"], ["yahoo:AZO", "AZO", "Stocks"], ["yahoo:VRTX", "VRTX", "Stocks"], ["yahoo:REGN", "REGN", "Stocks"], ["yahoo:SYK", "SYK", "Stocks"], ["yahoo:BSX", "BSX", "Stocks"], ["yahoo:ZTS", "ZTS", "Stocks"], ["yahoo:WM", "WM", "Stocks"], ["yahoo:MSI", "MSI", "Stocks"], ["yahoo:XLV", "XLV", "Indices"], ["yahoo:XLI", "XLI", "Indices"], ["yahoo:XLY", "XLY", "Indices"], ["yahoo:XLP", "XLP", "Indices"], ["yahoo:XLU", "XLU", "Indices"], ["yahoo:XLB", "XLB", "Indices"], ["yahoo:XLRE", "XLRE", "Indices"], ["yahoo:XLC", "XLC", "Indices"], ["yahoo:EFA", "EFA", "Indices"], ["yahoo:VWO", "VWO", "Indices"], ["yahoo:FXI", "FXI", "Indices"], ["yahoo:INDA", "INDA", "Indices"], ["yahoo:EWG", "EWG", "Indices"], ["yahoo:EWU", "EWU", "Indices"], ["yahoo:EWC", "EWC", "Indices"], ["yahoo:EWA", "EWA", "Indices"], ["yahoo:EWT", "EWT", "Indices"], ["yahoo:IEF", "IEF", "Indices"], ["yahoo:HYG", "HYG", "Indices"], ["yahoo:LQD", "LQD", "Indices"], ["yahoo:USO", "USO", "Indices"], ["yahoo:DBC", "DBC", "Indices"], ["yahoo:DBA", "DBA", "Indices"], ["yahoo:IAU", "IAU", "Indices"], ["yahoo:SIL", "SIL", "Indices"], ["yahoo:KRE", "KRE", "Indices"], ["yahoo:ITB", "ITB", "Indices"], ["yahoo:XME", "XME", "Indices"], ["yahoo:TAN", "TAN", "Indices"], ["yahoo:IBB", "IBB", "Indices"]];

// supabase/functions/viko-picks/index.ts
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viko-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
var json = (b, status = 200, extra = {}) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });
var TF_HOURS = { "5m": 1 / 12, "15m": 0.25, "30m": 0.5, "1h": 1, "2h": 2, "4h": 4, "1d": 24, "1w": 168, "1M": 730 };
async function calendar() {
  const all = [];
  for (const f of ["ff_calendar_thisweek.json", "ff_calendar_nextweek.json"]) {
    try {
      const r = await fetch(`https://nfs.faireconomy.media/${f}`);
      if (!r.ok) continue;
      for (const e of await r.json()) all.push({ title: String(e.title), currency: String(e.country), impact: String(e.impact), at: Date.parse(e.date) });
    } catch {
    }
  }
  return all;
}
function currenciesFor(symbol) {
  const s = symbol.split(":")[1] ?? "";
  if (s.endsWith("=X")) {
    const p = s.replace("=X", "");
    return [p.slice(0, 3), p.slice(3, 6)];
  }
  if (s === "^FTSE") return ["GBP"];
  if (s === "^GDAXI") return ["EUR"];
  if (s === "^N225") return ["JPY"];
  if (s.endsWith(".JO")) return ["ZAR"];
  return ["USD"];
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (route === "list") {
    const { data, error } = await db.from("viko_picks").select("symbol,tf,label,market,price,candle_t,scanned_at,verdict,dir,score,hard_fail,triggered,rr1,setup,news_warn").gt("scanned_at", new Date(Date.now() - 2 * 864e5).toISOString()).or("verdict.eq.APPROVED,and(hard_fail.eq.false,score.gte.55)");
    if (error) return json({ error: error.message }, 500);
    return json({ rows: data, now: Date.now() }, 200, { "Cache-Control": "public, max-age=60" });
  }
  if (route === "scan") {
    const given = req.headers.get("x-viko-key");
    const { data: keys } = await db.from("viko_config").select("v").eq("k", "cron_key");
    const h = given ? await sha256(given) : "";
    if (!h || !(keys ?? []).some((r) => r.v === h)) return json({ error: "unauthorised" }, 401);
    const b = await req.json().catch(() => ({}));
    const tf = String(b.tf);
    if (!(tf in TF_HOURS)) return json({ error: "bad tf" }, 400);
    const parts = Math.min(128, Math.max(1, Number(b.parts ?? 1)));
    const part = Math.min(parts - 1, Math.max(0, Number(b.part ?? 0)));
    const size = Math.ceil(UNIVERSE.length / parts);
    const slice = UNIVERSE.slice(part * size, part * size + size);
    const cal = await calendar();
    const now = Date.now();
    const rows = [];
    let i = 0, failed = 0;
    const worker = async () => {
      while (i < slice.length) {
        const [id, label, market] = slice[i++];
        try {
          const k = await candles(id, tf);
          if (k.length < 150) continue;
          const a = analyze(k, tf, void 0, id);
          const s = a.best;
          const last = k[k.length - 1];
          let news_warn = null;
          const cur = currenciesFor(id);
          const windowMs = Math.max(3, 2 * TF_HOURS[tf]) * 36e5;
          const big = cal.find((e) => e.impact === "High" && cur.includes(e.currency) && e.at > now && e.at - now <= windowMs);
          if (big) news_warn = `${big.title} (${big.currency}) is due ${new Date(big.at).toISOString()}`;
          let setup = null;
          if (s) setup = { name: s.name, degree: s.degree, dir: s.dir, entry: s.entry, stop: s.stop, invalidation: s.invalidation, target1: s.target1, target2: s.target2, score: s.score, verdict: s.verdict, hardFail: s.hardFail, triggered: s.triggered, rr1: s.rr1, rr2: s.rr2, expectBars: s.expectBars, edge: s.edge };
          rows.push({
            symbol: id,
            tf,
            label,
            market,
            price: last.c,
            candle_t: last.t,
            scanned_at: (/* @__PURE__ */ new Date()).toISOString(),
            verdict: s?.verdict ?? null,
            dir: s?.dir ?? null,
            score: s?.score ?? null,
            hard_fail: s?.hardFail ?? null,
            triggered: s?.triggered ?? null,
            rr1: s?.rr1 ?? null,
            setup,
            news_warn
          });
        } catch {
          failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    if (rows.length) {
      const { error } = await db.from("viko_picks").upsert(rows);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ ok: true, tf, part, saved: rows.length, failed, approved: rows.filter((r) => r.verdict === "APPROVED").length });
  }
  return json({ error: "not found" }, 404);
});
