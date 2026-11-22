// Viko market-data + journal edge function.
// GET  /viko-market/candles?symbol=crypto:BTCUSDT&tf=1d
// GET  /viko-market/search?q=apple
// GET  /viko-market/journal            (header x-viko-key)
// POST /viko-market/journal            (header x-viko-key)
// PATCH /viko-market/journal?id=...    (header x-viko-key)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viko-key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};
const json = (b: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
const TF = ["1h", "4h", "1d", "1w"] as const;
type Tf = typeof TF[number];
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };

async function binance(sym: string, tf: Tf): Promise<Candle[]> {
  const hosts = ["https://data-api.binance.vision", "https://api.binance.com", "https://api1.binance.com"];
  let lastErr = "";
  for (const h of hosts) {
    try {
      const r = await fetch(`${h}/api/v3/klines?symbol=${sym}&interval=${tf}&limit=1000`);
      if (!r.ok) { lastErr = `${h} ${r.status}`; continue; }
      const rows = await r.json() as unknown[][];
      return rows.map((k) => ({ t: Math.floor(Number(k[0]) / 1000), o: +k[1]!, h: +k[2]!, l: +k[3]!, c: +k[4]!, v: +k[5]! }));
    } catch (e) { lastErr = String(e); }
  }
  throw new Error(`binance: ${lastErr}`);
}

async function yahoo(sym: string, tf: Tf): Promise<Candle[]> {
  const cfg = { "1h": ["60m", "730d"], "4h": ["60m", "730d"], "1d": ["1d", "10y"], "1w": ["1wk", "max"] }[tf];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${cfg[0]}&range=${cfg[1]}&includePrePost=false`;
  let r = await fetch(url, { headers: UA });
  if (!r.ok) r = await fetch(url.replace("query1", "query2"), { headers: UA });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(j?.chart?.error?.description ?? "yahoo: no data");
  const ts: number[] = res.timestamp ?? [];
  const q = res.indicators.quote[0];
  let out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((x) => x == null || Number.isNaN(x))) continue;
    out.push({ t: ts[i], o, h, l, c, v: q.volume?.[i] ?? 0 });
  }
  if (tf === "4h") {
    const agg: Candle[] = [];
    for (const k of out) {
      const bucket = Math.floor(k.t / 14400) * 14400;
      const last = agg[agg.length - 1];
      if (last && last.t === bucket) { last.h = Math.max(last.h, k.h); last.l = Math.min(last.l, k.l); last.c = k.c; last.v += k.v; }
      else agg.push({ ...k, t: bucket });
    }
    out = agg;
  }
  return out.slice(-1000);
}

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function auth(req: Request, db: ReturnType<typeof createClient>) {
  const given = req.headers.get("x-viko-key");
  if (!given) return false;
  const { data } = await db.from("viko_config").select("v").eq("k", "journal_key").single();
  return !!data && data.v === (await sha256(given));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const route = url.pathname.split("/").filter(Boolean).pop();
  try {
    if (route === "candles") {
      const symbol = url.searchParams.get("symbol") ?? "";
      const tf = (url.searchParams.get("tf") ?? "1d") as Tf;
      if (!TF.includes(tf)) return json({ error: "bad tf" }, 400);
      const m = symbol.match(/^(crypto|yahoo):([A-Za-z0-9.=^\-]{1,24})$/);
      if (!m) return json({ error: "bad symbol" }, 400);
      const candles = m[1] === "crypto" ? await binance(m[2].toUpperCase(), tf) : await yahoo(m[2].toUpperCase(), tf);
      return json({ symbol, tf, candles }, 200, { "Cache-Control": "public, max-age=60" });
    }
    if (route === "search") {
      const q = (url.searchParams.get("q") ?? "").slice(0, 40);
      if (!q) return json({ quotes: [] });
      const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`, { headers: UA });
      const j = r.ok ? await r.json() : { quotes: [] };
      return json({ quotes: (j.quotes ?? []).filter((x: any) => x.symbol).map((x: any) => ({ symbol: x.symbol, name: x.shortname ?? x.longname ?? x.symbol, type: x.quoteType })) });
    }
    if (route === "journal") {
      const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      if (!(await auth(req, db))) return json({ error: "journal key required" }, 401);
      if (req.method === "GET") {
        const { data, error } = await db.from("viko_signals").select("*").order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        return json({ rows: data });
      }
      if (req.method === "POST") {
        const b = await req.json();
        const row = {
          symbol: String(b.symbol).slice(0, 40), timeframe: String(b.timeframe).slice(0, 4), direction: String(b.direction).slice(0, 5),
          verdict: String(b.verdict).slice(0, 12), score: Number(b.score), entry: Number(b.entry), stop: Number(b.stop),
          target1: Number(b.target1), target2: b.target2 == null ? null : Number(b.target2), rr: Number(b.rr),
          setup: String(b.setup ?? "").slice(0, 80), payload: b.payload ?? null, notes: String(b.notes ?? "").slice(0, 2000),
        };
        const { data, error } = await db.from("viko_signals").insert(row).select().single();
        if (error) throw error;
        return json({ row: data });
      }
      if (req.method === "PATCH") {
        const id = url.searchParams.get("id");
        const b = await req.json();
        const patch: Record<string, unknown> = {};
        if (b.outcome !== undefined) patch.outcome = String(b.outcome).slice(0, 12);
        if (b.notes !== undefined) patch.notes = String(b.notes).slice(0, 2000);
        const { data, error } = await db.from("viko_signals").update(patch).eq("id", id).select().single();
        if (error) throw error;
        return json({ row: data });
      }
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 502);
  }
});
