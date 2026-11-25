"""Analyse Viko lab results: where does the engine make money after costs, and which features matter?
Usage: python3 analyze_lab.py <dir with lab-*.jsonl>   (prints a compact report)
Out-of-sample honesty: every filter found on the first 70% of time (per market) is re-checked on the last 30%."""
import json, sys, glob, math, statistics as st
from collections import defaultdict

rows = []
for f in glob.glob(sys.argv[1] + "/**/*.jsonl", recursive=True):
    for line in open(f):
        if line.strip(): rows.append(json.loads(line))
if not rows: sys.exit("no rows")

# time split per market+timeframe: first 70% = train, last 30% = test
by = defaultdict(list)
for r in rows: by[(r["sym"], r["tf"])].append(r)
for k, v in by.items():
    v.sort(key=lambda r: r["t"]); cut = int(len(v) * 0.7)
    for i, r in enumerate(v): r["split"] = "train" if i < cut else "test"

def stat(rs):
    if not rs: return None
    x = [r["rNet"] for r in rs]
    m = sum(x) / len(x); sd = st.pstdev(x) if len(x) > 1 else 0
    return dict(n=len(x), win=sum(1 for v in x if v > 0) / len(x), avgR=m, t=(m / (sd / math.sqrt(len(x))) if sd > 0 else 0), totR=sum(x))

def line(label, rs, w=34):
    s = stat(rs)
    if not s: return f"{label:<{w}} n=0"
    return f"{label:<{w}} n={s['n']:>5}  win={s['win']*100:5.1f}%  avgR={s['avgR']:+.3f}  t={s['t']:+5.1f}  totalR={s['totR']:+8.1f}"

def table(title, key, rs, minn=30):
    print(f"\n## {title}")
    g = defaultdict(list)
    for r in rs: g[key(r)].append(r)
    for k in sorted(g, key=lambda k: -(stat(g[k])["avgR"])):
        if len(g[k]) >= minn: print(line(str(k), g[k]))

print(f"# Viko lab: {len(rows)} setups, {len(by)} market-timeframe series")
print(line("ALL", rows))
print(line("  verdict APPROVED", [r for r in rows if r["verdict"] == "APPROVED"]))
print(line("  verdict WATCH", [r for r in rows if r["verdict"] == "WATCH"]))
band = lambda r: "90+" if r["score"] >= 90 else "80-89" if r["score"] >= 80 else "70-79" if r["score"] >= 70 else "60-69" if r["score"] >= 60 else "<60"
table("By score band", band, rows)
table("By market type", lambda r: r["kind"], rows)
table("By timeframe", lambda r: r["tf"], rows)
table("By market type x timeframe", lambda r: f"{r['kind']} {r['tf']}", rows)
table("By setup", lambda r: r["name"], rows)
table("By direction", lambda r: r["dir"], rows)
table("By higher-timeframe trend agreement", lambda r: "with HTF" if r["htf"] == r["dir"] else "against HTF" if r["htf"] else "HTF unclear", rows)
table("By Wyckoff phase", lambda r: f"{r['wyKind']} {r['wyPhase']}", rows)
table("By exit", lambda r: r["how"], rows, 10)
table("By symbol", lambda r: r["sym"], rows, 40)

print("\n## Each check: avgR when it passes vs fails (all data)")
ids = sorted({k for r in rows for k in r["checks"]})
eff = []
for cid in ids:
    p = [r for r in rows if r["checks"].get(cid) == 1]; f = [r for r in rows if r["checks"].get(cid) == 0]
    if len(p) >= 50 and len(f) >= 50:
        sp, sf = stat(p), stat(f); eff.append((sp["avgR"] - sf["avgR"], cid, sp, sf))
for d, cid, sp, sf in sorted(eff, reverse=True):
    print(f"{cid:<12} pass n={sp['n']:>5} avgR={sp['avgR']:+.3f} | fail n={sf['n']:>5} avgR={sf['avgR']:+.3f} | diff {d:+.3f}")

# Numeric features in quantile buckets
def buckets(name, f, rs, q=5):
    vals = sorted(f(r) for r in rs if f(r) is not None)
    if len(vals) < 200: return
    edges = [vals[int(len(vals) * i / q)] for i in range(1, q)]
    def b(v):
        for i, e in enumerate(edges):
            if v <= e: return i
        return q - 1
    print(f"\n## {name} in {q} buckets (edges {', '.join(f'{e:.3g}' for e in edges)})")
    g = defaultdict(list)
    for r in rs:
        v = f(r)
        if v is not None: g[b(v)].append(r)
    for k in sorted(g): print(line(f"bucket {k+1}", g[k]))
buckets("Reward:risk to target 1", lambda r: r["rr1"], rows)
buckets("Stop distance in ATR", lambda r: r["stopAtr"], rows)
buckets("Stop distance % of price", lambda r: r["stopPct"], rows)
buckets("Score", lambda r: r["score"], rows)

# Simple filter search on train, verified on test
print("\n## Filter search: found on the first 70% of time, checked on the last 30%")
train = [r for r in rows if r["split"] == "train"]; test = [r for r in rows if r["split"] == "test"]
cands = {}
for kind in {r["kind"] for r in rows}: cands[f"kind={kind}"] = lambda r, k=kind: r["kind"] == k
for tf in {r["tf"] for r in rows}: cands[f"tf={tf}"] = lambda r, t=tf: r["tf"] == t
cands["withHTF"] = lambda r: r["htf"] == r["dir"]
cands["long"] = lambda r: r["dir"] == "long"
cands["short"] = lambda r: r["dir"] == "short"
for th in (60, 70, 80): cands[f"score>={th}"] = lambda r, t=th: r["score"] >= t
for cid in ids: cands[f"{cid}=pass"] = lambda r, c=cid: r["checks"].get(c) == 1
for th in (1.0, 1.5, 2.0, 3.0): cands[f"stopAtr>={th}"] = lambda r, t=th: (r["stopAtr"] or 0) >= t
for th in (2, 3, 5): cands[f"rr1<={th}"] = lambda r, t=th: r["rr1"] <= t
names = list(cands)
res = []
for i, a in enumerate(names):
    for b in names[i:]:
        fa, fb = cands[a], cands[b]
        tr = [r for r in train if fa(r) and fb(r)]
        if len(tr) < 150: continue
        s = stat(tr)
        if s["avgR"] > 0.05: res.append((s["avgR"] * math.sqrt(s["n"]), a if a == b else f"{a} & {b}", s, fa, fb))
res.sort(key=lambda x: -x[0])
for score, label, s, fa, fb in res[:25]:
    te = stat([r for r in test if fa(r) and fb(r)])
    print(f"{label:<40} TRAIN n={s['n']:>4} avgR={s['avgR']:+.3f} win={s['win']*100:4.1f}% | TEST " + (f"n={te['n']:>4} avgR={te['avgR']:+.3f} win={te['win']*100:4.1f}%" if te else "n=0"))
