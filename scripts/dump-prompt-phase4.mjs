#!/usr/bin/env node
// scripts/dump-prompt-phase4.mjs
//
// Phase 4 Pass 1 verification (lock: docs/challenge-landing-v2-phase4-
// salience-stat-hygiene-foundation-lock.md). Assembles the user prompt
// the model would receive for each of the three salience-bearing
// smoke fixtures (choke_credited / big_score / miss) using the Phase 4
// facts shape: trimmed statLine + TOTAL_FP + SALIENCE block.
//
// Not a perf/voice test — this is a SHAPE check the lock asks for
// ("Confirm via the smoke harness output or a prompt-dump"). One-off
// script; no harness changes, no fixture file changes. The fixtures
// only carry an anchor (not a full roster), so the salience values
// here are example values shaped like what computeSalience would
// produce given the anchor's statLine. The salience MATH itself is
// covered by shared/utils/__tests__/computeSalience.test.ts.

import path from "node:path";

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..");
const fixturesMod = await import(path.join(repoRoot, "basketball/src/dev/headlineMockFixture.ts"));
const voiceMod = await import(path.join(repoRoot, "shared/commentary/voiceContract.ts"));

const fixtures = fixturesMod.HEADLINE_MOCK_FIXTURES;
const { buildUserPrompt } = voiceMod;

const FP_STAT_KEYS = ["pts", "reb", "ast", "stl", "blk", "turnovers"];

// Phase 4 Pass 1 (fixup) — labels render as concepts ("42 points"), not
// analyst shorthand ("42 FP from 42 pts"). .value still carries the FP
// contribution for downstream computation / joins; only the rendered
// label changes. primaryDragPlayer carries no label field — the
// renderer composes the concept phrase from .name verbatim.

const augmented = {
  big_score: {
    totalFp: 245.8,
    fpStatKeys: FP_STAT_KEYS,
    salience: {
      // Curry pts: 42 × 1.0 = 42 FP (highest per stat).
      primaryPositive: { category: "pts", value: 42, label: "42 points" },
      // No turnovers in fixture → no negative.
    },
  },
  choke_credited: {
    totalFp: 188.3,
    fpStatKeys: FP_STAT_KEYS,
    salience: {
      // Kobe pts: 38 × 1.0 = 38 FP.
      primaryPositive: { category: "pts", value: 38, label: "38 points" },
      // Synthesized for shape: 8 turnovers across the hand drove the
      // largest negative contribution. Pinned here so the dump
      // exercises the primaryNegative concept render even though the
      // fixture's anchor statLine on its own has none.
      primaryNegative: { category: "turnovers", value: -8, label: "8 turnovers" },
      // Synthesized for shape: a held co-star fell well short. The
      // basePlayerId + shortfall stay on the object for joins /
      // computation; the renderer never emits them.
      primaryDragPlayer: {
        basePlayerId: "101108",
        name: "Chris Paul",
        shortfall: -22.5,
      },
    },
  },
  miss: {
    totalFp: 218.0,
    fpStatKeys: FP_STAT_KEYS,
    // miss has no anchor block in the fixture; salience.primaryPositive
    // shaped here as if a top contributor in a real hand had been
    // surfaced. Miss strips primaryNegative per lock §per-trigger.
    salience: {
      primaryPositive: { category: "pts", value: 30, label: "30 points" },
    },
  },
};

const CASES = ["choke_credited", "big_score", "miss"];

for (const key of CASES) {
  const fx = fixtures[key];
  if (!fx) {
    console.log(`──── ${key} (NOT FOUND) ────\n`);
    continue;
  }
  const facts = { ...fx.facts, ...augmented[key] };
  console.log(`──── ${key} · ${fx.label} ────`);
  console.log(buildUserPrompt(facts));
  console.log("");
}
