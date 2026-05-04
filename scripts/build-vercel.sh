#!/usr/bin/env bash
# scripts/build-vercel.sh
# Vercel build script for the multi-app monorepo.
#
# Builds basketball + baseball + football as three static sites and assembles
# them into a single dist/ at the repo root:
#   dist/index.html        ← chooser landing page at site root
#   dist/basketball/       ← basketball SPA at /basketball
#   dist/baseball/         ← baseball SPA at /baseball
#   dist/football/         ← football SPA at /football
#
# Used by vercel.json (modern config — no `builds` array). Vercel
# auto-detects api/*.ts at the repo root as serverless functions
# because there's no `builds` block to override that behavior.
#
# Repo-root deps (@vercel/node, @vercel/kv) are installed for the
# api/ functions; basketball + baseball + football each install their own.

set -euo pipefail

echo "── repo-root install (api function deps) ──"
npm install --no-audit --no-fund

echo "── basketball install + build ──"
( cd basketball && npm install --no-audit --no-fund && npm run build )

echo "── baseball install + build ──"
( cd baseball && npm install --no-audit --no-fund && npm run build )

echo "── football install + build ──"
( cd football && npm install --no-audit --no-fund && npm run build )

echo "── assembling unified dist/ ──"
rm -rf dist
mkdir -p dist
# Chooser landing page at root — sport selector + localStorage redirect.
cp chooser/index.html dist/index.html
# Chooser static assets at root (OG share images, favicons, etc.). Optional —
# present only when chooser/public/ exists. Drop og-home.png, og-basketball.png,
# og-baseball.png in there to populate the Open Graph + Twitter unfurl tiles
# referenced by chooser/index.html, basketball/index.html, baseball/index.html.
if [ -d chooser/public ]; then
  cp -R chooser/public/. dist/
fi
# Basketball under /basketball.
mkdir -p dist/basketball
cp -R basketball/dist/. dist/basketball/
# Baseball under /baseball.
mkdir -p dist/baseball
cp -R baseball/dist/. dist/baseball/
# Football under /football.
mkdir -p dist/football
cp -R football/dist/. dist/football/

echo "── done ──"
echo "dist/ contents (top level):"
ls -la dist/ | head -20
echo "dist/basketball/ contents:"
ls -la dist/basketball/ | head -10
echo "dist/baseball/ contents:"
ls -la dist/baseball/ | head -10
echo "dist/football/ contents:"
ls -la dist/football/ | head -10
