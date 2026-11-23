#!/usr/bin/env bash
# Copies shared code into each edge function and bundles the analysis engine for Deno.
set -euo pipefail
cd "$(dirname "$0")/.."
for f in viko-market viko-paper viko-picks; do cp supabase/functions/_shared/market.ts supabase/functions/$f/market.ts; done
cat > /tmp/engine-entry.ts <<'TS'
export { analyze } from "./app/src/engine/analyze";
export { makeTip } from "./app/src/engine/layman";
TS
cp /tmp/engine-entry.ts ./engine-entry.ts
app/node_modules/.bin/esbuild engine-entry.ts --bundle --format=esm --platform=neutral --target=es2022 --minify --outfile=supabase/functions/viko-paper/engine.js --log-level=warning
rm engine-entry.ts
echo "functions built"
