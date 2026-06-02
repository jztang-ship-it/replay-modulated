// shared/challengeTakeCard/__tests__/chokeBankProse.test.ts
//
// Phase 2a "no choke bank anywhere contains 'bad beat'" guard. The
// Phase-1 rename left the constant + stamp token at "choke" but the
// PROSE in the TOP_CHOKE_* / INTRO_CHOKE_* / NUDGE_CHOKE_* banks still
// said "bad beat" — a CHOKE-stamped line saying "bad beat" was the bug
// the Phase-2a re-tone is mandated to fix. This test pins that all three
// bank surfaces — the take-card module, the chad challenge intro/nudge
// banks, AND the canonical voice doc §7 — agree the prose is choke now.
//
// Source-text assertions are deliberate. INTRO_CHOKE_* and TOP_CHOKE_*
// in chadChallenge.ts aren't exported as standalone arrays; reading the
// raw source guarantees the check covers the entire choke surface
// regardless of how the selectors export.
//
// Phase-1 historical comments ("renamed from bad_beat", "the Phase-1-
// deferred prose bug" notes in my own re-tone comments) are NOT user-
// facing prose and are excluded by the surface-match regexes below.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { HOOKS, OUTCOMES, DISAGREEMENTS, CTAS } from "../templates";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CHAD_CHALLENGE_PATH = resolve(__dirname, "../../commentary/chadChallenge.ts");
const VOICE_DOC_PATH = resolve(__dirname, "../../../docs/commentary-voice-system.md");

/** Extract the user-facing string contents of a bank-block name to
 *  scan only the PROSE (not the surrounding TS comments). The regex
 *  finds `const NAME: ...= [...]` and pulls everything between the
 *  square brackets, then strips // line comments before scanning. */
function extractBankProse(src: string, bankName: string): string {
  const re = new RegExp(`const\\s+${bankName}\\b[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\];`, "m");
  const m = re.exec(src);
  if (!m) return "";
  return m[1]
    // Strip // line comments — bank prose never carries a //
    .replace(/\/\/.*$/gm, "");
}

