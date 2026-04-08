#!/usr/bin/env bash
# scripts/build-vercel.sh
# Vercel build script for the multi-app monorepo.
#
# Builds basketball + baseball as two static sites and assembles them
# into a single dist/ at the repo root:
#   dist/                  ← basketball SPA at site root
#   dist/baseball/         ← baseball SPA at /baseball
#
# Used by vercel.json (modern config — no `builds` array). Vercel
# auto-detects api/*.ts at the repo root as serverless functions
# because there's no `builds` block to override that behavior.
#
# Repo-root deps (@vercel/node, @vercel/kv) are installed for the
# api/ functions; basketball + baseball each install their own.

set -euo pipefail

echo "── repo-root install (api function deps) ──"
npm install --no-audit --no-fund

echo "── basketball install + build ──"
( cd basketball && npm install --no-audit --no-fund && npm run build )

echo "── baseball install + build ──"
( cd baseball && npm install --no-audit --no-fund && npm run build )

echo "── assembling unified dist/ ──"
rm -rf dist
mkdir -p dist
# Basketball at the root.
cp -R basketball/dist/. dist/
# Baseball under /baseball.
mkdir -p dist/baseball
cp -R baseball/dist/. dist/baseball/

echo "── done ──"
echo "dist/ contents (top level):"
ls -la dist/ | head -20
echo "dist/baseball/ contents:"
ls -la dist/baseball/ | head -10
