#!/usr/bin/env bash
# scripts/build-vercel.sh
# Vercel build script for the basketball-only controlled beta.
#
# Builds basketball and assembles the root beta landing page plus the SPA:
#   dist/index.html        ← basketball beta landing page
#   dist/basketball/       ← basketball SPA at /basketball
#
# Used by vercel.json (modern config — no `builds` array). Vercel
# auto-detects api/*.ts at the repo root as serverless functions
# because there's no `builds` block to override that behavior.
#
# Repo-root deps (@vercel/node, @vercel/kv) are installed for the
# api/ functions and basketball each install their own locked dependencies.

set -euo pipefail

node scripts/build-authority-data.mjs

echo "── repo-root install (api function deps) ──"
npm ci --no-audit --no-fund

echo "── basketball install + build ──"
( cd basketball && npm ci --no-audit --no-fund && npm run build )

# Unbound-symbol gate (TS2304) — catches the class esbuild ships silently and the
# spy-tested round machine never exercises (the logHandToDb bug). Runs after the
# basketball install so tsc + ../shared resolution are available. Baseline-aware:
# breaks only on NEW unbound names. set -e aborts the build on a non-zero exit.
echo "── typecheck gate (unbound symbols) ──"
node scripts/check-unbound-symbols.mjs

echo "── assembling basketball beta dist/ ──"
rm -rf dist
mkdir -p dist
# Basketball beta landing page at root.
cp chooser/index.html dist/index.html
# Root assets required by the basketball beta. Do not copy parked-sport assets
# into the deploy artifact.
for asset in og-basketball.png robots.txt sitemap.xml; do
  if [ -f "chooser/public/$asset" ]; then
    cp "chooser/public/$asset" "dist/$asset"
  fi
done
# Basketball under /basketball.
mkdir -p dist/basketball
cp -R basketball/dist/. dist/basketball/
echo "── done ──"
echo "dist/ contents (top level):"
ls -la dist/ | head -20
echo "dist/basketball/ contents:"
ls -la dist/basketball/ | head -10

# Reject dormant economy code as well as visible economy copy.
node scripts/check-free-play-build.mjs dist
