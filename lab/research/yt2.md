# yt_chunk2 notes: Elliott Wave YouTube transcripts (all 5859 lines read)

Caveat: most videos are theory/beginner. Few give exact entries. The only fully specified trade plans come from Sigma Allocations (1 worked example) and TSMInnovations (wave-3 scanner). Many transcripts are truncated mid-sentence ("..."), so rules that the video says come "later" (e.g. Sigma Fibonacci module, Com Lucro "complete trade read from divergence") are NOT in the text.

## 1. Rules

R1. Wave-2 retracement depth: typically 50%-61.8% (or more) of wave 1; wave 4 shallower, 23.6%-38.2% of wave 3. (Sigma Allocations, Guidelines video; Com Lucro says w2/w4 = 38.2/50/61.8 of prior wave. 2 videos agree, they differ on w4, see Contradictions.)
Code: w2_ret = (w1_end - w2_low)/(w1_end - w1_start); valid_pref = 0.5<=w2_ret<=0.618 ; w4_ret=(w3_end-w4_low)/(w3_end-w2_end); pref_w4 = 0.236<=w4_ret<=0.382
Source: "Elliott Wave Guidelines: Alternation, Channeling, Wave Equality & Wave Personality" (Sigma Allocations); "Elliott Wave Trading: Fibonacci Makes the Difference" (Com Lucro Trader)

R2. Alternation (planning filter, never invalidates a count): sharp/deep/fast wave 2 -> expect sideways/shallow/slow wave 4 (form, depth, time, complexity). Worked numbers: Nifty w2 retraced 45.5% in 11 sessions, w4 was 42 sessions sideways, depth 19% (about 4x time); Gold w2 76% in 6 days, w4 triangle 99 days, 24-41% depth (about 16x time); Nifty 2018-19 w2 65% in 6 sessions, w4 49% in 15 sessions (2.5x time). Wave 4 duration / wave 2 duration typically 2.5x-16x in examples.
Code: if w2_ret>=0.5 and w2_bars<=~11: expect w4_bars >= 2.5*w2_bars and w4_ret<=0.382 ; do NOT enter inside w4 range, wait for range to finish
Source: Sigma Allocations Guidelines video; Com Lucro "Fibonacci Makes the Difference" (also states alternation does not apply to w2 vs w4 in triangles). 2 videos agree.

R3. Wave-4 range-breakout entry (the only complete trade plan in the file). Wait for sideways wave 4. Signs it ended: a dip marginally breaks range support and reverses same day, then next pullback makes a HIGHER LOW. Entry = buy stop just above the last lower-high of the range (example: 15,044 high -> stop-buy at 15,060). Stop = just below the higher low (14,592 -> 14,500). Target = 3R (3 x 500-pt risk = 16,560). Result in example: hit in ~3 months, +3R. n=1 example.
Code: in range after w3: swing_low2 > swing_low1 (higher low) and low1 pierced support by <small%> and closed back inside -> place buy_stop = last_lower_high*1.0007 ; stop = higher_low - ~0.6% ; tp = entry + 3*(entry-stop)
Source: Sigma Allocations Guidelines video (Nifty 2021)

R4. Break of structure confirming wave 5 start: weekly close above the wave-3 high (and above range top) ends the wave-4 range and confirms wave 5 (Nifty weekly close > 15,432 on 28 May 2021).
Code: wave4_active and weekly_close > wave3_high -> w5_confirmed
Source: Sigma Allocations Masterclass

R5. Channel projection for wave 3 and wave 5. After w2 ends: line from w1 start through w2 end, parallel through w1 end = rough w3 target zone (w3 often breaks above it; real example projected 11,973, w3 ended 11,856, so about 1% short). After w4 ends: line through w2 end and w4 end, parallel through w3 end = wave 5 target zone. Strong fifths may throw over the upper line on heavy volume. Use LOG scale for long moves (arithmetic channels make w5 look too short).
Code: base=line(w1_start,w2_end); upper=parallel through w1_end; after w4: base=line(w2_end,w4_end); upper=parallel through w3_end; w5_target_zone=upper(t). Throwover: high>upper and volume>1.5*SMA(vol,20) (the 1.5 is mine, video says only "heavy volume")
Source: Sigma Allocations Guidelines video

