import json, math, statistics as st
from collections import defaultdict
rows=[json.loads(l) for l in open(__import__("sys").argv[1] if len(__import__("sys").argv)>1 else "setups.jsonl")]
by=defaultdict(list)
for r in rows: by[(r["sym"],r["tf"])].append(r)
for v in by.values():
    v.sort(key=lambda r:r["t"]); c=int(len(v)*.7)
    for i,r in enumerate(v): r["split"]="train" if i<c else "test"
def S(rs):
    if not rs: return "n=0"
    x=[r["rNet"] for r in rs]; m=sum(x)/len(x); sd=st.pstdev(x) or 1
    return f"n={len(x):>4} win={sum(v>0 for v in x)/len(x)*100:4.1f}% avgR={m:+.3f} t={m/(sd/math.sqrt(len(x))):+.1f}"
def show(name,f):
    a=[r for r in rows if f(r)]
    print(f"{name:<58} ALL {S(a)} | TRAIN {S([r for r in a if r['split']=='train'])} | TEST {S([r for r in a if r['split']=='test'])}")
liquid=lambda r: r["kind"] in ("major","stock/index","commod")
show("baseline", lambda r: True)
show("1d", lambda r: r["tf"]=="1d")
show("1d long", lambda r: r["tf"]=="1d" and r["dir"]=="long")
show("1d short", lambda r: r["tf"]=="1d" and r["dir"]=="short")
show("1d with HTF", lambda r: r["tf"]=="1d" and r["htf"]==r["dir"])
show("1d stopAtr>=2.5", lambda r: r["tf"]=="1d" and (r["stopAtr"] or 0)>=2.5)
show("1d liquid", lambda r: r["tf"]=="1d" and liquid(r))
show("1d liquid stopAtr>=2.5", lambda r: r["tf"]=="1d" and liquid(r) and (r["stopAtr"] or 0)>=2.5)
show("1d liquid withHTF", lambda r: r["tf"]=="1d" and liquid(r) and r["htf"]==r["dir"])
show("1d liquid withHTF stopAtr>=2.5", lambda r: r["tf"]=="1d" and liquid(r) and r["htf"]==r["dir"] and (r["stopAtr"] or 0)>=2.5)
show("1d+4h liquid withHTF stopAtr>=2.5", lambda r: r["tf"] in("1d","4h") and liquid(r) and r["htf"]==r["dir"] and (r["stopAtr"] or 0)>=2.5)
show("1d+4h liquid stopAtr>=2.5", lambda r: r["tf"] in("1d","4h") and liquid(r) and (r["stopAtr"] or 0)>=2.5)
show("4h liquid stopAtr>=2.5", lambda r: r["tf"]=="4h" and liquid(r) and (r["stopAtr"] or 0)>=2.5)
show("any tf stopAtr>=3", lambda r: (r["stopAtr"] or 0)>=3)
show("any tf liquid stopAtr>=3", lambda r: liquid(r) and (r["stopAtr"] or 0)>=3)
show("not fx, not 15m/1h", lambda r: r["kind"]!="fx" and r["tf"] in ("4h","1d"))
show("fx all", lambda r: r["kind"]=="fx")
print("\nBy year, candidate: 1d liquid stopAtr>=2.5")
import datetime
g=defaultdict(list)
for r in rows:
    if r["tf"]=="1d" and liquid(r) and (r["stopAtr"] or 0)>=2.5: g[datetime.datetime.utcfromtimestamp(r["t"]).year].append(r)
for y in sorted(g): print(y, S(g[y]))
print("\nBy kind, candidate")
g=defaultdict(list)
for r in rows:
    if r["tf"]=="1d" and liquid(r) and (r["stopAtr"] or 0)>=2.5: g[r["kind"]+" "+r["dir"]].append(r)
