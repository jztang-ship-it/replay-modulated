# localStorage Key Audit — basketball + baseball GameViews

Generated: 2026-04-28  
Branch: `phase-2/01-helpers-+-audit`  
Scope: every `localStorage.getItem` / `localStorage.setItem` call in  
`basketball/src/views/GameView.tsx` and `baseball/src/views/GameView.tsx`.

---

## Section 1: Cross-sport-shared keys

These keys appear in **both** sports with the **same string literal**.

> Migration note (future, not this PR): After Phase 2 consolidation these
> will wrap as `${ns}_<key>` where `ns` defaults to `""` for back-compat.
> Migration is a separate post-Phase-2 PR.

| Key | Purpose | Basketball lines | Baseball lines |
|-----|---------|-----------------|----------------|
| `replaymod_balance` | Persistent coin balance (read on mount, written after every payout) | 68, 75 | 68, 75 |
| `rm_on_board_today` | `"1"` if player is in top-10 of either daily LB → trophy glow | 208 | 117 |
| `replaymod_streak` | Current win streak (incremented on win, reset on loss) | 777, 1120, 1130 | 561, 989, 999 |
| `rm_best_hand` | All-time best single hand FP (float stored as string) | 1143, 1145 | 1009, 1011 |
| `rm_best_tier` | Best win tier ever achieved | 1148, 1151 | 1014, 1017 |
| `replaymod_hand_count` | Total hands played (increments each play) | 905, 1709, 1710 | 696, 1488, 1489 |
| `replaymod_name_prompted` | One-shot gate — shown nickname prompt once after 3 hands | 1714, 1715 | 1493, 1494 |
| `replaymod_legend_seen_date` | Date string — prevents repeat legend-tier FTUE overlay same day | 617, 2389 | 568, 2104 |
| `rm_auth_modal_shown` | One-shot gate — register modal shown once | 671, 672 | 721, 722 |

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
