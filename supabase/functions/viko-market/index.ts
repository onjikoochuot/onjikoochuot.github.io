// Viko market data + journal.
// GET  /viko-market/candles?symbol=crypto:BTCUSDT&tf=1d
// GET  /viko-market/quotes?symbols=crypto:BTCUSDT,yahoo:AAPL
// GET  /viko-market/search?q=apple
// GET|POST|PATCH /viko-market/journal   (header x-viko-key)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { candles, quotes, sha256, TF, type Tf, UA } from "./market.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viko-key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};
const json = (b: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });

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
      return json({ symbol, tf, candles: await candles(symbol, tf) }, 200, { "Cache-Control": "public, max-age=30" });
    }
    if (route === "quotes") {
      const list = (url.searchParams.get("symbols") ?? "").split(",").filter(Boolean).slice(0, 120);
      return json({ quotes: await quotes(list), at: Date.now() }, 200, { "Cache-Control": "public, max-age=20" });
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