for k in sorted(g): print(f"{k:<22}", S(g[k]))
print("\n--- trend alignment via EMA200 check (i-ema200 = price on the trade's side of the 200 EMA)")
for tf in ("1d","4h"):
  for d in ("long","short"):
    show(f"{tf} {d} ema200 pass", lambda r,tf=tf,d=d: r["tf"]==tf and r["dir"]==d and r["checks"].get("i-ema200")==1)
    show(f"{tf} {d} ema200 FAIL", lambda r,tf=tf,d=d: r["tf"]==tf and r["dir"]==d and r["checks"].get("i-ema200")==0)
show("1d ema200 pass stopAtr>=2.5 (both dirs)", lambda r: r["tf"]=="1d" and r["checks"].get("i-ema200")==1 and (r["stopAtr"] or 0)>=2.5)
show("1d ema200 pass stopAtr>=2.5 notFX", lambda r: r["tf"]=="1d" and r["kind"]!="fx" and r["checks"].get("i-ema200")==1 and (r["stopAtr"] or 0)>=2.5)
show("1d ema200 pass stopAtr>=2.5 liquid", lambda r: r["tf"]=="1d" and liquid(r) and r["checks"].get("i-ema200")==1 and (r["stopAtr"] or 0)>=2.5)
show("1d long ema200 stopAtr>=2.5 notFX", lambda r: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]!="fx" and r["checks"].get("i-ema200")==1 and (r["stopAtr"] or 0)>=2.5)
show("1d long stopAtr>=2.5 notFX", lambda r: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]!="fx" and (r["stopAtr"] or 0)>=2.5)
show("1d long notFX", lambda r: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]!="fx")
show("4h long ema200 stopAtr>=2.5 notFX", lambda r: r["tf"]=="4h" and r["dir"]=="long" and r["kind"]!="fx" and r["checks"].get("i-ema200")==1 and (r["stopAtr"] or 0)>=2.5)
show("alt 1d long", lambda r: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]=="alt")
show("1d long notFX c-depth/c-ret pass", lambda r: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]!="fx" and r["checks"].get("c-ret")==1)
show("1d long notFX by setup=Wave 3", lambda r: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]!="fx" and r["name"]=="Wave 3 entry")
show("1d long notFX by setup=Wave 5", lambda r: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]!="fx" and r["name"]=="Wave 5 entry")
print("\n--- final candidates")
E=lambda r: r["checks"].get("i-ema200")==1
show("R1: 1d long ema200 notFX", lambda r: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]!="fx" and E(r))
show("R2: R1 + stopAtr>=2", lambda r: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]!="fx" and E(r) and (r["stopAtr"] or 0)>=2)
show("R3: R1 + Wave3 only", lambda r: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]!="fx" and E(r) and r["name"]=="Wave 3 entry")
show("R4: R2 + Wave3 only", lambda r: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]!="fx" and E(r) and r["name"]=="Wave 3 entry" and (r["stopAtr"] or 0)>=2)
show("R1 APPROVED-verdict only", lambda r: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]!="fx" and E(r) and r["verdict"]=="APPROVED")
for k in ("major","alt","stock/index","commod"):
  show(f"R2 {k}", lambda r,k=k: r["tf"]=="1d" and r["dir"]=="long" and r["kind"]==k and E(r) and (r["stopAtr"] or 0)>=2)
import random
sel=[r for r in rows if r["tf"]=="1d" and r["dir"]=="long" and r["kind"]!="fx" and E(r) and (r["stopAtr"] or 0)>=2]
# drift check: compare to random long entries? approximate by all 1d long setups regardless of filters
x=[r["rNet"] for r in sel]; random.seed(1)
bs=sorted(sum(random.choices(x,k=len(x)))/len(x) for _ in range(2000))
print(f"R2 bootstrap avgR 5%..95%: {bs[100]:+.3f} .. {bs[1900]:+.3f}; per-symbol positive share:", end=" ")
g=defaultdict(list)
for r in sel: g[r["sym"]].append(r["rNet"])
print(f"{sum(1 for v in g.values() if sum(v)>0)}/{len(g)} symbols positive")