R6. Wave equality: if w3 is extended, w1 ~= w5 in length; if w1 extended, w3 ~= w5; if w1 ~= w3, w5 is the likely extender. Also Prechter: in zigzag, C ~= A (but C can be much longer).
Code: w5_target = w4_end + w1_len (if w3_len > 1.618*w1_len); else if abs(w1-w3)/w1<0.15: w5_target = w4_end + 1.618*w1_len(?) (the 1.618 is a typical guess, not stated)
Source: Com Lucro "Fibonacci Makes the Difference"; Sigma Allocations; Prechter at FSC 2026. 3 videos agree on equality idea.

R7. Fibonacci projection ratios. Wave 3 vs wave 1 and wave 5 vs w1/w3: 161.8%, 200%, 261.8%, 300%, 361.8%. Wave C vs wave A: 161.8% to 361.8% (Com Lucro) -- note this conflicts with C~=A (Prechter, Sigma). Wave B retraces 38.2/50/61.8% of A. Zigzag B retraces 38%-79% of A, C usually extends beyond end of A (BitsTurtle indicator).
Code: w3_targets = w2_end + [1.618,2.0,2.618]*w1_len ; wC_targets = wB_end - [1.0,1.618]*wA_len (down correction); B_valid = 0.38<=B_ret<=0.79 for zigzag
Source: "Fibonacci Makes the Difference" (Com Lucro Trader); "I Found the Only Elliott Wave Indicator..." (BitsTurtle). 

R8. Correction after 5-wave impulse retraces 50%-62% of the whole five-wave advance (ABC target zone). Example: Etsy monthly, ABC ended at the 50% retrace, then new highs.
Code: abc_target_zone = [imp_end - 0.5*imp_len, imp_end - 0.618*imp_len]; look for long entry when C completes inside zone and C has 5-wave structure
Source: "How to Trade Elliott Wave Flats Using Fibonacci Guidelines" (Technical Analysis Institute)

R9. Flat types: regular flat B returns to start of A; expanded flat B goes BEYOND the origin of A; A=3 waves, B=3, C=5 (3-3-5). If C is a 3 instead of 5 it is W-X-Y, not ABC. Indicator treats flats as traps: price looks like a breakout (B exceeds A origin) but is part of correction.
Code: flat: B_ret>=~0.9 of A; expanded: B_end beyond A_start; then trade C in the direction of A after B exceeds A origin only if C subdivides into 5
Source: Technical Analysis Institute (flats); BitsTurtle (indicator).

R10. Triangle trade: triangle only in wave 4, wave B, or (rare) wave X; NEVER in wave 2 or wave A. Five legs A-B-C-D-E each a zigzag (3-3-3-3-3), legs overlap. Contracting: B<A, C<B, D<C, E<D. Entry: go with the trend from end of wave E (one transcript says end of D). Stop: end of wave E (as said in the transcript); invalidation: price beyond end of wave C (in other direction/ beyond C extreme). Typical outcome: sharp thrust out of the triangle.
Code: legs=5 and len[B]<len[A] and len[C]<len[B] and len[D]<len[C] and len[E]<len[D] ; entry = break of trendline connecting B and D (in trend direction) ; stop = E extreme ; invalid if price beyond C extreme
Source: "Elliott Wave Theory Module 2 Chapter 4 | Triangle Pattern Explained (A-B-C-D-E)" (Elliott Wave Vision). 1 video (OCR is noisy: entry "end of wave D" vs "after wave E" is inconsistent).

