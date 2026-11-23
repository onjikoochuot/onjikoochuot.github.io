# Viko build plan

- [x] Toolkit: skills and MCP servers installed (see chat status list)
- [x] Read the Wyckoff book in full; encode phases, events, laws, entries and stops with chapter citations
- [x] Neely book: OCR'd the 169-page scan at 300 DPI; rules audited against chapters 3-6 and cited by page
- [x] Supabase: `viko_signals` + `viko_config` tables (RLS, no public policies), `viko-market` edge function
- [x] Engine: monowaves at 3 degrees, 4 Elliott setups x 2 directions, Wyckoff reader, 80% gate, backtest
- [x] UI: analyse, scan, backtest, journal, rulebook; desktop 1440 and mobile 390 checked
- [x] Deploy: GitHub Pages via Actions
- [ ] Next: run backtests across the watchlist on 4h and 1d, then tune weights only where the evidence says so
- [x] Live prices (Binance WebSocket + 30 s polling), 77-market catalogue
- [x] Plain-language tip card
- [x] Paper trading with server-side autopilot (strict 80% or practice 65%)
- [x] Installable phone app (PWA), bottom navigation
- [ ] Next: push/Telegram alerts when a watched trigger fires
- [ ] Next: triangles and complex corrections (Neely ch. 5 triangles, ch. 8)
