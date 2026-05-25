# H2H reveal arc — phase 1 (sender-hand endpoint) smoke — 2026-05-26

## Run context

| Field | Value |
|---|---|
| Branch | `main` |
| Last commit at smoke time | this PR (pre-commit; verified against working tree) |
| Vitest baseline | **505/505 pass** (495 prior + 10 new on this branch) |
| Basketball build | clean (`npm --prefix basketball run build` → 3.37s, only pre-existing chunk-size warnings) |
| Type check | pre-existing breakage in `basketball/src/utils/culture_pilot_review.ts` confirmed against `origin/main` (zero diff vs main on that file — not introduced by this PR) |
| Outcome | **PASS** on both cases |

Smoke verified against production Supabase via service-role REST (read for case 1, write+cleanup for case 2).

## Case 1 — legacy fallback (real production data)

**Goal:** confirm pre-existing challenges return `sender_resolved: false` with `reason: "legacy_pre_h2h_capture"`.

**Method:** queried the 10 most recent rows from `shared_challenges`. For each, looked up `hand_log` by `hand_id` (the endpoint's query pattern). Inspected `final_roster` shape.

**Result:** all 10 challenges route to legacy fallback.

```
10/10 recent challenges → sender_resolved: false, reason: "legacy_pre_h2h_capture"
  Cause distribution:
    - All 10: no matching hand_log row at all (cause: pre-fix
      handId-mismatch bug in ChallengeSharePrompt.tsx:120 — fixed
      in this PR by threading the audit handId).
```

**Additional probe** — across the entire `hand_log` table:

```
Total hand_log rows: 1176
Rows with final_roster non-NULL: 20
  ...of which, sampled 5: all carry JSON-encoded STRINGS in
  final_roster (not arrays), all from id range 38-45 dated
  2026-04-14/15, sport=NULL season=NULL. Likely an experimental
  write path that double-stringified.
```

The 20 stringly-typed rows are why the endpoint adds an `Array.isArray` guard. Without it, the endpoint would return `sender_resolved:true` with malformed `sender.cards` for those 20 rows.

## Case 2 — happy path (synthetic row pair against production query pattern)

**Goal:** confirm a properly-written `hand_log` row + matching `shared_challenges` row returns `sender_resolved: true` with valid card data.

**Method:** the new code path can't run from this session (no deployed preview). To verify the production data shape would round-trip cleanly through the endpoint's query, the smoke insert a synthetic row pair, runs the endpoint's exact query pattern via REST against it, asserts response shape, and cleans up. Try/finally guarantees cleanup runs even on failure.

- **Synthetic input shape:** matches what `serializeResolvedRoster` would produce for a 2-card mixed-held/swapped roster. Includes `wasHeld`, `actualFp`, `achievements`, `gameInfo`, `statLine` per card.
- **Real auth user UUID** (pulled live from `hand_log`) used to satisfy the FK constraint.
- **Marker hand_id**: `smoke-test-h2h-phase1-<timestamp>` so cleanup is trivially identifiable.

**Result:**

```
Step 1: inserting synthetic hand_log row
  ✓ inserted (hand_id=smoke-test-h2h-phase1-1779744122450)
Step 2: inserting synthetic shared_challenges row
  ✓ inserted (challenge_id=0064a1e9-fcf1-4369-b460-ae9031b1a4ef)
Step 3: simulating endpoint query pattern
  ✓ challenge.hand_id = smoke-test-h2h-phase1-1779744122450
  ✓ hand_log row found: fp=80.7 tier=ROOKIE
  ✓ final_roster type: array of 2

=== HAPPY-PATH endpoint response ===
  sender_resolved: true
  sender.handId: smoke-test-h2h-phase1-1779744122450
  sender.totalFp: 80.7 (type=number)
  sender.tier: ROOKIE
  sender.cards: array of 2
    cards[0]: name=Allen Iverson wasHeld=true actualFp=52.3 achievements=1
    cards[1]: name=Tim Duncan wasHeld=false actualFp=28.4 achievements=0
  ✓ All assertions hold. Data is sufficient to populate H2H reveal arc's sender column.

Step 4: cleanup
  shared_challenges delete: 200 ✓
  hand_log delete: 200 ✓
  verify: shared_challenges count=0 hand_log count=0
  ✓ no smoke residue in production
```

The endpoint's documented contract holds: `wasHeld`, `actualFp`, `achievements`, per-card `statLine`, `gameInfo` all survive the JSONB round-trip exactly as the H2H reveal arc client will need them.

## What the smoke could not verify (deferred to phase 2+ smoke)

- **End-to-end UI flow.** The endpoint hasn't been called from a deployed Vercel preview. Case 2's "synthetic row pair through endpoint query pattern" is the best stand-in available from a Code session. Once a preview deploys, a real new challenge → real fetch from the deployed endpoint → real shape verification can happen.
- **`logHandToDb` write path under real production load.** The integration test confirms the picker output shape; the smoke confirms the resulting JSONB round-trips. But a real played hand under the modified `_useSharedGameState.ts` write path hasn't run — would surface anything the unit tests miss (e.g., the GeneratedCard shape in production differing from `shared/types/index.ts`).
- **ChallengeSharePrompt handId prop wiring** in flight. Same as above — needs a preview deploy with a real challenge create.

Phase 2's first session should run a real-deploy smoke to close those three before any UI work depends on the data path.

## Anomalies surfaced + handled

1. **`final_roster` stringly-typed rows.** 20 production rows from April 14-15 carry a JSON-encoded string rather than an array. Endpoint adds `Array.isArray` guard to route these to legacy fallback. Verified by unit test and the production probe.
2. **handId mismatch between `ChallengeSharePrompt` and `logHandToDb`.** Pre-fix, every challenge ever created had a `shared_challenges.hand_id` that didn't match any `hand_log.hand_id`. Fixed by threading `currentHandIdRef` from `_useSharedGameState` through `GameView` to a new `handId` prop on `ChallengeSharePrompt`. Verified by inspection of code path; the resulting end-to-end behavior under a real deploy remains a phase 2 smoke target.

## Followups carried forward

Captured in `docs/h2h-reveal-arc-design.md` "Followups parked from this work":
- hand_log row-size growth watch (~6KB per row from this PR forward)
- `resolve_hand` RPC remains dormant
- `verified` flag is client-asserted
- `scores` JSONB intentionally NULL in phase 1

## Status: PASS

Both smoke cases passed. Phase 1 ready to commit. UI consumption (phase 2+) is unblocked from a data-availability standpoint — the new write path + endpoint will deliver the data; the legacy fallback flag tells the client when to fall back to the existing comparison sheet.