R11. Wave-3 breakout scanner (equities, daily). Stage 1: long accumulation range, then a wave-1 candle = big body, closes strong, with volume spike. Stage 2: correction (wave 2) of at most 6 days ("any correction within 6 days is good"; example 2 days). Stage 3: entry when price breaks the wave-1 high AND volume also breaks above wave-1 volume. Entry timing: scan after 3 pm, last 10-20 min before close (buy on close). Hold: BTS = buy today sell tomorrow (exit next day), or hold 2-3 days, up to 5-10 days for "wave 3 extension" (extensions run 15-20 days). Example: next day +12%. Presenter targets ONLY wave 3, not wave 5.
Code: base = range-bound N bars; w1 = bar with body>=2*ATR... (body/volume thresholds not given; assume close in top 25% and vol>2*SMA20); w2_bars<=6 and low>base_start; trigger: close>w1_high and volume>w1_volume ; exit: next close or after 2-3 bars; optional hold 5-10 bars
Source: "How to Catch Elliott Wave 3? | Powerful Momentum Wave" (TSMInnovations)

R12. Wave-3 extension entry: second entry after a first breakout, again on break of prior high in an ongoing wave 3 (the "wave three extension entry").
Code: in w3 state: after pullback <=? bars, close > prior swing high -> add/entry
Source: TSMInnovations

R13. Wave-1 start disambiguation: wave 2 below start of wave 1 kills the specific bullish count; do not move the origin to hide the failure; keep a stated invalidation price drawn BEFORE the next candle arrives (wave-4 boundary = wave-1 high).
Code: invalid_long = low < w1_start (while in w2) ; invalid_w4 = low <= w1_high (for impulse, not diagonal)
Source: "Elliott Wave Theory for Beginners: 1-5, ABC" (Trading 101); Sigma Allocations Masterclass ("stops at the invalidation level")

R14. Stop placement principle: stop at the invalidation level of the count (w2 low / w1 start for long entered in w2; w1 high boundary for entries in w4; higher low for w4 breakout). Every count must carry a stop.
Code: stop = w1_start (entry in w2) ; stop = w1_high (entry in w4 end) 
Source: Sigma Allocations Masterclass; Trading 101; Elliott Wave Vision

R15. Truncated fifth: w5 may fail to exceed w3 end (allowed). Extension most often in w3. 
Code: after w5 made: if w5_high<w3_high -> truncation flag, expect sharp reversal
Source: Com Lucro (Fibonacci); Alpha Reads Balan (anomalies: extended wave, failure)

R16. Time Fibonacci: w3 (and later impulse waves) time = 161.8% or 261.8% of wave-1 time. 
Code: expected_w3_bars ~ [1.618,2.618]*w1_bars
Source: Com Lucro (Fibonacci)

R17. W-X-Y vs impulse discrimination: in a 4/X comparison, wave X is expected >= 38.2% of W (minimum) and typically larger than the wave 4 would be vs wave 2; wave 4 normally >= wave 2 in size and more complex; wave 2 usually simple zigzag, wave 4 often retraces toward the start of the range. Lower-degree 4 shorter than higher-degree 4. Wave C vs wave 5 is a volume difference (details not in text).
Code: X_len/W_len >= 0.382 ; w4_len >= w2_len (mostly) ; w2 simple, w4 complex
Source: "Elliott Waves: How To Distinguish Between An Impulse & Double Zigzag" (Koenz Trading)

R18. Zigzag B can't exceed start of A (analog of wave-2 rule). 
Code: B_end beyond A_start -> not zigzag (flat or other)
Source: Prechter at FSC 2026

R19. Automated forecast: after a completed correction the indicator projects a new wave 1 in trend direction, with a target and stop; BTC 4h example: sell zone 67.3k, target 64.4k, stop 73.8k (R:R about 1:2.2 ... actually reward 2.9k vs risk 6.5k = 0.45, i.e. poor); confidence score shown as % and 5-star. Only trade if confidence high (60%/3 stars "meaningfully stronger" than 40%/2 stars).
Code: only valid_count and confidence>=60 -> signal ; compute RR=(entry-target)/(stop-entry) and require RR>=2 (my addition, the shown example fails it)
Source: BitsTurtle; The Good, The Bad And The Bitcoin (same indicator, Elliott Wave Detector Pro)

