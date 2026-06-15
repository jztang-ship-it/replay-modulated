// shared/explanation/flavorValidator.ts
//
// RD7.12 — the FAIL-CLOSED honesty validator for LLM-authored Flavor.
//
// GOVERNING PRINCIPLE (tightening #1): a model line displays ONLY if it clears
// EVERY guard. Any guard trip, validator throw, empty/ambiguous/degenerate
// output → reject. The caller treats a reject identically to a network failure:
// fall back to the deterministic RD7.11 line. Default on ANY doubt = the safe
// deterministic line. The blocklist can't enumerate every false-agency framing;
// fail-closed covers what it misses.
//
// Pure module — no I/O, no heavy imports — so it runs in api/flavor.ts at
// runtime AND is exhaustively unit-testable (it IS the honesty guarantee, since
// the LLM output is constrained-not-proven).

/** The firewalled facts handed to the model AND used for numeric grounding.
 *  Contains NOTHING about the user's decision — the model cannot reference a
 *  call it was never told about. */
export interface FlavorFacts {
  /** Margin bucket. `beatdown` never reaches the model (suppressed upstream). */
  outcome: "win" | "close-loss" | "beatdown";
  player: { last: string; nickname?: string | null };
  /** The real box line — stats only. Present keys define the grounded number set. */
  box: { pts: number; reb?: number; ast?: number; stl?: number; blk?: number; threes?: number };
}

/** Forbidden-causation / agency / prediction set. Extends the RD7.11 adversarial
 *  sweep blocklist and promotes it from test-time to runtime. NOTE the
 *  second-person guard: the Flavor is about the GAME/PLAYER, never the user —
 *  ANY "you/your" is an instant reject (the model is never given a user
 *  decision, so a "you" framing is by definition a hallucinated agency claim). */
export const FLAVOR_FORBIDDEN: readonly RegExp[] = [
  /\byou\b/i, /\byour\b/i, /\byours\b/i, /\byourself\b/i,   // no second person at all
  /came through/i, /delivered/i, /showed up when/i, /when it mattered/i,
  /when you needed/i, /rose to/i, /answered the call/i, /\bclutch\b/i,
  /stepped up/i, /paid off/i, /good call/i, /great call/i, /nice call/i,
  /smart (hold|pickup|pick|grab|stash)/i,
  /\b(called|knew|read|predicted|nailed|guessed)\b/i,   // prediction framing
  /\bheld\b/i, /\bfaded\b/i, /\bredraw\b/i, /\bswap\b/i,  // decision vocabulary
];

/** Personal-life / legal / tragedy denylist (ported from api/headline.ts §3 —
 *  NEVER personal life, even where a league-penalty exception might technically
 *  permit it). Matched case-insensitive substring. */
const PHRASE_DENYLIST: readonly string[] = [
  "arrest", "indictment", "lawsuit", "court date", "rape", "assault", "battery",
  "domestic", "dui", "rehab", "overdose", "addiction", "substance", "divorce",
  "custody", "affair", "mistress", "died", "death", "fatal", "suicide", "cancer",
  "tumor", "diagnosed", "racist", "homophobic", "slur", "bankruptcy", "bankrupt",
];

/** The router's last-resort string when every model errored (per api/headline).
 *  Detecting it is the only way to surface "all upstream failed". */
const APOLOGY_SENTINEL = "Off night. The numbers don't lie.";

/** Hard length cap — one clause, not an essay. */
const FLAVOR_MAX_LENGTH = 140;

/** True if the string contains any C0/C1 control character. Codepoint check
 *  (not a regex literal) so no control bytes live in this source file. */
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const cc = s.charCodeAt(i);
    if (cc < 0x20 || cc === 0x7f) return true;
  }
  return false;
}

/** Numbers the output is allowed to cite = exactly the box-line values present. */
function groundedNumbers(facts: FlavorFacts): Set<number> {
  const out = new Set<number>();
  for (const v of Object.values(facts.box)) {
    if (typeof v === "number" && Number.isFinite(v)) out.add(Math.round(v));
  }
  return out;
}

export interface FlavorValidation {
  ok: boolean;
  /** The trimmed line when ok; undefined when rejected. */
  line?: string;
  /** Machine reason for telemetry / tests when rejected. */
  reason?: string;
}

/** Validate a candidate model line against ALL guards. FAILS CLOSED: returns
 *  ok:false on any guard trip, on a thrown error, or on any ambiguity. Never
 *  throws. */
export function validateFlavor(candidate: unknown, facts: FlavorFacts): FlavorValidation {
  try {
    // Ambiguity / degenerate-shape guards (fail closed).
    if (typeof candidate !== "string") return { ok: false, reason: "not-a-string" };
    const line = candidate.trim();
    if (line.length === 0) return { ok: false, reason: "empty" };
    if (line.length > FLAVOR_MAX_LENGTH) return { ok: false, reason: "too-long" };
    if (hasControlChars(line)) return { ok: false, reason: "control-chars" };
    if (line === APOLOGY_SENTINEL) return { ok: false, reason: "apology-sentinel" };

    // Beatdown must never have reached the model — defense in depth.
    if (facts.outcome === "beatdown") return { ok: false, reason: "beatdown-suppressed" };

    const lower = line.toLowerCase();

    // Forbidden causation / agency / prediction / second-person.
    for (const re of FLAVOR_FORBIDDEN) {
      if (re.test(line)) return { ok: false, reason: `forbidden:${re.source}` };
    }
    // Personal-life / legal denylist.
    for (const term of PHRASE_DENYLIST) {
      if (lower.includes(term)) return { ok: false, reason: `denylist:${term}` };
    }

    // Numeric grounding — every integer cited must be a grounded box-line value.
    const allowed = groundedNumbers(facts);
    const cited = line.match(/\d+/g) ?? [];
    for (const tok of cited) {
      const n = parseInt(tok, 10);
      if (!Number.isFinite(n)) return { ok: false, reason: "nan-token" };
      if (!allowed.has(n)) return { ok: false, reason: `ungrounded-number:${n}` };
    }

    return { ok: true, line };
  } catch {
    // Validator-internal error → fail closed.
    return { ok: false, reason: "validator-threw" };
  }
}
