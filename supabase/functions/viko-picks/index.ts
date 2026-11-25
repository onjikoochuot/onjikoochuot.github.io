// Viko background picks. Scans every market in the catalogue on one timeframe and saves the best setup per chart.
// POST /viko-picks/scan  {tf}   header x-viko-key (cron key) — run by pg_cron
// GET  /viko-picks/list          public — the latest result for every market and timeframe
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { candles, sha256, type Tf } from "./market.ts";
// @ts-ignore engine bundle, pinned to a commit (built by scripts/build-functions.sh)
import { analyze } from "https://cdn.jsdelivr.net/gh/onjikoochuot/onjikoochuot.github.io@c77a63cf778ec7acec7aee88b13f7c62705344c2/supabase/functions/viko-paper/engine.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-viko-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });
const TF_HOURS: Record<string, number> = { "5m": 1 / 12, "15m": 0.25, "30m": 0.5, "1h": 1, "2h": 2, "4h": 4, "1d": 24, "1w": 168, "1M": 730 };

import { UNIVERSE } from "./universe.ts";

type CalEvent = { title: string; currency: string; impact: string; at: number };
async function calendar(): Promise<CalEvent[]> {
  const all: CalEvent[] = [];
  for (const f of ["ff_calendar_thisweek.json", "ff_calendar_nextweek.json"]) {
    try {
      const r = await fetch(`https://nfs.faireconomy.media/${f}`);
      if (!r.ok) continue;
      for (const e of await r.json()) all.push({ title: String(e.title), currency: String(e.country), impact: String(e.impact), at: Date.parse(e.date) });
    } catch { /* optional */ }
  }
  return all;
}
function currenciesFor(symbol: string): string[] {
  const s = symbol.split(":")[1] ?? "";
  if (s.endsWith("=X")) { const p = s.replace("=X", ""); return [p.slice(0, 3), p.slice(3, 6)]; }
  if (s === "^FTSE") return ["GBP"];
  if (s === "^GDAXI") return ["EUR"];
  if (s === "^N225") return ["JPY"];
  if (s.endsWith(".JO")) return ["ZAR"];
  return ["USD"];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();

  if (route === "list") {
    const { data, error } = await db.from("viko_picks").select("symbol,tf,label,market,price,candle_t,scanned_at,verdict,dir,score,hard_fail,triggered,rr1,setup,news_warn").gt("scanned_at", new Date(Date.now() - 2 * 86400000).toISOString())
      .or("verdict.eq.APPROVED,and(hard_fail.eq.false,score.gte.55)"); // only rows the screens use
    if (error) return json({ error: error.message }, 500);
    return json({ rows: data, now: Date.now() }, 200, { "Cache-Control": "public, max-age=60" });
  }

  if (route === "scan") {
    const given = req.headers.get("x-viko-key");
    const { data: keys } = await db.from("viko_config").select("v").eq("k", "cron_key");
    const h = given ? await sha256(given) : "";
    if (!h || !(keys ?? []).some((r: any) => r.v === h)) return json({ error: "unauthorised" }, 401);
    const b = await req.json().catch(() => ({}));
    const tf = String(b.tf) as Tf;
    if (!(tf in TF_HOURS)) return json({ error: "bad tf" }, 400);
    // Batches keep each run inside the edge runtime's CPU and memory limits.
    const parts = Math.min(64, Math.max(1, Number(b.parts ?? 1)));
    const part = Math.min(parts - 1, Math.max(0, Number(b.part ?? 0)));
    const size = Math.ceil(UNIVERSE.length / parts);
    const slice = UNIVERSE.slice(part * size, part * size + size);
    const cal = await calendar();
    const now = Date.now();
    const rows: any[] = [];
    let i = 0, failed = 0;
    const worker = async () => {
      while (i < slice.length) {
        const [id, label, market] = slice[i++];
        try {
          const k = await candles(id, tf);
          if (k.length < 150) continue;
          const a = analyze(k, tf, undefined, id);
          const s = a.best;
          const last = k[k.length - 1];
          let news_warn: string | null = null;
          const cur = currenciesFor(id);
          const windowMs = Math.max(3, 2 * TF_HOURS[tf]) * 3600000;
          const big = cal.find((e) => e.impact === "High" && cur.includes(e.currency) && e.at > now && e.at - now <= windowMs);
          if (big) news_warn = `${big.title} (${big.currency}) is due ${new Date(big.at).toISOString()}`;
          let setup = null;
          // Only what the Picks screen needs, to keep the list small for phones.
          if (s) setup = { name: s.name, degree: s.degree, dir: s.dir, entry: s.entry, stop: s.stop, invalidation: s.invalidation, target1: s.target1, target2: s.target2, score: s.score, verdict: s.verdict, hardFail: s.hardFail, triggered: s.triggered, rr1: s.rr1, rr2: s.rr2, expectBars: s.expectBars, edge: s.edge };
          rows.push({
            symbol: id, tf, label, market, price: last.c, candle_t: last.t, scanned_at: new Date().toISOString(),
            verdict: s?.verdict ?? null, dir: s?.dir ?? null, score: s?.score ?? null, hard_fail: s?.hardFail ?? null,
            triggered: s?.triggered ?? null, rr1: s?.rr1 ?? null, setup, news_warn,
          });
        } catch { failed++; }
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

