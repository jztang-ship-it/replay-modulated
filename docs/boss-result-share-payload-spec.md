# Boss Result Share Payload — Player-Attempt Portability Spec (DRAFT, glass-gated)

**Status:** DRAFT. Addressability correction this pass (CC stopped STEP 1 — gate worked): the recipient's picks/score *persist*, but **the sharer's specific attempt is NOT addressable from the bare link** — `challenge_attempts` is many-per-uuid, `?ref` is the sharer's *outgoing* token (written onto recipients' rows, the sharer's own row has `referrer_token=null`), and only scalar `best_score/best_user_name` is per-uuid. So "fetch the sharer's attempt by boss uuid" was wrong. **Resolution = the link carries the attempt reference (Option B — the URL is the join), not a boss-row stamp (collides: boss row is shared across senders) and not a new join table (premature).** Whether B is capture-free hinges on two facts (§7-C). Other gates remain green; the old-link prod survival glass (§7-B) is still John's only runtime check.

**Purpose (one line):** make the *sharer's own result* travel with the challenge link, so a recipient lands on the same boss seeing "I scored X with these five under the cap — beat it," not a cold boss link. This is the missing viral atom: shared constraint + serialized personal deviation.

**Decisions logged this session:**
- Same-season pool for both sides is the fairness rule (accounts for era stats inflation/deflation). Recon confirms the code already enforces it.
- Expiry degrades **stakes, not access**: an old challenge stays fully playable + fair; it just stops counting on *today's* global board and loses "today's boss" urgency. Never a dead link.
- Old-challenge wins are **exhibition — no streak credit** (avoids farming old easy challenges). Streaks out of scope here.
- H2H results live on the **shared board AND personal profile**, including a **rivalry tally vs a given opponent**. Schema details parked.

---

## 1. WHAT RECON ESTABLISHED (do not re-litigate)

Two distinct primitives, only one of which exists today:

