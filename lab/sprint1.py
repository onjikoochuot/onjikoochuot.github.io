"""Sprint run 1+2 (Nov 25 2026): test the research-queue features and how often the tested edge fires.
Usage: python3 lab/sprint1.py setups.jsonl"""
import json, math, sys, statistics as st, datetime
from collections import defaultdict

rows = [json.loads(l) for l in open(sys.argv[1])]
by = defaultdict(list)
for r in rows: by[(r["sym"], r["tf"])].append(r)
for v in by.values():
    v.sort(key=lambda r: r["t"]); c = int(len(v) * .7)
    for i, r in enumerate(v): r["split"] = "train" if i < c else "test"

def S(rs, key="rNet"):
    x = [r[key] for r in rs if r.get(key) is not None]
    if len(x) < 2: return f"n={len(x)}"
    m = sum(x) / len(x); sd = st.pstdev(x) or 1
    return f"n={len(x):>4} win={sum(v > 0 for v in x) / len(x) * 100:4.1f}% avgR={m:+.3f} t={m / (sd / math.sqrt(len(x))):+.1f}"
def show(name, f, key="rNet"):
    a = [r for r in rows if f(r)]
    print(f"{name:<52} ALL {S(a, key)} | TRAIN {S([r for r in a if r['split'] == 'train'], key)} | TEST {S([r for r in a if r['split'] == 'test'], key)}")

E = lambda r: r["checks"].get("i-ema200") == 1
base = lambda r: r["tf"] == "1d" and r["dir"] == "long" and r["kind"] != "fx" and E(r)
edge = lambda r: base(r) and r["name"] == "Wave 3 entry" and (r["stopAtr"] or 0) >= 2
oldmk = {"majors", "alts", "fx", "commod", "indices", "stocks"}
newsyms = lambda r: r["sym"] in NEW
NEW = set()
for r in rows:
    pass

print(f"# {len(rows)} setups, {len({r['sym'] for r in rows})} markets\n")
print("## Current tested edge, old vs new markets (new markets are a true out-of-sample check)")
first = {}
for r in rows: first.setdefault(r["sym"], r)
OLD = {"crypto:BTCUSDT","crypto:ETHUSDT","crypto:SOLUSDT","crypto:BNBUSDT","crypto:XRPUSDT","crypto:ADAUSDT","crypto:DOGEUSDT","crypto:AVAXUSDT","crypto:LINKUSDT","crypto:LTCUSDT","crypto:DOTUSDT","crypto:NEARUSDT","crypto:ATOMUSDT",
 "yahoo:GC=F","yahoo:SI=F","yahoo:CL=F","yahoo:NG=F","yahoo:HG=F","yahoo:^GSPC","yahoo:^NDX","yahoo:^DJI","yahoo:^GDAXI","yahoo:^FTSE","yahoo:^N225","yahoo:AAPL","yahoo:MSFT","yahoo:NVDA","yahoo:AMZN","yahoo:TSLA","yahoo:META"}
show("EDGE on original markets", lambda r: edge(r) and r["sym"] in OLD)
show("EDGE on NEW markets (never seen before)", lambda r: edge(r) and r["sym"] not in OLD and r["kind"] != "fx")
show("EDGE all", edge)
show("EDGE with ATR-trail exit instead", edge, "rNetAtr")

print("\n## Research-queue features inside the edge (keep only if TRAIN and TEST both improve)")
feats = {
    "63-day return > 0": lambda r: (r.get("ret63") or 0) > 0,
    "above SMA100": lambda r: r.get("aboveSma100") is True,
    "ADX >= 20": lambda r: (r.get("adx") or 0) >= 20,
    "ADX >= 25": lambda r: (r.get("adx") or 0) >= 25,
    "volume > 20-bar avg": lambda r: (r.get("volRatio") or 0) > 1,
    "Donchian(20) breakout": lambda r: r.get("donBreak") is True,
    "wave-2 depth 0.5-0.786": lambda r: r.get("w2Depth") is not None and 0.5 <= r["w2Depth"] <= 0.786,
    "wave-2 depth 0.382-0.618": lambda r: r.get("w2Depth") is not None and 0.382 <= r["w2Depth"] <= 0.618,
    "close above wave-1 high": lambda r: r.get("brokeW1") is True,
    "ATR percentile <= 0.8": lambda r: r.get("atrPct") is not None and r["atrPct"] <= 0.8,
    "vol regime <= 1.5 (calm)": lambda r: r.get("volRegime") is not None and r["volRegime"] <= 1.5,
}
for name, f in feats.items():
    show(f"  + {name}", lambda r, f=f: edge(r) and f(r))
    show(f"  - NOT {name}", lambda r, f=f: edge(r) and not f(r))

print("\n## Same features on the wider base (daily, long, uptrend, not forex)")
for name, f in feats.items():
    show(f"  + {name}", lambda r, f=f: base(r) and f(r))

print("\n## Looser versions of the edge (more trades?)")
show("base: daily long uptrend notFX (any setup, any stop)", base)
show("base + stop>=2ATR (any setup)", lambda r: base(r) and (r["stopAtr"] or 0) >= 2)
show("base + Wave 3 (any stop)", lambda r: base(r) and r["name"] == "Wave 3 entry")
show("base + Wave 3 + stop>=1.5ATR", lambda r: base(r) and r["name"] == "Wave 3 entry" and (r["stopAtr"] or 0) >= 1.5)
show("base, setup = Correction complete", lambda r: base(r) and r["name"].startswith("Correction"))
show("base, setup = Wave 5", lambda r: base(r) and r["name"] == "Wave 5 entry")
show("4h long, daily uptrend (htf long) + ema200, notFX, stop>=2ATR", lambda r: r["tf"] == "4h" and r["dir"] == "long" and r["kind"] != "fx" and r["htf"] == "long" and E(r) and (r["stopAtr"] or 0) >= 2)

print("\n## How often does it fire? Trades per year per market (daily setups, over each market's history)")
years = {}
for (sym, tf), v in by.items():
    if tf == "1d": years[sym] = (v[-1]["t"] - v[0]["t"]) / (365.25 * 86400) or 1
for name, f in [("EDGE", edge), ("base + stop>=2ATR", lambda r: base(r) and (r["stopAtr"] or 0) >= 2), ("base", base)]:
    n = sum(1 for r in rows if f(r)); mk = [s for s in years if not s.endswith("=X")]
    yrs = sum(years[s] for s in mk)
    per = n / yrs if yrs else 0
    print(f"{name:<22} {n} trades over {yrs:.0f} market-years = {per:.2f} per market per year -> about {per * 300 / 12:.1f} per month across ~300 non-forex markets")