R20. Multi-timeframe: confirm on lower timeframe that a higher-degree move subdivides as 5 up / 3 down (Etsy monthly -> 2-day chart). EURUSD example: 5-wave count down on 60m inside wave 5 on daily; 100% extension target for final leg; monthly trend-line break gives long-term bias.
Code: htf_trend = dir(HTF count) ; trade LTF waves only in HTF direction ; target = w1_len*1.0 projection from w4 end for w5
Source: Technical Analysis Institute; Elliott Wave Forecast (EURUSD). 

## 2. Filters (avoid trading when...)

F1. Do not label/trade when the swing sequence fails any of the 3 hard rules; show "no count". Enforcing a count onto chop is worse than no count. (4 videos agree: BitsTurtle, Good/Bad/Bitcoin, Trading 101, Alpha Reads)
Code: if not (w2_low>w1_start and w3_len>min(w1_len,w5_len) and w4_low>w1_high): no_trade
Source: BitsTurtle; The Good, The Bad And The Bitcoin; Trading 101; Alpha Reads (Balan)

F2. Do not trade inside wave 4 sideways range; wait for it to finish (alternation). 
Code: if w2_sharp and state==W4: skip until higher-low + breakout trigger (R3)
Source: Sigma Allocations Guidelines

F3. Do not force 5-wave count on every trend; three-wave bursts can act as impulses; if the count flips on each new bar, stay out (count instability filter).
Code: if count_changes_in_last_N_bars>1: skip
Source: Sunny Dhar "Elliott Wave Theory Doesn't Work"; Paradise Trading Tips ("count keeps changing every time price moves against you")

F4. Do not relabel after invalidation; a break of wave-1 origin during wave 2 means stop out, not a re-count. 
Code: on invalidation: close position, reset state, no re-entry in same count
Source: Sunny Dhar; Trading 101

F5. No triangle in wave 2 or wave A; in wave 2 expect zigzag/flat only. If a "triangle" appears in w2 the count is wrong.
Code: if pattern==triangle and wave in {2,A}: reject count
Source: Elliott Wave Vision (triangle)

F6. Flat B-wave breakouts (B beyond A origin) are traps: do not chase the new extreme inside a correction.
Code: in correction, break of prior high/low that fails to produce 5-wave follow-through -> skip
Source: BitsTurtle

F7. Do not use on thin, illiquid stocks; works best on indices, bond yields, gold/crude. Weak at timing (tells "where", not "when"). 
Code: universe filter: avg_dollar_volume > threshold; prefer index/futures/major FX/BTC
Source: Sigma Allocations Masterclass

F8. Do not compare slopes of lines with different spacing / chart zoom: compare price distances only; keep labels at same degree (do not label a tiny wiggle as weekly wave 2).
Code: swing size must be >= k*ATR(HTF) to count as wave of that degree
Source: Trading 101

F9. Low-confidence counts (40% / 2 of 5 stars) are not tradeable; R:R of the shown example was poor.
Code: confidence<0.6 -> skip
Source: BitsTurtle / Good Bad Bitcoin

F10. Wave-3 scanner: skip if wave-2 correction lasted more than 6 days, or if breakout candle lacks volume confirmation (volume must exceed wave-1 volume). 
Code: if w2_bars>6 or vol<w1_volume: skip
Source: TSMInnovations

F11. Wave 5: do not short just because a new high is made; "a fifth wave can extend and a new high does not announce the exact top"; wave 5 often has weakening momentum (divergence) but needs structure/price response first.
Code: require momentum divergence AND break of channel/trendline before counter-trend entry
Source: Trading 101; Alpha Reads/TAI general text; Com Lucro intro

## 3. Contradictions / disputed points

