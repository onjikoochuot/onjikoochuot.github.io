import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const dist = new URL("../dist/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const srv = createServer((q, r) => { let p = join(dist, q.url.split("?")[0]); if (!existsSync(p) || p.endsWith("/")) p = join(dist, "index.html"); r.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); r.end(readFileSync(p)); }).listen(4321);
function series(seed, base) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const legs = [[base*1.6, 140],[base*0.95,60],[base*1.25,40],[base*1.0,30],[base*1.2,35],[base*1.05,30],[base*1.12,25],[base*1.0,14],[base*1.5,45],[base*1.3,30],[base*1.9,55],[base*1.65,35],[base*1.8,25],[base*1.45,40],[base*1.62,30],[base*1.38,25],[base*1.52,12]];
  const out=[]; let p=base*1.3, t=1_640_000_000;
  for (const [to,bars] of legs){ const from=p; for(let b=1;b<=bars;b++){ const tg=from+(to-from)*b/bars; const o=p, c=tg*(1+(rnd()-.5)*.012); const h=Math.max(o,c)*(1+rnd()*.01), l=Math.min(o,c)*(1-rnd()*.01); out.push({t:t+=86400,o,h,l,c,v:(to>from?1600:900)*(.6+rnd()*.8)}); p=c; } }
  return out;
}
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
for (const [w,h,name] of [[1440,1000,"desktop"],[390,844,"mobile"]]) {
  const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  pg.on("console", (m) => m.type()==="error" && console.log("console:", m.text())); pg.on("pageerror", (e) => console.log("pageerror:", e.message));
  await pg.route(/supabase\.co/, (route) => { const u = new URL(route.request().url()); const sym = u.searchParams.get("symbol")||""; let seed=[...sym].reduce((a,c)=>a+c.charCodeAt(0),3); route.fulfill({ status:200, contentType:"application/json", headers:{"access-control-allow-origin":"*"}, body: JSON.stringify(u.pathname.endsWith("search")?{quotes:[]}:{candles: series(seed, sym.includes("BTC")?60000:100)}) }); });
  await pg.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await pg.goto("http://localhost:4321/#analyse"); await pg.waitForTimeout(2500);
  await pg.screenshot({ path: `/home/claude/shots/${name}-analyse.png`, fullPage: name==="mobile" ? false : true });
  if (name==="mobile") { await pg.mouse.wheel(0, 900); await pg.waitForTimeout(400); await pg.screenshot({ path: `/home/claude/shots/mobile-analyse-2.png` }); }
  if (name==="desktop") {
    await pg.click("nav >> text=Scan"); await pg.waitForTimeout(800); console.log("MAIN:", (await pg.evaluate(() => document.querySelector("main")?.innerText ?? "none")).slice(0,300)); await pg.click("text=Scan now"); await pg.waitForTimeout(3000);
    await pg.screenshot({ path: `/home/claude/shots/desktop-scan.png` });
    await pg.click("nav >> text=Backtest"); await pg.waitForTimeout(300); await pg.click("text=Approved and watch"); await pg.click("text=Run backtest"); await pg.waitForTimeout(5000);
    await pg.screenshot({ path: `/home/claude/shots/desktop-backtest.png` });
  }
}
await b.close(); srv.close(); console.log("done");
