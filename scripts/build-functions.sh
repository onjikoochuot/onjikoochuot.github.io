#!/usr/bin/env bash
# Copies shared code into each edge function and bundles the analysis engine for Deno.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/gen-universe.mjs
for f in viko-market viko-paper viko-picks; do cp supabase/functions/_shared/market.ts supabase/functions/$f/market.ts; done
cp supabase/functions/_shared/universe.ts supabase/functions/viko-picks/universe.ts
cat > /tmp/engine-entry.ts <<'TS'
export { analyze } from "./app/src/engine/analyze";
export { makeTip } from "./app/src/engine/layman";
TS
cp /tmp/engine-entry.ts ./engine-entry.ts
app/node_modules/.bin/esbuild engine-entry.ts --bundle --format=esm --platform=neutral --target=es2022 --minify --outfile=supabase/functions/viko-paper/engine.js --log-level=warning
rm engine-entry.ts
echo "functions built"
# viko-auto ships as compiled JS loaded from a pinned commit (supabase/functions/viko-auto/index.ts is the source).
app/node_modules/.bin/esbuild supabase/functions/viko-auto/index.ts --format=esm --platform=neutral --target=es2022 --outfile=supabase/functions/viko-auto/main.js --log-level=warning
sed -i '1{/edge-runtime.d.ts/d}' supabase/functions/viko-auto/main.js
