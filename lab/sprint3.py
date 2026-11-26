"""Sprint run 3 (Nov 26 2026): Fibonacci cluster, 2/4 alternation, break of wave-2's last lower high.
Usage: python3 lab/sprint3.py setups.jsonl"""
import json, math, sys, statistics as st
from collections import defaultdict
rows = [json.loads(l) for l in open(sys.argv[1])]
by = defaultdict(list)
for r in rows: by[(r["sym"], r["tf"])].append(r)
for v in by.values():
    v.sort(key=lambda r: r["t"]); c = int(len(v) * .7)
    for i, r in enumerate(v): r["split"] = "train" if i < c else "test"
def S(rs):
    x = [r["rNet"] for r in rs if r.get("rNet") is not None]
    if len(x) < 2: return f"n={len(x)}"
    m = sum(x) / len(x); sd = st.pstdev(x) or 1
    return f"n={len(x):>4} win={sum(v > 0 for v in x)/len(x)*100:4.1f}% avgR={m:+.3f} t={m/(sd/math.sqrt(len(x))):+.1f}"
def show(name, f):
    a = [r for r in rows if f(r)]
    print(f"{name:<44} ALL {S(a)} | TRAIN {S([r for r in a if r['split']=='train'])} | TEST {S([r for r in a if r['split']=='test'])}")
E = lambda r: r["checks"].get("i-ema200") == 1
okm = lambda r: r["kind"] in ("stock/index", "commod")
edge = lambda r: r["tf"] == "1d" and r["dir"] == "long" and okm(r) and E(r) and r["name"] == "Wave 3 entry" and (r["stopAtr"] or 0) >= 1.5
print(f"# {len(rows)} setups, {len({r['sym'] for r in rows})} markets")
show("EDGE (current rule)", edge)
for k in ("stock/index", "commod"): show(f"  EDGE {k}", lambda r, k=k: edge(r) and r["kind"] == k)
feats = {
 "fibCluster": lambda r: r.get("fibCluster") is True,
 "fibCluster near target1": lambda r: r.get("fibClusterT1") is True,
 "brokeLH (last lower high in w2)": lambda r: r.get("brokeLH") is True,
 "w2 time >= 1.618x w1": lambda r: (r.get("w2TimeRatio") or 0) >= 1.618,
 "w2 time <= 0.618x w1": lambda r: r.get("w2TimeRatio") is not None and r["w2TimeRatio"] <= 0.618,
 "w2 time alternates (either)": lambda r: r.get("w2TimeRatio") is not None and (r["w2TimeRatio"] >= 1.618 or r["w2TimeRatio"] <= 0.618),
}
print("\n## Inside the edge")
for n, f in feats.items():
    show(f" + {n}", lambda r, f=f: edge(r) and f(r)); show(f" - NOT {n}", lambda r, f=f: edge(r) and not f(r))
print("\n## brokeLH coverage: null (no inner lower high) vs set")
show(" brokeLH null", lambda r: edge(r) and r.get("brokeLH") is None)
print("\n## Alternation on wave-5 entries (daily long uptrend, edge markets)")
w5 = lambda r: r["tf"] == "1d" and r["dir"] == "long" and okm(r) and E(r) and r["name"] == "Wave 5 entry"
show(" wave-5 all", w5)
show(" wave-5 sharp2+sideways4", lambda r: w5(r) and r.get("altSharp2Side4") is True)
show(" wave-5 NOT sharp2+sideways4", lambda r: w5(r) and r.get("altSharp2Side4") is False)
show(" wave-5 all TFs/dirs, sharp2+side4", lambda r: r["name"] == "Wave 5 entry" and r.get("altSharp2Side4") is True)
show(" wave-5 all TFs/dirs, NOT", lambda r: r["name"] == "Wave 5 entry" and r.get("altSharp2Side4") is False)
