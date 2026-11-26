# Viko — working rules for Claude

Viko is a rules-based trading app (Elliott Wave per Glenn Neely + Wyckoff) with paper and real-money trading. The owner's goals, in order: keep it bug-free, keep it profitable, keep learning — and spend as few credits as possible.

## How decisions are made here
- **Evidence before opinion.** No trading rule, filter or setting changes because it sounds good (videos, articles, "best practices"). It changes only when the research lab shows it improves results after costs on BOTH the older 70% and the newer 30% of the data (time-ordered, per market), with at least 100 trades in each half, t ≥ 2, holding across market types. Log every test, kept or dropped, in `lab/research/README.md`.
- **Compute, don't estimate.** Every number about prices, indicators or results comes from code (lab scripts, Python, tests) — never mental arithmetic.
- **No look-ahead.** The engine sees only candles up to the bar being judged. Never shuffle time series; fit any scaler or model on training data only.
- **Realistic costs** (`app/src/engine/costs.ts`) in every backtest, preview and paper trade.
- **Robustness:** before shipping a rule, run `lab/audit.py`: Monte Carlo (shuffle, drop 10% of winners, double costs) — flag if the 95th-percentile drawdown at the default risk exceeds 20%; report card per timeframe; regime breakdown.
- **Keep trades findable.** The owner wants about one approval a day across the scanned markets. A filter that halves frequency must add clearly more edge.
- **Verify current facts** (APIs, broker docs, library syntax) with web search/fetch and cite URLs; don't guess endpoints.

## Current approval rule (read `testedEdge()` in `app/src/engine/analyze.ts` for the truth)
Daily chart, buy only, wave-3 entry, close above EMA200, stop ≥ 1.5× ATR, stocks/funds/indices/commodities only (not crypto, not forex); plus trigger fired, no must-pass rule broken, reward ≥ 1.5R. Nov 2026: 997 trades, 43% wins, +0.26R after costs, +0.33R on the newest 30%. Default risk 0.5% per trade.

## Safety (never break these)
- Never place real-money trades, change broker keys or real-money settings, delete user data, turn on the paper autopilot, or loosen daily limits on your own. Propose instead.
- Every button that closes, cancels, resets or deletes must ask for confirmation (`components/Confirm.tsx`).
- The verdict must never contradict itself: the chart page explains that the verdict is about a NEW entry; an open trade follows its own plan (`components/OpenTradeNote.tsx`).
- Live execution keeps: daily loss limits, max open positions, stop-loss on every order, trailing stops that only move in the trade's favour.

## Working efficiently
- Cheap checks first; stop when there's nothing to fix.
- Hand bulky mechanical work (test suites, long reading, web reading) to smaller models with a precise brief and a short required report; keep decisions yourself. Don't delegate small tasks.
- Plain language for the owner: say what changed, with numbers, and what needs their decision.

## Where things are
- App: `app/` (React + Vite + TypeScript). Checks: `npx tsc --noEmit -p tsconfig.app.json`, `npx vitest run`, browser tests `app/tests/*.mjs`.
- Server: `supabase/functions/` (Supabase project fkrgiaeglingmogcsyik). Loaders pin a compiled `main.js` by commit; `scripts/build-functions.sh` builds everything; an engine change needs two commits (build engine.js, then repin). Server tests: from `supabase/functions`, `deno test --no-check --allow-env --import-map=tests/import_map.json tests/managers.test.ts`.
- Lab: GitHub Actions "Viko lab" → results on the `lab-data` branch; analysis `lab/analyze.py`, `lab/combos.py`, `lab/audit.py`, `lab/sprint*.py`. Notes and idea checklist: `lab/research/`.
