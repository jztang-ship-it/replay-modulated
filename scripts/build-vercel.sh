#!/usr/bin/env bash
# scripts/build-vercel.sh — MAINTENANCE BRANCH
#
# Minimal build: produces a single dist/index.html with the maintenance
# message. The catch-all rewrite in vercel.json sends every request to
# /index.html so basketball, baseball, and api/* paths all hit this page.
#
# This branch must be PROMOTED MANUALLY via the Vercel dashboard during
# real maintenance windows. It must NEVER be merged to main, and must
# NEVER auto-deploy to production. (Vercel will create a Preview deploy
# automatically when this branch is pushed; the URL is the one you save
# for the launch-day kit.)

set -euo pipefail

echo "── maintenance build ──"
rm -rf dist
mkdir -p dist
cp chooser/index.html dist/index.html

echo "── done ──"
echo "dist/ contents:"
ls -la dist/