describe("Phase 2a — no choke bank prose contains the literal 'bad beat'", () => {
  it("templates.ts (the take-card module) — none of HOOKS/OUTCOMES/DISAGREEMENTS/CTAS contains 'bad beat'", () => {
    const allStrings = [
      ...Object.values(HOOKS).flat(),
      ...Object.values(OUTCOMES).flat(),
      ...Object.values(CTAS).flat(),
      ...Object.values(DISAGREEMENTS).flatMap(modeBanks =>
        Object.values(modeBanks).flatMap(b => [...(b.withAnchor ?? []), ...(b.withTwoHelds ?? []), ...(b.noAnchor ?? [])])),
    ];
    for (const s of allStrings) {
      expect(s.toLowerCase(), `take-card bank entry contains 'bad beat': ${s}`).not.toContain("bad beat");
    }
  });

  it("chadChallenge.ts — TOP_CHOKE_HELD_ONE prose contains no 'bad beat'", () => {
    const src = readFileSync(CHAD_CHALLENGE_PATH, "utf8");
    const prose = extractBankProse(src, "TOP_CHOKE_HELD_ONE");
    expect(prose.length, "TOP_CHOKE_HELD_ONE not found").toBeGreaterThan(0);
    expect(prose.toLowerCase()).not.toContain("bad beat");
  });

  it("chadChallenge.ts — TOP_CHOKE_HELD_TWO_PLUS prose contains no 'bad beat'", () => {
    const src = readFileSync(CHAD_CHALLENGE_PATH, "utf8");
    const prose = extractBankProse(src, "TOP_CHOKE_HELD_TWO_PLUS");
    expect(prose.length).toBeGreaterThan(0);
    expect(prose.toLowerCase()).not.toContain("bad beat");
  });

  it("chadChallenge.ts — TOP_CHOKE_NO_HOLDS prose contains no 'bad beat'", () => {
    const src = readFileSync(CHAD_CHALLENGE_PATH, "utf8");
    const prose = extractBankProse(src, "TOP_CHOKE_NO_HOLDS");
    expect(prose.length).toBeGreaterThan(0);
    expect(prose.toLowerCase()).not.toContain("bad beat");
  });

  it("chadChallenge.ts — INTRO_CHOKE_CULTURE / NAME / GENERIC prose contains no 'bad beat'", () => {
    const src = readFileSync(CHAD_CHALLENGE_PATH, "utf8");
    for (const bank of ["INTRO_CHOKE_CULTURE", "INTRO_CHOKE_NAME", "INTRO_CHOKE_GENERIC"]) {
      const prose = extractBankProse(src, bank);
      expect(prose.length, `${bank} not found`).toBeGreaterThan(0);
      expect(prose.toLowerCase(), `${bank} contains 'bad beat'`).not.toContain("bad beat");
    }
  });

  it("chadChallenge.ts — NUDGE_CHOKE_CULTURE / NAME / GENERIC prose contains no 'bad beat'", () => {
    const src = readFileSync(CHAD_CHALLENGE_PATH, "utf8");
    for (const bank of ["NUDGE_CHOKE_CULTURE", "NUDGE_CHOKE_NAME", "NUDGE_CHOKE_GENERIC"]) {
      const prose = extractBankProse(src, bank);
      expect(prose.length, `${bank} not found`).toBeGreaterThan(0);
      expect(prose.toLowerCase(), `${bank} contains 'bad beat'`).not.toContain("bad beat");
    }
  });

  it("commentary-voice-system.md §7 — INTRO_CHOKE_* and NUDGE_CHOKE_* doc samples contain no 'bad beat'", () => {
    const doc = readFileSync(VOICE_DOC_PATH, "utf8");
    // §7 is the applied register sample, fenced in ```ts blocks.
    // Scan every code block, extract any const INTRO_CHOKE_* /
    // NUDGE_CHOKE_* / TOP_CHOKE_* block, and assert no "bad beat"
    // string in its body.
    const codeBlocks = [...doc.matchAll(/```ts\n([\s\S]*?)```/g)].map(m => m[1]);
    for (const block of codeBlocks) {
      for (const bank of [
        "INTRO_CHOKE_CULTURE", "INTRO_CHOKE_NAME", "INTRO_CHOKE_GENERIC",
        "NUDGE_CHOKE_CULTURE", "NUDGE_CHOKE_NAME", "NUDGE_CHOKE_GENERIC",
        "TOP_CHOKE_HELD_ONE", "TOP_CHOKE_HELD_TWO_PLUS", "TOP_CHOKE_NO_HOLDS",
      ]) {
        const prose = extractBankProse(block, bank);
        if (prose.length === 0) continue; // bank not in this block
        expect(prose.toLowerCase(), `voice doc §7 ${bank} contains 'bad beat'`).not.toContain("bad beat");
      }
    }
  });

  it("voice doc §3a amendment is present (the deliberate change is recorded)", () => {
    const doc = readFileSync(VOICE_DOC_PATH, "utf8");
    expect(doc).toContain("§3a");
    expect(doc).toMatch(/Challenge-surface user needling/i);
    expect(doc).toMatch(/deliberate amendment/i);
  });
});

