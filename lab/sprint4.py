"""Wave-counter research (Nov 26 2026): sub-waves, big-picture checks, wave-5 divergence reversal.
Usage: python3 lab/sprint4.py setups.jsonl"""
import json, math, statistics as st, sys
from collections import defaultdict
rows = [json.loads(l) for l in open(sys.argv[1])]
by = defaultdict(list)
for r in rows: by[(r["sym"], r["tf"], r.get("variant", "main"))].append(r)
for v in by.values():
    v.sort(key=lambda r: r["t"]); c = int(len(v) * .7)
    for i, r in enumerate(v): r["split"] = "train" if i < c else "test"
def S(x):
    if len(x) < 2: return f"n={len(x)}"
    m = sum(x) / len(x); sd = st.pstdev(x) or 1
    return f"n={len(x):>4} win={sum(v > 0 for v in x) / len(x) * 100:4.1f}% avgR={m:+.3f} t={m / (sd / math.sqrt(len(x))):+.1f}"
def show(n, rs):
    print(f"{n:<52} ALL {S([r['rNet'] for r in rs])} | TRAIN {S([r['rNet'] for r in rs if r['split'] == 'train'])} | TEST {S([r['rNet'] for r in rs if r['split'] == 'test'])}")
NC = lambda r: r["kind"] not in ("major", "alt", "fx")
main = [r for r in rows if r.get("variant", "main") == "main"]
E = lambda r: r["checks"].get("i-ema200") == 1
edge = [r for r in main if r["tf"] == "1d" and r["dir"] == "long" and NC(r) and E(r) and r["name"] == "Wave 3 entry" and (r["stopAtr"] or 0) >= 1.5]
print(f"# {len(rows)} records; main {len(main)}; minute {sum(r.get('variant') == 'minute' for r in rows)}; w5div {sum(r.get('variant') == 'w5div' for r in rows)}")
show("CURRENT EDGE", edge)
print("\n## Big-picture checks inside the edge")
for k, lab in (("w1From3mLow", "wave 1 starts at the 3-month low"), ("higherDegUp", "next-larger degree trending up")):
    show(f"  + {lab}", [r for r in edge if r.get(k) is True]); show(f"  - not {lab}", [r for r in edge if r.get(k) is False])
for d in (1, 2, 3):
    show(f"  degrees agreeing = {d}", [r for r in edge if r.get("degreesAgree") == d])
show("  degrees agreeing >= 2", [r for r in edge if (r.get("degreesAgree") or 0) >= 2])
print("\n## Sub-waves (Minute degree, 1.5x ATR) traded on their own, daily")
mi = [r for r in rows if r.get("variant") == "minute"]
show("minute: all", mi)
show("minute: same edge rule (long w3 ema200 stop>=1.5 non-crypto)", [r for r in mi if r["dir"] == "long" and NC(r) and r.get("ema200") is True and r["name"] == "Wave 3 entry" and (r.get("stopAtr") or 0) >= 1.5])
show("minute: edge rule, any stop", [r for r in mi if r["dir"] == "long" and NC(r) and r.get("ema200") is True and r["name"] == "Wave 3 entry"])
print("\n## Wave-5 divergence reversal (buy), daily")
w5 = [r for r in rows if r.get("variant") == "w5div"]
show("w5div: all markets", w5)
show("w5div: stocks/funds/commodities", [r for r in w5 if NC(r)])
show("w5div: non-crypto, above EMA200", [r for r in w5 if NC(r) and r.get("aboveEma200")])
show("w5div: non-crypto, below EMA200", [r for r in w5 if NC(r) and r.get("aboveEma200") is False])
show("w5div: non-crypto, stop >= 1.5 ATR", [r for r in w5 if NC(r) and (r.get("stopAtr") or 0) >= 1.5])
