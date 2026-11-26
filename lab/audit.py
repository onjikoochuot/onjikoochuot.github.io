"""Robustness audit of Viko's tested edge (from the quant checklist the user shared, Nov 26 2026).
Usage: python3 lab/audit.py setups.jsonl
1. Monte Carlo: 2,000 runs shuffling trade order, dropping 10% of winners and doubling costs; drawdown at 1% risk.
2. Report card per timeframe and market type (does any other timeframe have an edge?).
3. Losses grouped by weekday and volatility regime (would a regime filter remove the worst 20%?).
4. Machine-learning meta-label: does a model trained on the first 70% of time pick better trades in the last 30%?"""
import json, math, random, statistics as st, sys
from collections import defaultdict

rows = [json.loads(l) for l in open(sys.argv[1])]
by = defaultdict(list)
for r in rows: by[(r["sym"], r["tf"])].append(r)
for v in by.values():
    v.sort(key=lambda r: r["t"]); c = int(len(v) * .7)
    for i, r in enumerate(v): r["split"] = "train" if i < c else "test"
E = lambda r: r["checks"].get("i-ema200") == 1
NONCRYPTO = lambda r: r["kind"] not in ("major", "alt", "fx")
edge = lambda r: r["tf"] == "1d" and r["dir"] == "long" and NONCRYPTO(r) and E(r) and r["name"] == "Wave 3 entry" and (r["stopAtr"] or 0) >= 1.5
def S(x):
    if len(x) < 2: return f"n={len(x)}"
    m = sum(x) / len(x); sd = st.pstdev(x) or 1
    pf = sum(v for v in x if v > 0) / max(1e-9, -sum(v for v in x if v < 0))
    return f"n={len(x):>4} win={sum(v > 0 for v in x) / len(x) * 100:4.1f}% avgR={m:+.3f} PF={pf:4.2f} t={m / (sd / math.sqrt(len(x))):+.1f}"

E_rows = sorted([r for r in rows if edge(r)], key=lambda r: r["t"])
print(f"# Audit: {len(rows)} setups; tested edge = {len(E_rows)} trades")
print("Edge all  ", S([r["rNet"] for r in E_rows]))
print("Edge train", S([r["rNet"] for r in E_rows if r["split"] == "train"]))
print("Edge test ", S([r["rNet"] for r in E_rows if r["split"] == "test"]))

# ---------- 1. Monte Carlo ----------
COST = {"stock/index": 0.0005 * 2 + 0.0003 * 2, "commod": 0.0002 * 2 + 0.0002 * 2}
def extra_cost_R(r):  # one more full round trip of fees and slippage, in units of risk
    return (COST.get(r["kind"], 0.0016) * 100) / max(r["stopPct"], 1e-6)
def max_dd(seq, risk=0.01):  # compounding equity at a fixed % risk per trade
    eq = peak = 1.0; dd = 0.0
    for x in seq:
        eq *= 1 + risk * x; peak = max(peak, eq); dd = max(dd, 1 - eq / peak)
    return dd
random.seed(7)
base = [r["rNet"] for r in E_rows]
print("\n## 1. Monte Carlo (2,000 runs: shuffled order, 10% of winners removed, costs doubled)")
print(f"Historical order at 1% risk: max drawdown {max_dd(base) * 100:.1f}%, total {sum(base):+.0f}R over {len(base)} trades")
for risk in (0.005, 0.01, 0.02):
    dds, tots = [], []
    for _ in range(2000):
        seq = [r["rNet"] - extra_cost_R(r) for r in E_rows if not (r["rNet"] > 0 and random.random() < 0.10)]
        random.shuffle(seq); dds.append(max_dd(seq, risk)); tots.append(sum(seq))
    dds.sort(); tots.sort()
    print(f"risk {risk * 100:.1f}%/trade: median max DD {dds[1000] * 100:4.1f}%, 95th pct {dds[1900] * 100:4.1f}% | total R 5th pct {tots[100]:+.0f}, median {tots[1000]:+.0f} | profitable in {sum(t > 0 for t in tots) / 20:.1f}% of runs")

# ---------- 2. Report card per timeframe ----------
print("\n## 2. Report card: same rule (long, wave 3, above EMA200, stop >= 1.5 ATR, not crypto/forex) on each timeframe")
for tf in ("15m", "1h", "4h", "1d"):
    sel = [r for r in rows if r["tf"] == tf and r["dir"] == "long" and NONCRYPTO(r) and E(r) and r["name"] == "Wave 3 entry" and (r["stopAtr"] or 0) >= 1.5]
    print(f"{tf:>4}: ALL {S([r['rNet'] for r in sel])} | TEST {S([r['rNet'] for r in sel if r['split'] == 'test'])}")