describe("Phase 2a — assert-the-neighbors — F2 graceful handoff on re-toned INTRO_CHOKE_* / TOP_CHOKE_*", () => {
  // F2 (voice doc §4): the frame must read clean BEFORE or AFTER any
  // {cultureLine}. A spicier line that breaks the seam is a regression
  // on a surface 2a isn't even building. We pin two structural
  // properties on every line containing {cultureLine}:
  //   1. The frame text doesn't anticipate the cultureLine's content
  //      (no "and {cultureLine}" without a clean sentence boundary on
  //      either side).
  //   2. Wherever {cultureLine} sits, removing it (substituting the
  //      empty string or a short generic stand-in) leaves a parseable
  //      sentence — no double-spaces, no doubled punctuation, no
  //      orphaned conjunctions.
  //
  // Implementation: scan source for each LINE within INTRO_CHOKE_CULTURE
  // and verify both adjacencies of {cultureLine} are clean.

  function extractBankLineStrings(src: string, bankName: string): string[] {
    const block = extractBankProse(src, bankName);
    if (!block) return [];
    // Each line is `[parts]` — pull out the string segments only.
    const lines = [...block.matchAll(/\[([\s\S]*?)\](?:,|\s*$)/g)].map(m => m[1]);
    // Within each line, concatenate the string literals (ignoring
    // StampToken objects); this gives the "rendered without the
    // stamp" prose with placeholders intact.
    return lines.map(line => {
      const strs = [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
      return strs.join("");
    });
  }

  it("INTRO_CHOKE_CULTURE — each {cultureLine} has whitespace or sentence boundary on both sides", () => {
    const src = readFileSync(CHAD_CHALLENGE_PATH, "utf8");
    const lines = extractBankLineStrings(src, "INTRO_CHOKE_CULTURE");
    expect(lines.length, "INTRO_CHOKE_CULTURE: no lines extracted").toBeGreaterThan(0);
    for (const line of lines) {
      // Every line in this bank should reference {cultureLine}.
      expect(line, `INTRO_CHOKE_CULTURE line missing {cultureLine}: ${line}`).toContain("{cultureLine}");
      // Before {cultureLine}: previous char (if any) is whitespace,
      // sentence terminator (. ! ?), or em-dash (—).
      const beforeRe = /(.|^)\{cultureLine\}/g;
      for (const m of line.matchAll(beforeRe)) {
        const ch = m[1];
        if (ch === "" || ch === undefined) continue; // start-of-string
        expect(/[\s.!?—]/.test(ch),
          `INTRO_CHOKE_CULTURE: {cultureLine} preceded by '${ch}' — needs whitespace or terminator. Line: ${line}`).toBe(true);
      }
      // After {cultureLine}: next char (if any) is whitespace or
      // sentence terminator (no run-on into a continuing word).
      const afterRe = /\{cultureLine\}(.|$)/g;
      for (const m of line.matchAll(afterRe)) {
        const ch = m[1];
        if (ch === "" || ch === undefined) continue;
        expect(/[\s.!?,—]/.test(ch),
          `INTRO_CHOKE_CULTURE: {cultureLine} followed by '${ch}' — needs whitespace or terminator. Line: ${line}`).toBe(true);
      }
    }
  });

  it("INTRO_CHOKE_CULTURE — removing {cultureLine} (with surrounding space) leaves a parseable sentence", () => {
    const src = readFileSync(CHAD_CHALLENGE_PATH, "utf8");
    const lines = extractBankLineStrings(src, "INTRO_CHOKE_CULTURE");
    for (const line of lines) {
      // Simulate the empty-cultureLine case the lock forbids: strip
      // {cultureLine} plus one surrounding space. The residue must
      // not have doubled punctuation or doubled spaces.
      const stripped = line.replace(/\s*\{cultureLine\}\s*/g, " ").trim();
      expect(stripped, `INTRO_CHOKE_CULTURE: empty cultureLine left doubled space: ${line}`).not.toMatch(/\s{2,}/);
      expect(stripped, `INTRO_CHOKE_CULTURE: empty cultureLine left doubled punctuation: ${line}`).not.toMatch(/[.,!?—]{2,}/);
      // Length sanity — a line that becomes empty after stripping
      // {cultureLine} was a single-token frame and would render
      // nothing useful when culture is missing.
      expect(stripped.length, `INTRO_CHOKE_CULTURE: line collapses to empty when cultureLine missing: ${line}`).toBeGreaterThan(10);
    }
  });

  it("TOP_CHOKE_HELD_ONE — bank does NOT depend on {cultureLine} (this surface has no culture wrap)", () => {
    // TOP_CHOKE_* runs in the post-reveal commentary path which
    // doesn't substitute {cultureLine}. If a re-tone accidentally
    // pulled a culture token in (it would render literally as the
    // unmatched brace), catch it here.
    const src = readFileSync(CHAD_CHALLENGE_PATH, "utf8");
    const lines = extractBankLineStrings(src, "TOP_CHOKE_HELD_ONE");
    for (const line of lines) {
      expect(line, `TOP_CHOKE_HELD_ONE line includes {cultureLine} (wrong surface): ${line}`).not.toContain("{cultureLine}");
    }
  });
});
