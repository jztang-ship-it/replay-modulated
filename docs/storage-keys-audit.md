# localStorage Key Audit — basketball + baseball GameViews

Generated: 2026-04-28  
Branch: `phase-2/01-helpers-+-audit`  
Scope: every `localStorage.getItem` / `localStorage.setItem` call in  
`basketball/src/views/GameView.tsx` and `baseball/src/views/GameView.tsx`.

---

## Section 1: Cross-sport-shared keys

These keys appear in **both** sports with the **same string literal**.

> **Status update (fix/baseball-stale-win):** the namespace mechanism on
> `GameAdapter.localStorageNamespace` is now live and split:
> baseball uses `"baseball"`, basketball stays at `""` (back-compat —
> existing basketball users keep all their localStorage state). The
> sport-private keys below now route through `nsKey()` and so live in
> a per-sport namespace on baseball, while a deliberate subset stays
> raw (cross-sport) — see Section 1a.

### 1a. Sport-scoped after fix/baseball-stale-win

These previously cross-sport keys are now sport-scoped. Basketball reads
the unprefixed key (namespace = `""`); baseball reads `baseball_<key>`.

| Key | Purpose | Why scoped |
|-----|---------|-----------|
| `replaymod_streak` | Current win streak | A streak in basketball must NOT light up baseball's streak hook on a fresh baseball play |
| `rm_best_hand` | All-time best single hand FP | "Best hand ever" is a per-sport stat — basketball's 250 FP isn't a baseball stat |
| `rm_best_tier` | Best win tier achieved | Same as above |

### 1b. Intentionally cross-sport (raw keys)

These stay unprefixed — they represent the player, not a sport-specific
score. Wallet stays cross-sport (one wallet, one player); device-global
flags don't fork per sport.

| Key | Purpose |
|-----|---------|
| `replaymod_balance` | Persistent coin wallet — single wallet, both sports |
| `replaymod_hand_count` | Total hands played across all sports — analytics-grade, also read by AuthProvider / useGameAnalytics where there's no sport adapter |
| `rm_on_board_today` | "1" if player is in top-10 of any daily LB → trophy glow |
| `replaymod_name_prompted` | One-shot gate — shown nickname prompt once |
| `replaymod_legend_seen_date` | Date string — prevents repeat legend overlay same day |
| `rm_auth_modal_shown` | One-shot gate — register modal shown once |
| `replaymod_streak_nudge_seen_${tier}` | "Have we taught this streak mechanic" one-shot — sport-agnostic concept |

---

## Section 2: Already sport-scoped keys

These keys already use different string literals per sport.

| Key (basketball) | Key (baseball) | Purpose |
|-----------------|----------------|---------|
| `replaymod_ftue_basketball` | `replaymod_ftue_baseball` | FTUE completion flag | 
| `replaymod_pregame_intro_basketball` | `replaymod_pregame_intro_baseball` | Pregame intro seen flag |
| `rm_usher_rookie_first_win` | `rm_usher_rookie_first_win_bb` | First-win usher one-shot |
| `rm_chad_last_hand` | `rm_chad_last_hand_bb` | Hand number of last Chad message fired |
| `rm_usher_lb_shown` | `rm_usher_lb_shown_bb` | Leaderboard intro usher one-shot |

Basketball-only keys (no baseball equivalent in GameView):
- `replaymod_lb_nudge_shown` — one-shot nudge after 3 hands (basketball lines 906–907)
- `rm_session_count` — per-session hand counter for analytics (basketball lines 563, 572)

---

## Section 3: Sport-agnostic / identity keys

These are read from (or written to) shared utilities — not directly keyed in GameView, but referenced via leaderboard and identity helpers that GameView calls.

| Key | Owner utility | Purpose |
|-----|--------------|---------|
| `rm_session_id` | `shared/utils/playerIdentity.ts` (line 32–35) | Anonymous session identifier |
| `rm_whisper_intro_count` | `shared/utils/leaderboardContext.ts` (line 87, 93) | Fire count for leaderboard whisper T1 (max 3) |
| `rm_ever_on_board` | `shared/utils/leaderboardContext.ts` (line 88, 126) | Set once user has ever been on LB |
| `rm_last_rank` | `shared/utils/leaderboardContext.ts` (lines 127, 135, 144, 148) | Last known LB rank for T3 detection |

---

## tierFromSalary divergence (baseball salary >= 73)

Per step 3 of the Phase 2/01 plan, baseball player data was checked for cards
with `salary >= 73` (the new RED threshold from basketball's version).

```
baseball max salary: 73, count >= 73: 1
```

**The one player:** Tarik Skubal (id: `669373`, team: Detroit Tigers, position: P, salary: 73, tier: "RED")

**Why this is dead-but-harmless:**  
`tierFromSalary` is only a fallback inside `toRevealableCards`, called when the
card's `tier` field is missing or not a recognised tier string. Tarik Skubal
already carries `tier: "RED"` in `players.json`, so `VALID_TIERS.has("RED")` is
`true` and `tierFromSalary` is never invoked for him.  
Result: no runtime behaviour change. The new RED branch in the shared
`tierFromSalary` is dead code for baseball today.