- Wave C vs A: Prechter/Sigma say C ~= A most often (C can be much longer); Com Lucro says C = 161.8%-361.8% of A. Test both; 161.8%-361.8% is much more aggressive.
- Wave 4 depth: Sigma 23.6-38.2% of w3; Com Lucro 38.2/50/61.8 of w3 (same as w2). Test w4 depth distribution on the data.
- Wave-2 duration: TSMInnovations wants a quick wave 2 (<=6 days, i.e. no sideways) but Sigma says sharp wave 2 is followed by long wave 4. Consistent actually (different waves), but TSM trades w3 right after w2.
- Triangle entry: Elliott Wave Vision says entry at end of D in one place and after E in another (OCR/transcript noise); stop at end of E.
- Sunny Dhar says EW is unfalsifiable/subjective and that impulses can be 3-wave ABC; all others treat the 3 rules as absolute. Prechter himself: guidelines are probabilistic.
- David Paul (quoted by Com Lucro): labeling long history is a waste; keep only "3 up 2 back / 3 down 2 up" structure (i.e. trade the simple pullback in a trend).
- Wave-3 target: Com Lucro lists multiples 161.8-361.8% of w1; Sigma says first channel projection ended about 1% short. 
- Nifty wave labelling in Sigma Masterclass: w2 pull back to "8,87x" vs Guidelines video says w2 retraced 45.5% of w1 - consistent only if w1 = 7,511->9,889 (retrace 45.5% = 8,807); minor OCR.

## 4. Claims of performance (ALL UNVERIFIED)

- TSMInnovations: "Wave 3 today entry, tomorrow 3% to 20% move" thumbnail; claims "consistent income"; one example next-day +12%; says he built/tested strategies M1/M3 under various market conditions and a scanner. No win rate, no sample size given.
- Sigma Allocations: single example +3R (Nifty 2021), cherry-picked, n=1.
- Paradise Trading Tips thumbnail: "78% WINRATE" (OCR "78% WINKAIE") next to "Elliott Wave Principle"; no definition or evidence in transcript.
- BitsTurtle / Good Bad Bitcoin: indicator confidence scores (60%/3 stars vs 40%/2 stars); not backtested win rates.
- Peter Lynch quote (via Com Lucro): 50 declines of >=10% in 93 years, 15 of >=25% (market stats, not EW performance).
- Trade Nation disclaimer: 73.8% of retail CFD accounts lose money (provider statement; sobering base rate).
- Sunny Dhar: claims EW is always 100% accurate only in hindsight (anti-claim).

## 5. Most promising ideas to test (ranked)

1. Wave-4 range breakout with higher-low confirmation (R3 + R2 alternation): only enter a continuation after a sharp, deep wave 2 then a long shallow wave 4; buy stop above last lower-high, stop under higher low, 3R target. Concrete, fully specified, testable on candles; alternation (4 bars x 2.5-16 time ratio) is a clean filter. Risk: needs a pivot-based w1-w4 detector.
2. Wave-3 breakout scanner (R11): accumulation base -> high-volume wave-1 candle -> pullback <=6 bars -> close above w1 high with volume > w1 volume; enter at close, exit next day or after 2-3 bars. Needs no explicit wave count, only price/volume rules; fast to backtest, also easy to parameter-sweep (6 days, volume ratio, hold length).
3. Hard-rule validity gate + confidence/R:R filter (F1, F9, R19): trade only counts that pass the 3 rules plus alternation/equality/channel guideline score (count of guidelines satisfied = confidence), and require RR>=2. Cheap to add to the existing engine and likely improves any other signal.
4. Depth-conditioned entries: enter wave 3 only when w2 retrace is in 50%-61.8% (R1) and target 161.8%-261.8% of w1 (R7), or ABC correction ending inside 50-62% of the prior impulse (R8) with C = A or 1.618A. Test which zone has positive expectancy; resolves the C=A vs 1.618A dispute.
5. Channel/equality wave-5 exits (R5, R6): take profit near upper parallel of the w2-w4 channel and/or w5 = w1 when w3 extended; fade throwover on heavy volume. Use as an exit module for wave-3/4 entries rather than as a standalone entry.