print("  1w: tested Nov 25 (62 setups in 30 markets): rule averaged -0.11R, recent -0.31R -> no edge")
print("  1M: not testable: too few monthly candles for wave counts (needs 220+ bars = 18+ years per market)")

# ---------- 3. Regime and calendar ----------
print("\n## 3. Edge trades by weekday and volatility regime")
g = defaultdict(list)
for r in E_rows: g[["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(r["weekday"] - 1) % 7]].append(r["rNet"])
for k in ("Mon", "Tue", "Wed", "Thu", "Fri"): print(f"{k}: {S(g[k])}")
for lo, hi, name in ((0, 0.8, "calm (vol < 0.8x usual)"), (0.8, 1.25, "normal"), (1.25, 99, "jumpy (vol > 1.25x usual)")):
    x = [r["rNet"] for r in E_rows if r.get("volRegime") is not None and lo <= r["volRegime"] < hi]
    print(f"{name:<28} {S(x)}")
for lo, hi, name in ((0, 20, "ADX < 20 (no trend)"), (20, 30, "ADX 20-30"), (30, 999, "ADX > 30 (strong trend)")):
    x = [r["rNet"] for r in E_rows if r.get("adx") is not None and lo <= r["adx"] < hi]
    print(f"{name:<28} {S(x)}")

# ---------- 4. Machine-learning meta-label ----------
print("\n## 4. Machine-learning filter (meta-labeling): train on the first 70% of time, judge on the last 30%")
try:
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.preprocessing import StandardScaler
    cand = sorted([r for r in rows if r["tf"] == "1d" and r["dir"] == "long" and NONCRYPTO(r)], key=lambda r: r["t"])
    ids = sorted({k for r in cand for k in r["checks"]})
    def feats(r):
        f = [r["score"] / 100, min(r["rr1"], 10), min(r["stopAtr"] or 0, 10), r["stopPct"], 1.0 if r["htf"] == "long" else 0.0,
             (r.get("adx") or 0) / 50, min(r.get("volRatio") or 1, 5), (r.get("ret63") or 0) / 100, r.get("atrPct") or 0.5, min(r.get("volRegime") or 1, 4),
             1.0 if r.get("donBreak") else 0.0, r.get("w2Depth") or 0.5, 1.0 if r["name"] == "Wave 3 entry" else 0.0, 1.0 if r["kind"] == "commod" else 0.0]
        f += [{1: 1.0, 0: 0.0}.get(r["checks"].get(k), 0.5) for k in ids]
        return f
    cut = cand[int(len(cand) * 0.7)]["t"]  # one global time cut: no future data in training
    tr = [r for r in cand if r["t"] < cut]; te = [r for r in cand if r["t"] >= cut]
    Xtr = np.array([feats(r) for r in tr]); ytr = np.array([1 if r["rNet"] > 0 else 0 for r in tr])
    Xte = np.array([feats(r) for r in te])
    sc = StandardScaler().fit(Xtr)  # fitted on training data only
    for name, model in (("logistic regression", LogisticRegression(max_iter=2000, C=0.3)), ("gradient boosting", GradientBoostingClassifier(n_estimators=150, max_depth=2, learning_rate=0.05, subsample=0.8, random_state=1))):
        model.fit(sc.transform(Xtr), ytr)
        p = model.predict_proba(sc.transform(Xte))[:, 1]
        order = np.argsort(-p)
        print(f"{name}: candidates in test period {len(te)} (all daily uptrend buys in stocks/funds/commodities) {S([r['rNet'] for r in te])}")
        for share in (0.5, 0.3, 0.2):
            top = [te[i] for i in order[: int(len(te) * share)]]
            print(f"   model's top {int(share * 100)}%: {S([r['rNet'] for r in top])}")
        edge_te = [r for r in te if edge(r)]
        print(f"   current rule in the same period: {S([r['rNet'] for r in edge_te])}")
        pe = model.predict_proba(sc.transform(np.array([feats(r) for r in edge_te])))[:, 1] if edge_te else []
        if len(edge_te) > 20:
            med = float(np.median(pe))
            print(f"   rule + model above its median: {S([r['rNet'] for r, q in zip(edge_te, pe) if q >= med])} | below: {S([r['rNet'] for r, q in zip(edge_te, pe) if q < med])}")
except ImportError as e:
    print("sklearn missing:", e)
