# Challenge Landing V2 — Phase 2a Design Lock: Voice Re-tone + Take-Card Generator

**Status:** LOCKED, pending implementation
**Workstream:** Accept / Challenge Landing V2
**Phase:** 2a of 2 (2a = voice + generator, NO UI; 2b = landing component + hold badges, consumes 2a)
**Depends on:** Phase 0 (snapshot `wasHeld`/`actualFp`/`holdsRecorded`) + Phase 1 (choke trigger + stamp) — both merged + PROD-verified.
**Coupling:** MEDIUM. New isolated module (low risk) + a re-tone of existing banks + an amendment to a LOCKED canonical doc (must be deliberate, not silent).

---

## What 2a delivers (and explicitly does NOT)

DELIVERS:
1. A sync + amendment of the canonical voice doc (`commentary-voice-system.md`).
2. A re-tone of the choke banks (fixes a shipped prose bug + raises the spice to the approved ceiling).
3. A new pure module `shared/challengeTakeCard/` (`types.ts`, `templates.ts`, `generateChallengeTakeCard.ts`) that turns challenge data into the four landing fields — deterministically.

DOES NOT (→ 2b): the landing component, hold-badge rendering, any layout. 2a is pure logic + copy. The generator's OUTPUT CONTRACT (below) is the seam 2b builds against.

---

## Part 1 — Voice: amend the canonical doc, then re-tone

### 1a. Amendment to `commentary-voice-system.md` (a LOCKED doc — change it on purpose)

The doc's §3 guardrails are a **defamation rail for REAL PUBLIC FIGURES** (players in culture lines) and stay 100% intact. What we are loosening is the *separate* "never get personal with the user" instinct — and the users (sender + recipient) are NOT public figures. Add a new subsection (proposed §3a) recording the deliberate change:

> **§3a — Challenge-surface user needling (challenge surfaces only).** On challenge
> initiation, recipient intro/landing, and resolution surfaces, Chad MAY needle the
> *sender* and *recipient* personally — their decisions, their competence, their
> nerve ("you'd have choked the same," "talked himself into it"). This is a
> deliberate exception to the general "needle the play, not the person" instinct,
> made because acceptance is driven by provocation ("I'd never blow that").
> **Unchanged and still LOCKED:** real players keep the full §3 protection (no
> player gets called a choker); §2 language rules hold (no profanity, no violence
> metaphors, nothing that wouldn't run in a beer commercial); "not overly offensive."
> The safety valve is surface routing — the savage line lives on the *recipient's*
> view (sender never sees it); the sender's own prompt stays send-friendly self-roast.

This amendment is mandatory and ships in the same commit as the re-tone (doc-first per the system's own "edit here first" rule). A future reader must see the ceiling moved deliberately.

### 1b. Correctness bug the re-tone MUST fix

The `TOP_CHOKE_*` banks (`chadChallenge.ts` ~692–729) still contain the literal words
**"bad beat"** in prose ("that's a bad beat if I've ever seen one," "textbook bad
beat," "Pure bad beat"). Phase 1 renamed the constant + stamp token but deferred prose.
Result: a CHOKE-stamped line currently *says* "bad beat" on the results screen — a
visible contradiction. The re-tone removes every literal "bad beat" from the choke
banks. NON-NEGOTIABLE regardless of spice.

### 1c. Re-tone scope + approved register

The sender-side `INITIATION_CHOKE` banks (§B.1 of the harvest) are ALREADY on-register
("brought you a casserole") — light touch, keep the voice. The stale-sympathetic
problem is concentrated in the RECIPIENT-facing banks (`INTRO_CHOKE_*`, `NUDGE_CHOKE_*`)
and the buggy `TOP_CHOKE_*`. Re-tone those to:
- **Name the choke explicitly** (it's the product distinction from a bad beat AND the sting).
- **Needle the sender personally** ("talked himself into," "you'd have choked the same") per §3a.
- **Provoke the recipient** ("prove you'd read it cleaner, or admit you'd have choked too").
- Keep §2 length/clean rules; players untouched.

**Approved register (the ceiling — write to this, not past it):**
- Recipient landing: "{challengerName} held {name} and still bricked it — {targetScore}, a stone-cold choke. The cards were loaded; the hands weren't. Same six are yours."
- "{challengerName} talked himself into {name} and got buried for it — {targetScore}. Prove you'd have read it cleaner, or admit you'd have choked the same."
- Direct rile: "{challengerName} choked {targetScore} with a loaded hand. The only worse look is scrolling past without trying."
- Sender self-roast (send-friendly): "You had the studs and choked it. Misery loves company — go find some."

Sync `commentary-voice-system.md` §7 in the same pass: `{ stamp: "bad_beat" }` → `{ stamp: "choke" }`, `INTRO_BAD_BEAT_*` → `INTRO_CHOKE_*`, and the §7 choke lines re-toned to match the above (the doc currently shows the OLD sympathetic lines).

---

## Part 2 — The Take-Card Generator (`shared/challengeTakeCard/`)

### 2a. Architecture: new pure layer, consumes the voice spine, does NOT fork it

Per the external architecture review (#1/#4/#5 — keep the story engine pure and
isolated) and the original V2 spec. The module is:
- `types.ts` — input + output types.
- `templates.ts` — slot-keyed banks, authored to the Chad spine, carrying a one-line
  pointer to `commentary-voice-system.md` (same pattern as the per-sport voice modules).
- `generateChallengeTakeCard.ts` — the pure selector.

**Why new banks, not reuse of `INTRO_CHOKE_*`:** the existing intro banks are *composite*
single lines (hook+outcome+nudge fused) sized for the H2H reveal surface. The take card
needs the four V2 fields **decomposed** so 2b can place each in the landing hierarchy
(hook at top, outcome by the score, disagreement by the cards, CTA on the button). That
decomposition doesn't exist anywhere yet. New SLOT-keyed banks in the SAME voice is not a
fork (§6 of the voice doc already lists multiple bank files implementing one spine) — it's
a new surface. The re-tone (Part 1) and these banks must stay tonally synced; apply the
same register to both in this phase.

### 2b. Output contract (the seam 2b builds against — lock this exactly)

```ts
interface ChallengeTakeCard {
  hookHeadline: string;      // top of landing — the provocation
  outcomeLine: string;       // by the score — what happened, score visible but not hero
  disagreementLine: string;  // by the cards — where acceptance happens
  ctaText: string;           // the button — "PLAY YOUR LINE" family, never "Accept Challenge"
}
```

All four are plain resolved strings (tokens already substituted). No `Line[]`/stamp
shapes — the landing renders the trigger stamp separately (the CHOKE/MISS stamp from
Phase 1 is its own element; the take card is the prose around it). Keeps the generator UI-agnostic.

### 2c. Input contract

```ts
interface TakeCardInput {
  trigger: "rare_pull" | "big_score" | "choke" | "miss" | "default"; // ALREADY normalized
  challengerName: string | null;
  targetScore: number;
  winTier: string;
  // from the enriched Phase-0 snapshot (deserialized roster):
  holdsRecorded: boolean;              // gate — see 2e
  heldCards: { name: string; actualFp: number; tier: string }[]; // wasHeld===true cards
  anchorName: string | null;          // resolved from anchor_base_player_id
  // miss only:
  nearMissGap: number | null;
  nearMissNextTier: string | null;
  challengeId: string;                 // determinism seed — see 2d
}
```

The caller (2b's landing) derives this from `ChallengeData` + the deserialized enriched
roster. `trigger` MUST be the normalized value (`normalizeTriggerType` already maps stored
`"bad_beat"`→`"choke"` at the landing boundary — the generator never sees raw `bad_beat`).

### 2d. DETERMINISM (load-bearing — the existing selectors get this WRONG for this surface)

The existing banks pick via `Math.random` (`chadChallenge.ts:21,567`) — they reroll every
render. **The take card MUST be deterministic per challenge:**
- Same challenge → same take card on every landing open (no reroll on refresh).
- The landing take card and the OG share-card image (`api/share/card`) MUST match — they
  render from different runtimes, so the only way they agree is a deterministic seed.

Implement a seeded pick: `seededPick(bank, seed)` where `seed = hash(challengeId + slotName)`
(distinct slot salt so the four fields don't all index the same position). Pure, no ring
buffer, no `Math.random`. Do NOT reuse `pickWithAntiRepeat`.

### 2e. Mode: correction vs competition (the disagreement slot flips on this)

The four triggers split into two acceptance psychologies — the disagreement slot is
written differently per mode:
- **Correction** (`choke`, `miss`): "I'd have done it better." Disagreement names the
  sender's decision and dares the reader to top it ("{challengerName} held {anchorName}
  and bricked — would you?").
- **Competition** (`big_score`, `rare_pull`): "I'll match that." Disagreement is
  respect-the-line, can-you-even-match ("{challengerName} caught fire — can you touch it?").
- **Neutral** (`default`): straight "same hand, your move."

The generator derives mode from trigger and selects the disagreement bank accordingly.
hook/outcome/cta are trigger-keyed; disagreement is mode-keyed (with trigger refinement).

### 2f. The holdsRecorded gate (graceful degrade for legacy challenges)

The hold-aware disagreement line ("{challengerName} held {anchorName} and {name2} and
bricked") needs `heldCards` from the enriched snapshot. Legacy challenges (Phase-0-pre)
have `holdsRecorded:false` and empty `heldCards`. When `holdsRecorded===false`, the
generator MUST fall back to a hold-agnostic disagreement line ("{challengerName} put up
{targetScore} on this hand — beat it") rather than emit a broken "held " with no name.
This is the same graceful-degrade contract Phase 0 established; the take card never
renders a half-filled token.

### 2g. CTA family (per V2 spec — avoid the anti-patterns)

`ctaText` draws from: "PLAY YOUR LINE", "PROVE YOUR LINE", "TAKE THE SAME HAND", "FIX THE
HAND" (choke-leaning), "BEAT THAT LINE" (competition-leaning). NEVER "Accept Challenge",
"Start Game", "Beat Score". Mode-aware: correction → "FIX/PROVE" energy; competition →
"BEAT/MATCH" energy.

---

## Out of scope for 2a

- Landing component, hold badges, layout → 2b.
- Discarded-card "would-have" outcomes (the "John cut Vucevic; Vucevic dropped 52" hook) —
  the Phase-0 data question flagged as unresolved; NOT in the snapshot, do not chase here.
- F5 magnitude self-scaling (voice-doc backlog).
- Wiring the generator into `api/share/card` (the OG image) — 2a defines the deterministic
  contract that MAKES that possible, but the image wiring is a 2b/later task. Note it.

---

## Gates

- `npm test`:
  - Generator unit: each trigger produces all four non-empty fields; tokens fully
    substituted (no stray `{...}`).
  - **Determinism: same `challengeId` → identical take card across repeated calls; two
    different ids generally differ.** (The core contract.)
  - Mode: a `choke`/`miss` input produces a correction-style disagreement; a
    `big_score`/`rare_pull` produces a competition-style one (assert by keyword/shape).
  - holdsRecorded gate: `holdsRecorded:false` + empty `heldCards` → hold-agnostic
    disagreement, no half-filled token.
  - CTA: never emits a banned phrase ("Accept Challenge"/"Start Game"/"Beat Score").
  - Re-tone: **no choke bank (templates.ts OR chadChallenge.ts OR voice-doc §7) contains
    the literal "bad beat"** (the Phase-1 prose bug guard).
- `npx tsc --noEmit`
- `bash scripts/build-vercel.sh` (shared/ touched)
- Function count 11/12.

## Assert-the-neighbors

The re-tone edits shared `chadChallenge.ts` choke banks that ALSO render on the H2H
recipient-reveal surface (not just the landing). Ship a check that the re-toned
`INTRO_CHOKE_*` / `TOP_CHOKE_*` lines still satisfy the F2 graceful-handoff rule (read
clean before/after any `{cultureLine}`) — a spicier line that breaks the culture-line seam
is a regression on a surface 2a isn't even building. And confirm no surface now emits a
choke line containing "bad beat".

## Live-verification (deferred to 2b)

2a is pure logic — verified by tests. The take card only becomes visible when 2b renders
it. At 2b PROD time: open a real choke challenge, confirm the four fields read as the
approved register, the CHOKE stamp sits beside them, and a refresh produces the SAME card.