- **Boss object — SOLVED.** Immutable, DB-persisted per uuid (`shared_challenges.initial_roster.cards` = the boss five, + `target_fp`). Replayable across users and across days; read path serves the stored five, never re-derives. Invariant intact: boss target = Σ the five SHOWN cards, stored not derived.
- **Player-attempt object — MISSING.** The sharer's own score, lineup (5 picks + cap spend), margin, and verdict are computed on the win screen and then discarded. Nothing about the *sharer's* attempt is serialized anywhere. The link is bare: `${origin}/${sport}/challenge/${bossChallengeId}?ref=${token}` (`BossOutwardEnding.tsx:72,114–117`) — `?ref` is referrer attribution only.
- **Season/pool fairness — SOLVED (in code, confirm-don't-build).** The challenge row stores `season` (= boss.season, `bossContract.ts:72,135`; `migration 005:57`), and the draft pool is **era-locked** to it: opening a past boss uuid pins `setActiveSeason(season)` and derives the whole pool — eligibility, FP, salary/tier — from that season (`gameAdapter.ts:164–204`, `App.tsx:682`, `DailySeasonReelGate.tsx:158`). Challenger and responder are guaranteed the *same statistical universe*; cross-season stats inflation cannot leak across the two sides. **The pool is a pure function of the `season` key over static data → pinnable + reproducible forever**, provided that season's files are deployed (§7-A).

The gap is therefore **serialization of the player attempt**, NOT projection. You cannot project a row that was never written.

## 2. SCOPE

In: capture the player attempt at share time → make it portable alongside the existing boss uuid → render it on the recipient's surface as an overlay taunt → expose it in the social/OG card.

Out (explicitly): boss redesign, persistence work on the boss, PvP, economy, auth/CTA changes. None required (recon-confirmed).

## 3. THE PLAYER-ATTEMPT OBJECT (glass-independent — finalizable now)

Fields, all read from values ALREADY computed at win/share time (the verdict/margin text is already built at `BossOutwardEnding.tsx:85–89` — this is reading existing values, not new computation):

```
player_attempt:
  score              # the sharer's achieved FP
  lineup[5]          # the sharer's five picks (card refs)
  cap_spend          # $ of $250 used  (the argument density — REQUIRED, not optional)
  margin             # delta vs boss target_fp (signed)
  verdict            # beat / lost / near-miss  (reuse existing vocab; watch near_miss→MISS drift)
  boss_ref           # the boss uuid this attempt was against
```

**`cap_spend` + `lineup` are required, not nice-to-have.** Score-only ships the weak cargo through the expensive pipe. The roster-under-cap IS the brag.

**Persistence vs addressability (the corrected truth).** The *data* persists: `score`+`is_winner` in `challenge_attempts` (`attempt.ts:147–162`), and the **five picks already persist** structured inside `challenge_attempts.score_breakdown` — a typed array per card (`basePlayerId, personKey, cardId, name, salary, wasHeld, actualFp, fpDelta, gameInfo, statLine` — `serializeResolvedRoster`, `resolvedRosterSerialization.ts:22–45`, written via `useChallengeAttempt.ts:175`). `cap_spend` is derivable as Σ `score_breakdown[].salary`. No `hand_log` on this path (`logHandToDb` is sender-side only) — don't look for one.

BUT persistence ≠ addressability. `challenge_attempts` is **many-per-uuid**, and **nothing in the bare link selects the sharer's specific row**: `?ref` is the sharer's *outgoing* device token, written onto *recipients'* attempts (`attempt.ts:60–68`) — the sharer's own attempt has `referrer_token=null`, so `?ref ↛ sharer`. The only per-uuid-addressable result is scalar `best_score/best_user_name` (`migration 006:11–12`) — score+name only, no picks. **So the reference to the sharer's attempt must travel in the link** (§7-C, Option B). Once the link names the attempt, reading its `score_breakdown` is the cheap parse — but the *naming* is the actual missing primitive, and it is not currently free.

## 4. RECIPIENT-SIDE BEHAVIOR (glass-independent — FENCED)

- Recipient opens the link → plays the **same boss** (existing path, unchanged).
- The sharer's `player_attempt` renders as an **overlay / taunt** ("Alex beat today's boss by 12 with $230 — your turn"), visible before/around play.
- **HARD FENCE:** the bar the recipient plays against stays the stored boss `target_fp` (Σ the five SHOWN cards). The sharer's score is a presentational overlay ONLY — it is NEVER merged into, summed with, or substituted for the boss target. Two numbers, never reconciled. Any code path that lets the sharer's score influence the target = upstream seam bug, STOP and report.

## 5. TOUCH-POINTS (anchored — reuse, don't invent)

- **Link carries the attempt reference:** the share builder `BossOutwardEnding.challengeSomeone / copyLink` (`BossOutwardEnding.tsx:72,114–117`) appends the attempt reference to the existing link (Option B, §7-C). Additive to the existing `?ref`.
- **Render seam (social/OG):** `/api/share/card?challenge_id=` (`api/share/card.ts`; `card_url` at `challenge/[id].ts:84`) already server-renders a card — currently boss/summary-oriented. Re-point it to be attempt-forward, reading the *named* attempt. This is a relabel of an existing renderer, not a new one.
- **Attempt read is its OWN scoped fetch — do NOT overload `sender-hand`.** `sender-hand` is the *boss projection* (boss IS the challenge); the player attempt is a *user-scoped* row with different fetch semantics. Add a small scoped GET-attempt-by-reference; do not infer attempt context through the boss endpoint.
- **Read paths unchanged** for the boss itself (`challenge/[id].ts:12–14` stays as-is).

## 6. SEASON / POOL — FAIRNESS + DURABILITY (the load-bearing axis now)

**Fairness: confirmed, don't build.** Same-season pool on both sides is already enforced (§1). The work here is to *not break* the season pin, not to add one.

**Storage: trivial — reference, never copy.** The pool is a pure function of the `season` text key. A stored challenge = `season` string + boss five (already stored) + attempt score (already stored) + the net-new player_attempt fields. **NEVER snapshot the pool/stats into a challenge row** — that turns ~2KB into ~MB and is the only way this becomes a real data problem. At any realistic volume, keeping unaccepted challenges forever is free; no storage-driven expiry needed.

**Durability: already true today (recon-confirmed).** The pool re-derives at play time from static per-season files (`/data/seasons/{key}/players.json` + `gamelogs.json`, client-fetched — `dataEngine.ts:7–13,26–31`). **All 29 boss seasons are already committed to `public/` and deploy as same-origin static assets** (213MB total, ~7MB/season; explicitly excluded from the lambda bundle, so the 250MB function ceiling is not in the path — `ensureDailyInstance.ts:36–40`). So every season currently mintable for a boss already resolves for a past uuid — the "could 404" fear is **not a live gap**, only a future-scaling question.

> **Sizing correction (earlier estimate was ~2.5× high):** per-season files are ~7MB, not 18MB (the 18MB figure was the legacy *combined* `game-logs.json` from single-season mode). 30 seasons ≈ 213MB, ~46 seasons ≈ ~330MB — not 540MB.

**Guardrail (lock this — durability by construction):** **never rotate a boss into a season whose data files aren't committed to permanent deploy.** Already satisfied for all 29; this just keeps it true as seasons are added. Reuses the existing file mechanism; invents no snapshot layer.

**Future-scaling watch (not a blocker now):** the only open size question is whether *adding seasons well beyond 29* could hit a Vercel static-deploy total-size/file-count ceiling — a plan limit, not visible in code (§7-A). Current 213MB ships fine.

**Fallback (only if a future ceiling is hit):** freeze the *computed eval-pool* (eligible set + FP + costs — tens of KB) per season, not the ~7MB raw gamelogs. That's a build; reach for it only if scaling forces it.

## 7. OPEN DECISIONS (resolve before finalize)

**A. [RESOLVED — durability-by-deploy already true] Season deploy.**
All 29 boss seasons already ship as static assets (213MB, out of lambda) — past-uuid seasons resolve today. No commitment to make; just hold the §6 guardrail as seasons are added. *Only residual:* a future-scaling ceiling check if you push *well* past 29 seasons (Vercel static-deploy plan limit, not in code) — not a blocker for the current pool.

**B. [GLASS-GATED — the ONLY remaining blocker] Old boss-row survival in prod.**
No reaper in code (confirmed: no DELETE/cron/TTL on `shared_challenges`; `expires_at` set null/unenforced). But "no reaper in code" ≠ "rows survive in prod" — a retention policy or manual ops cleanup lives outside the repo and CC cannot see it. *Resolution:* John opens one genuinely-old (>2 day) boss link on prod and confirms it (a) still plays and (b) drafts the **boss's-era pool** (its stored season), not today's. This is the single check standing between confirmed-in-code and confirmed-in-reality.

**C. [DECISION — the real build, gated on two id-facts] How the sharer's attempt is addressed.**
The sharer's attempt is not addressable from the bare link (§3). Options considered:
- ❌ **A (best-attempt overlay):** show `best_score/best_user_name`. Read-only, but it's "the leading result," not "the sharer's" — and it silently re-attributes your brag to a stranger the moment someone beats your link. Guts the personal-rivalry thesis. Rejected.
- ❌ **Boss-row stamp** (`sharer_attempt_id` on `shared_challenges`): the boss row is **one row shared by every sender** of that boss → second sharer overwrites the first; two friends can't both brag the same boss. Same collision that kills A. Rejected.
- ❌ **New Share join table** (`share_id → boss+attempt+ref`): correct mental model but premature — a new entity / migration / resolve-endpoint for what the link can already carry. Deferred (revisit only if a real social layer is built).
- ✅ **B — the link carries the attempt reference** (`…/challenge/{bossId}?ref={token}&attempt={ref}`). The URL *is* the join; each link self-describes one (boss+attempt) pair → no shared-row collision, no new table, no boss-row mutation. Recipient reads the named attempt's `score_breakdown`.

**Two facts decide whether B is capture-free (CONFIRM before building — do not assume):**
1. **`challenge_attempts.id` type** — opaque uuid → safe to put in the URL as-is. Sequential int → enumerable (anyone increments it to read others' lineups) → wrap in a thin opaque token (the minimal slice of a join, NOT the full table).
2. **Does the attempt-create response return the new id to the sharer's client?** Yes → the share builder appends it, **zero write, zero migration**. No → a one-line change to return it (still no migration).
Best case (uuid + id returned): no migration, no capture-write. `cap_spend` stays Σ-salary derived on read.

**RESOLVED (Step 0):** ✅ both best-case. `challenge_attempts.attempt_id` = uuid PK `gen_random_uuid()` (`migration 006:18`, opaque); POST attempt already returns `attempt_id` and the client already surfaces it (`attempt.ts:393–394`, `useChallengeAttempt.ts:26,217`). Route = **pure-B, no migration, no capture-write.**

**READ MECHANISM (api-cap forced — a SECOND stop, resolved):** `api/` is at **12/12 functions (Vercel Hobby cap, zero headroom)** — a new GET endpoint would be a 13th function and **fail the prod deploy**. So the doc's "add a small scoped GET" is replaced by a **no-new-function** mechanism that honors the same scoping fence:
- **Overlay read:** client-side supabase read of `challenge_attempts` by `attempt_id` (row is already `public read USING(true)`, `migration 006:38–39`; SPA already does this for `hand_log`, `useChallengeShare.ts:119`). Opaque uuid + already-public row → exposes nothing new. Its own scoped fetch, NOT `sender-hand`.
- **OG card read:** extend the EXISTING `/api/share/card.ts` to accept `&attempt=` and read `challenge_attempts` via `supabaseAdmin` (already reads `shared_challenges` server-side, `card.ts:51–54`).
**12/12 is now a HARD FENCE:** no route in this branch may add a 13th function. If anything seems to need one → STOP. Do NOT consolidate routes to free a slot inside this branch (separate decision, separate PR).

**E. [BRANCH HYGIENE] Where this lands.**
Fresh branch off main (like #2 economy-copy), independent of the HELD win-screen stack. Sequence AFTER the held boss-fit+winscreen stack merges — do not stack a third branch on an unglassed one.

## 8. FENCES (the locks — restate so CC stops at contradiction)

- Boss `target_fp` = Σ five SHOWN cards, never merged with sharer score (§4).
- **Season pin is sacred:** the recipient drafts from the **boss row's stored `season`**, never today's. Any path that resolves the pool to "today" on an old challenge = fairness break, STOP and report.
- **Never mint a boss into an un-deployed season** (§6 guardrail).
- **Never snapshot the pool/stats into a challenge row** (§6 storage rule) — reference the season key.
- **api/ is at 12/12 functions (Vercel Hobby cap) — HARD FENCE:** no new function in this branch. A 13th fails the prod deploy. Reads go client-side (public-RLS) or extend an existing route; never add an endpoint, never consolidate routes to free a slot here (§7-C).
- **Share addresses the attempt via the link, never the boss row** (§7-C): no `sharer_attempt_id` on `shared_challenges` (shared-row collision), no new join table without a separate decision.
- **Attempt read is its own scoped fetch — never overload `sender-hand`** (boss-projection ≠ user-scoped attempt).
- No auth/CTA touch: no `RegisterModal` in diffs, no `onPrimaryCTA` indirection, no claim-gate change. Additive payload + render only.
- `CardFront` / `GlobalChallengeHeader` internals untouched; reuse tokens.
- Human path byte-identical; this is the boss surface only.
- Scoped selectors for any overlay measurement (two board-inner nodes).

## 9. BUILD SEQUENCE

0. **[CONFIRM FIRST — §7-C gate]** Report `challenge_attempts.id` type (uuid vs serial int) and whether the attempt-create response returns the new id to the client. uuid + id-returned → pure-B (no migration). Serial int → STOP and report (opaque-token variant needs a one-line doc note before building).
1. **[BUILD — B, no new function]** Share builder appends `&attempt={attempt_id}` to the link. Overlay reads the named attempt via **client-side supabase read** of `challenge_attempts` (public RLS; NOT `sender-hand`, NOT a new endpoint). Derive `cap_spend` as Σ salary; `margin` = attempt score − boss `target_fp`; reuse verdict vocab.
2. **[BUILD]** Recipient overlay render (§4) + extend EXISTING `/api/share/card.ts` with `&attempt=` (read `challenge_attempts` via `supabaseAdmin`; no new function). Confirm the season pin holds on recipient draft (§8).
3. **[RUNTIME — the prod gate]** §7-B old-link survival glass: John opens a >2-day-old boss link on prod, confirms it plays + drafts its own-era pool.
4. Doc → CC reads → stops at any contradiction → builds → basketball build green → before/after for overlay copy + share-card to John for voice review BEFORE commit → John glass on device → merge discipline.

**Acceptance = glass, not green.** The loop closes only when John shares a real win, opens a genuinely-old one as a recipient, and gets a fair, playable, same-season game with his own result as the bar-to-beat over the unchanged boss target.
