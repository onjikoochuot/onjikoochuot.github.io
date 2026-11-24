#!/usr/bin/env bash
# Copies shared code into each edge function and bundles the analysis engine for Deno.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/gen-universe.mjs
for f in viko-market viko-paper viko-picks; do cp supabase/functions/_shared/market.ts supabase/functions/$f/market.ts; done
cp supabase/functions/_shared/universe.ts supabase/functions/viko-picks/universe.ts
for f in viko-auto viko-paper; do cp app/src/engine/trail.ts supabase/functions/$f/trail.ts; done
cp app/src/engine/costs.ts supabase/functions/viko-paper/costs.ts
cat > /tmp/engine-entry.ts <<'TS'
export { analyze } from "./app/src/engine/analyze";
export { makeTip } from "./app/src/engine/layman";
TS
cp /tmp/engine-entry.ts ./engine-entry.ts
app/node_modules/.bin/esbuild engine-entry.ts --bundle --format=esm --platform=neutral --target=es2022 --minify --outfile=supabase/functions/viko-paper/engine.js --log-level=warning
rm engine-entry.ts
echo "functions built"
# viko-auto ships as compiled JS loaded from a pinned commit (supabase/functions/viko-auto/index.ts is the source).
# (viko-auto is bundled with the others below so trail.ts is inlined)
# viko-picks and viko-paper ship the same way: bundled locally (market.ts, universe.ts inlined), remote imports left as they are.
for f in viko-auto viko-picks viko-paper viko-notify; do
  app/node_modules/.bin/esbuild supabase/functions/$f/index.ts --bundle --format=esm --platform=neutral --target=es2022 --external:'jsr:*' --external:'npm:*' --external:'https://*' --outfile=supabase/functions/$f/main.js --log-level=warning
  sed -i '/edge-runtime.d.ts/d' supabase/functions/$f/main.js
done
