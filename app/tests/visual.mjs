import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const dist = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = createServer((q, r) => { let p = join(dist, q.url.split("?")[0]); if (!existsSync(p) || p.endsWith("/")) p = join(dist, "index.html"); r.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); r.end(readFileSync(p)); }).listen(4321);
function series(seed, base) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const legs = [[base*1.6,140],[base*0.95,60],[base*1.25,40],[base*1.0,30],[base*1.2,35],[base*1.05,30],[base*1.12,25],[base*1.0,14],[base*1.5,45],[base*1.3,30],[base*1.9,55],[base*1.65,35],[base*1.8,25],[base*1.45,40],[base*1.62,30],[base*1.38,25],[base*1.52,12]];
  const out=[]; let p=base*1.3, t=1_640_000_000;
  for (const [to,bars] of legs){ const from=p; for(let b=1;b<=bars;b++){ const tg=from+(to-from)*b/bars; const o=p, c=tg*(1+(rnd()-.5)*.012); const h=Math.max(o,c)*(1+rnd()*.01), l=Math.min(o,c)*(1-rnd()*.01); out.push({t:t+=86400,o,h,l,c,v:(to>from?1600:900)*(.6+rnd()*.8)}); p=c; } }
  return out;
}
const paperState = { account: { starting_balance: 10000, balance: 10142.5, risk_pct: 1, autopilot: true, auto_level: "practice", auto_tfs: ["4h","1d"], watchlist: [{id:"crypto:BTCUSDT",label:"BTC/USDT"}], last_tick: new Date().toISOString(), last_scan: new Date().toISOString() },
  open: [{ id: "a1", symbol: "crypto:ETHUSDT", label: "ETH/USDT", tf: "4h", dir: "long", setup: "Wave 3 entry (Minor degree), practice at 71%", score: 71, source: "auto", status: "open", opened_at: new Date(Date.now()-86400000).toISOString(), closed_at: null, entry: 1690, stop: 1640, initial_stop: 1640, target1: 1790, target2: 1850, qty: 2, qty_open: 2, t1_hit: false, realized: 0, exit_price: null, close_reason: null, last_price: 1721, tip: "Buy ETH/USDT now\nBuy at about 1,690." },
         { id: "a2", symbol: "yahoo:AAPL", label: "AAPL", tf: "1d", dir: "short", setup: "Correction complete, rejoin the trend (Intermediate degree)", score: 83, source: "manual", status: "open", opened_at: new Date(Date.now()-3*86400000).toISOString(), closed_at: null, entry: 350, stop: 362, initial_stop: 362, target1: 326, target2: 314, qty: 8, qty_open: 4, t1_hit: true, realized: 96, exit_price: null, close_reason: null, last_price: 342.5, tip: null }],
  closed: [{ id: "c1", symbol: "crypto:SOLUSDT", label: "SOL/USDT", tf: "4h", dir: "long", setup: "Wave 5 entry", score: 81, source: "auto", status: "closed", opened_at: "2026-11-20T10:00:00Z", closed_at: "2026-11-21T14:00:00Z", entry: 68, stop: 65, initial_stop: 65, target1: 74, target2: 77, qty: 33, qty_open: 0, t1_hit: true, realized: 148.5, exit_price: 77, close_reason: "target2", last_price: 77, tip: null }],
  events: [{ id: 3, at: new Date().toISOString(), kind: "open", message: "Autopilot opened long ETH/USDT at 1690.0000, stop 1640.0000, target 1790.0000." }, { id: 2, at: "2026-11-21T14:00:00Z", kind: "target2", message: "SOL/USDT: second target hit, trade closed at 77.0000 (+99.00)." }], now: Date.now() };
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
for (const [w,h,name] of [[1440,1000,"desktop"],[390,844,"mobile"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: name === "mobile", hasTouch: name === "mobile" });
  await ctx.addInitScript(() => localStorage.setItem("viko:jkey", JSON.stringify("test-key")));
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => console.log("pageerror:", e.message));
  await pg.route(/supabase\.co/, (route) => {
    const u = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (u.pathname.endsWith("/quotes")) { const q = {}; for (const s of (u.searchParams.get("symbols")||"").split(",")) q[s] = { price: s.includes("BTC") ? 61308.09 : 100 + s.length * 3.7, change: (s.length % 5) - 2.2 }; return json({ quotes: q }); }
    if (u.pathname.includes("viko-paper")) return json(u.pathname.endsWith("state") ? paperState : { ok: true });
    if (u.pathname.endsWith("search")) return json({ quotes: [] });
    const sym = u.searchParams.get("symbol") || ""; const seed = [...sym].reduce((a, c) => a + c.charCodeAt(0), 3);
    return json({ candles: series(seed, sym.includes("BTC") ? 40000 : 100) });
  });
  await pg.route(/fonts\.(googleapis|gstatic)|binance\.vision/, (r) => r.abort());
  for (const v of ["analyse", "paper", "markets"]) {
    await pg.goto(`http://localhost:4321/#${v}`); await pg.waitForTimeout(2200);
    await pg.screenshot({ path: `/home/claude/shots/v2-${name}-${v}.png`, fullPage: false });
  }
  if (name === "mobile") { await pg.goto("http://localhost:4321/#analyse"); await pg.waitForTimeout(1800); await pg.mouse.wheel(0, 700); await pg.waitForTimeout(400); await pg.screenshot({ path: `/home/claude/shots/v2-mobile-analyse-2.png` }); }
}
await b.close(); srv.close(); console.log("done");
