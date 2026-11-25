# Viko research

- `yt1.md`, `yt2.md`, `yt3.md`: codeable rules extracted from 68 YouTube Elliott Wave videos (transcripts OCR'd from the user's PDFs, Nov 25 2026).
- `web.md` (if present): Google articles on Elliott Wave + evidence-backed methods from the web.
- `lab-run-*.txt`: lab reports. Run the lab: Actions → "Viko lab" (or `gh api -X POST repos/onjikoochuot/onjikoochuot.github.io/actions/workflows/lab.yml/dispatches -f ref=main`). Results land on the `lab-data` branch (`report.txt`, `setups.jsonl.gz`). Deeper cuts: `python3 lab/combos.py setups.jsonl`.

## Findings, Nov 25 2026 (7,689 setups, 43 markets, 15m/1h/4h/1d, after costs, managed like live trades)
- Overall −0.03R per trade. Old score did not predict results (90+ was worst). Forex lost on 15m/1h/4h; shorts lost on all timeframes; tight stops (< 2 ATR) lost.
- Tested edge (now the approval rule): daily, long, wave-3 entry, close > EMA200, stop ≥ 2 ATR, not forex: 419 trades, 45% wins, +0.285R; last 30% of time +0.263R; 23/30 markets positive; some losing years.
- Ideas from the videos to test next: wave-3 entry only after a higher low and a break of the last lower high; wave-2 depth 0.382–0.618 with a quick wave 2; wave-5 RSI divergence reversals; Fibonacci clusters; count-stability filter; skip entries in sideways wave 4.
