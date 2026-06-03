# Challenge Landing V2 → Phase 3 Design Lock: Authored Voice Engine
### (Challenge headline first; SHARED truth-constrained contract for all commentary)

> **The model styles the sentence. The code decides the facts.**
> We want the challenge accept page to open with a sentence that reads like an ESPN /
> newspaper headline about THAT player and THAT night — not a slogan assembled from
> token banks. The robotic feel was never the writing (the culture DB is genuinely
> good — it's LLM-authored offline against the Chad voice spec). It's the runtime
> template-substitution layer ("{nickname} HIT A {reason}"). Phase 3 retires that layer
> for the headline: every FACT and every HONESTY verdict is still computed
> deterministically by the code we already have; the LLM only renders those constraints
> in voice.

**Status:** LOCKED, pending implementation
**Workstream:** Commentary Voice Engine — debuts on the challenge share headline
**Supersedes:** the shelved Phase 2f rare-pull template banks (2f doubled down on the
exact template layer this retires — do NOT build 2f).
**Coupling:** MEDIUM–HIGH. One new serverless fn + a shared constraint/voice module +
client-side fact assembly at create. NO new template banks. NO threshold change. The
LLM router and the data are ALREADY staged (see recon).
**PREREQUISITE:** `origin/main` includes Phase-5c-S1 anchor-as-published-fact (the data
prep for this) and the merged 2e culture work. (Recon 2026-06-03 confirmed both live.)

---

## The load-bearing principle (read this first)

**Model styles, code decides facts.** Nothing the model writes is allowed to *decide*
anything factual or moral:
- WHO the anchor is → deterministic (`starBasePlayerId` for rare_pull;
  `selectChokeAnchor` / `selectBigScoreAnchor` for the others). Unchanged.
- WHETHER the anchor is credited / blamed / neither → deterministic
  (`classifyAnchorTruth` + the 0.60/0.90 ratio gate for choke; honest-by-construction for
  rare_pull because the star *had* the rare event). Unchanged.
- WHAT the numbers, opponent, trigger, and stat line are → deterministic, read from the
  in-memory game data at create. Unchanged.

These are **promoted, not discarded**: in 2d/2e the truth verdict chose a bank; in Phase 3
it becomes a HARD CONSTRAINT handed to the model. The Kobe mid-zone still classifies
`generic`; the model is told "name no hero, no villain here" and must obey. **Every
honesty gate we built survives; only the final styling changes from pick-a-bank to
author-in-voice. Thresholds are NOT touched.**

**Determinism — redefined, not abandoned.** An LLM is not a pure function. The landing /
share-card parity contract is preserved a different way: the headline is **generated once
at create time and persisted** in `share_headline`; both surfaces read the identical
stored string; it is never regenerated except on an explicit re-trigger. This is exactly
how `share_headline` already behaves — Phase 3 only upgrades what gets stored there.

---

## The SHARED contract (this is what makes Phase 2 / regular commentary inherit the rules)

Two artifacts are authored as **sport-agnostic AND surface-agnostic** so the challenge
headline is just the FIRST consumer. Regular commentary (Phase 2) reuses both verbatim.

### A. `CommentaryFacts` — the verified-fact object (the only thing the model is trusted with)
Built by deterministic code; the model may render ONLY what's in it.
```
CommentaryFacts {
  surface:   "challenge_headline" | "post_hand" | ...   // consumer tag
  sport:     string
  season:    string                 // e.g. "0809" — drives the anti-anachronism rule
  trigger:   "choke"|"miss"|"big_score"|"rare_pull"|"default"
  verdict:   "credited" | "blamed" | "neutral"           // from the honesty gate; model MUST obey
  anchor: {
    name, nicknames[], knownFor,    // the culture bucket (already in playerCulture.ts)
    tier, team,
    statLine,                       // the REAL box line — pts/reb/ast/...
    opponent,                       // 3-letter code (verified)
    homeAway,                       // "H" | "A"
    date,
    topReason?                      // rare_pull/big_score: {category:"pts", value:48, label}
    venue?                          // OMITTED in v1 (see Decision 1) — present only when a
                                    // verified era-bracketed source exists
  }
  // facts NOT present here may NOT appear in output. No field → no mention.
}
```

### B. `VOICE_CONTRACT` — the rules module (extends the existing Chad spec)
Reuses `BASKETBALL_VOICE`'s register, factual-accuracy, §3 personal-life, and trademark
rules verbatim, and ADDS the Phase-3 rules:
- **Render only provided facts.** If a fact isn't in `CommentaryFacts`, it does not exist.
  No invented stats, opponents, awards, or venues.
- **Obey the verdict.** `neutral` → name no hero and no villain (the mid-zone rule). `blamed`
  → the indictment is the anchor's. `credited` → the anchor is vindicated. Never contradict.
- **Anti-anachronism (the retro hazard).** The game is from season `{season}`. Write only
  from provided facts; NEVER reference a venue, roster, award, record, or franchise fact
  that postdates the season of play. (The model's training skews modern — a 2009 Heat game
  must not gain a 2024 arena or a later ring.)
- **Register = ESPN / newspaper headline.** A confident sportswriter's line about that
  player and that night. One to two clauses. Length budget ~60–110 chars (glass-tunable —
  the goal is "headline," not "culture-line ceiling").

The challenge endpoint composes `VOICE_CONTRACT` + per-sport voice pack (`voice/index.ts`
router) + the `CommentaryFacts` object into the prompt. Per-sport packs stay where they
are; football/baseball are stubs to author later. The ENGINE never changes per sport.

---

## The build (challenge headline, all triggers, basketball)

### 1. New `api/headline` serverless function (4th fn; cap is 12 — within budget)
- Input: a `CommentaryFacts` object POSTed by the client (built from `rosterRef` /
  `topGameInfoHolder` in memory at create — this SIDESTEPS the `serializeRoster` strip; no
  snapshot schema change needed).
- Server holds `VOICE_CONTRACT` + voice pack server-side (not shipped to a tamperable
  client), calls the existing `llmRouter` (Haiku primary), returns one headline string.
- **Output guard (mandatory).** Post-generation validators run before returning:
  length ceiling, §3/banned-phrase denylist, stray-token / empty check, and a
  provided-facts check where feasible (e.g. reject output naming a team not in the facts).
  Any failure OR any error/timeout → return null.

### 2. Flow (Decision 2 — client POST, brief "crafting" state)
1. "Challenge a Friend" tap → client builds `CommentaryFacts` from in-memory data.
2. `POST api/headline` → validated headline string, or null.
3. Client puts the result into the create POST's `share_headline`
   (`useChallengeShare.ts:113` already threads a client-supplied headline through).
4. `share_headline` stored once; landing + `api/share/card` read it unchanged.
5. UI shows a brief "crafting your challenge…" state during step 2 (~0.6–1.5s).

### 3. Fallback — STRICTLY ADDITIVE (never worse than today)
If `api/headline` returns null (validation fail, error, or timeout), the client falls back
to **today's** `chadShareTrashTalk({trigger, winTier})` bank pick — the current
`share_headline` default. The worst case for this feature is exactly today's behavior.
Create is never blocked on the headline.

---

## Decisions locked (from this session)

1. **Venue is opportunistic, not required.** Opponent ("against the Knicks") is verified
   data and ships in v1. A venue name (the "at MSG" flavor) is OMITTED until a verified,
   **era-bracketed** team→arena source exists (0809 Heat = American Airlines Arena, not
   Kaseya — modern maps would lie on retro seasons). `venue` stays absent from
   `CommentaryFacts` in v1, so the anti-anachronism rule guarantees no venue is ever
   invented. Arena is a fast-follow behind that map. The GOAL is the headline *feel*, not
   any one detail.
2. **Client POST → server generate → store once.** Voice spec and truth-gating live
   server-side; the brief create-time spinner is accepted over a generate-after-create race.
3. **Challenge headline only in this build.** Regular (post-hand) commentary is the
   documented **Phase 2** — it reuses `CommentaryFacts` + `VOICE_CONTRACT` unchanged, but
   the surface is render-time and blocks the win-moment reveal, so it needs speculative
   warming during the reveal animation (the `llmRouter` `waitUntil` background-work pattern
   is already built for this) with the bank picker as the not-ready fallback. NOT built
   now — but the shared contract above is authored so the rules apply to it for free.

---

## Test / acceptance gates

LLM output cannot be unit-asserted byte-for-byte — so the gates split:
1. **Deterministic layer (fully unit-tested):** `CommentaryFacts` construction — correct
   anchor, correct `verdict` (mid-zone choke → `neutral`; rare_pull → `credited`/event),
   correct stat line / opponent / season. This is the honesty layer and it IS testable.
2. **Output validators (unit-tested):** length ceiling, banned-phrase denylist,
   not-in-facts team/opponent rejection, null on failure.
3. **Fallback (unit-tested):** null from `api/headline` → `chadShareTrashTalk` bank;
   create never blocked.
4. **Determinism (integration):** same `challenge_id` → same stored `share_headline`
   across reloads (row-store, no regeneration).
5. **Voice quality (NOT unit-tested):** judged by an offline eval set scored by the
   router's existing Groq grader + on-glass review by the user. Includes retro-season
   prompts checked for modern-fact injection. Voice is reviewed, never asserted.
6. **No-venue-in-v1:** assert `venue` is never populated on `CommentaryFacts`.

## Non-negotiables (carry forward)

- Model styles, code decides facts. The LLM never decides anchor, verdict, or any number.
- All 2d/2e honesty gates promoted to constraints; 0.60/0.90 thresholds UNCHANGED.
- Strictly additive: a validated authored line OR today's bank. Never worse than today.
- Generated once, persisted, never regenerated except explicit re-trigger.
- `CommentaryFacts` + `VOICE_CONTRACT` are shared + surface-agnostic so regular commentary
  (Phase 2) inherits the rules with no rewrite.
- Anti-anachronism is a hard rule, not a nicety — retro seasons are the failure mode.
- A committed lock is NOT a build go-signal. Implementation waits for an explicit build
  prompt; build only after recon-confirmed.
