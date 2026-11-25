# Viko research

- `yt1.md`, `yt2.md`, `yt3.md`: codeable rules extracted from 68 YouTube Elliott Wave videos (transcripts OCR'd from the user's PDFs, Nov 25 2026).
- `web.md` (if present): Google articles on Elliott Wave + evidence-backed methods from the web.
- `lab-run-*.txt`: lab reports. Run the lab: Actions → "Viko lab" (or `gh api -X POST repos/onjikoochuot/onjikoochuot.github.io/actions/workflows/lab.yml/dispatches -f ref=main`). Results land on the `lab-data` branch (`report.txt`, `setups.jsonl.gz`). Deeper cuts: `python3 lab/combos.py setups.jsonl`.

## Findings, Nov 25 2026 (7,689 setups, 43 markets, 15m/1h/4h/1d, after costs, managed like live trades)
- Overall −0.03R per trade. Old score did not predict results (90+ was worst). Forex lost on 15m/1h/4h; shorts lost on all timeframes; tight stops (< 2 ATR) lost.
- Tested edge (now the approval rule): daily, long, wave-3 entry, close > EMA200, stop ≥ 2 ATR, not forex: 419 trades, 45% wins, +0.285R; last 30% of time +0.263R; 23/30 markets positive; some losing years.
- Ideas from the videos to test next: wave-3 entry only after a higher low and a break of the last lower high; wave-2 depth 0.382–0.618 with a quick wave 2; wave-5 RSI divergence reversals; Fibonacci clusters; count-stability filter; skip entries in sideways wave 4.

## Web research (Nov 25 2026, `web.md`) — agrees with the lab, adds ideas to test
- Independent evidence matches the lab: trend filters on daily charts, stops of 2+ ATR, liquid markets only; short-horizon crypto (1–4h) tends to mean-revert; no peer-reviewed test shows Elliott Wave counts are profitable on their own.
- Queue (test one per check-up, keep only if train AND test improve):
  1. 63-day return > 0 as a second trend filter (alongside EMA200).
  2. Liquidity filter for crypto: top ~20 by 30-day dollar volume.
  3. Entry on a close above the wave-1 high / Donchian(20) breakout with volume above its 20-bar average.
  4. Wave-2 retracement 50–78.6% plus a trigger candle.
  5. ADX(14) ≥ 20 and an ATR-percentile gate.
  6. Volatility-scaled size (halve when 20-day vol > 1.5× its 120-day median); funding-rate caution for crypto longs.
  7. ATR trailing stop of 2.5× (vs the current staged trail).

## Sprint runs 1+2 (Nov 25 2026, `sprint-2026-11-25.txt`; 9,434 setups, 78 markets incl. 48 new daily markets)
- Edge confirmed out of sample: on the 48 never-seen markets +0.218R (test +0.228); all markets n=1,059 +0.229R, t=5.4.
- **Changed:** stop minimum 2.0 → 1.5 ATR (same edge, more trades): daily long wave-3 above EMA200 not FX stop ≥1.5 ATR → n=1,158, 42.9% wins, +0.238R, test +0.271R, 52/70 markets positive, 4 of 14 years negative. About 1.5 signals per market per year ≈ 35–40 a month across ~300 non-forex markets.
- Tested and DROPPED (did not improve both train and test): 63-day return > 0; above SMA100; ADX ≥ 20 / ≥ 25 (train up, test down); volume > 20-bar average (train up, test down); Donchian(20) breakout; wave-2 depth 0.5–0.786 and 0.382–0.618; close above wave-1 high (harmful); ATR percentile ≤ 0.8; calm volatility regime (small gain, excluded group too small); 2.5×ATR chandelier exit (worse: +0.11R vs +0.23R); Wave-5 and correction setups on the same filters (test negative / too few); 4h entries with a daily uptrend (negative).

## Idea checklist
- [x] 63-day return filter — dropped
- [x] SMA100 trend filter — dropped
- [x] ADX filter — dropped
- [x] Volume confirmation — dropped
- [x] Donchian breakout — dropped
- [x] Wave-2 depth bands — dropped
- [x] Break of wave-1 high entry — dropped
- [x] ATR percentile / volatility regime gates — dropped
- [x] ATR chandelier trail — dropped
- [x] Wider universe check — passed (edge holds on 48 new markets)
- [x] Crypto liquidity / small caps — crypto DROPPED from the edge entirely (Nov 25 evening run, 93 markets): small caps −0.23R; other crypto +0.14R but test −0.14R; dollar volume didn't rescue it. Non-crypto: n=997, +0.257R, test +0.330R, 37/47 markets positive.
- [x] Volatility-scaled position size — dropped (per-risk result +0.238 → +0.246 at best, drawdowns no better; risk-based sizing already used)
- [ ] Wave-3 entry after higher low + break of last lower high (new entry type: engine work)
- [ ] Skip entries in a sideways wave 4 after a sharp wave 2 (alternation)
- [ ] Wave-5 RSI/EWO divergence reversal (new setup type)
- [ ] Fibonacci cluster (2+ projections within 0.5 ATR) as target/entry filter
- [x] Count stability — dropped (count unchanged on the previous bar: +0.22R, test +0.14R; brand-new count: +0.23R, test +0.31R; no gain)
- [x] Weekly timeframe — dropped (only 62 setups in 30 markets with enough weekly history; the edge rule averaged −0.11R, recent −0.31R; no edge, too few trades)
- [ ] Funding-rate caution for crypto longs (needs funding data)

_Note: the lab-data branch holds only the latest run (the Nov 25 evening run was weekly-only). Re-run the full lab before comparing._

## Nov 25 evening: approval excludes crypto; scanner gained 60 liquid US stocks and 30 funds (sector, country, bond, commodity) to keep about one approval a day.
