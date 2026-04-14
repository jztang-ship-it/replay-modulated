# Server-Side Hand Resolution v2 — Rebuild Plan

**Why v2:** The v1 implementation was built against the old V1 prototype (`src/`) which had a completely different game: 5 players, $15 cap, 12 badges, no positions. The actual game (`basketball/` + `shared/`) has 6 players, $250 cap, 19 badges, position-labeled slots, tier-biased log sampling, daily bonus, and negative badges.

**Goal:** Server-owned deal/draw with the correct game logic. Same architecture as v1 (two endpoints, KV atomic consume, Supabase RPC), rewritten game logic.

---

## Pre-Flight: What We're Keeping vs Discarding

### KEEP from v1 (sport-agnostic infrastructure)
- `api/lib/auth.js` — JWT verification (correct, generic)
- `api/lib/kv.js` + `api/__tests__/kv.test.js` — atomic GETDEL, idempotency, pending hand (correct)
- `api/lib/supabaseServer.js` — service role client (correct)
- `.env.example` — env var docs (correct)
- `vitest.config.js` — test config (extend to new paths)
- Endpoint structure: `POST /api/hand/deal`, `POST /api/hand/draw`
- Design docs: `docs/superpowers/specs/` and `docs/superpowers/plans/`

### DISCARD from v1 (wrong game logic)
- `api/lib/scoring.js` — wrong formula (5 players, 12 badges, tov×-0.5, reb×1.25)
- `api/lib/dealer.js` — wrong cap ($15), wrong roster (5), no positions, no tier-biased sampling
- `api/lib/protection.js` — wrong candidate count (5-player variance)
- `api/lib/ftue.js` — wrong roster (5 players, wrong IDs, not the Tatum hand)
- `api/hand/deal.js` — 5-player assumptions throughout
- `api/hand/draw.js` — 5-player scoring, wrong RPC params
- `api/__tests__/scoring.test.js` — tests for wrong formula
- `api/__tests__/dealer.test.js` — tests for wrong dealer
- `api/__tests__/protection.test.js` — tests for wrong thresholds
- All `src/` files — V1 prototype, delete entirely

### ALREADY EXISTS on `working` (don't duplicate)
- `supabase/migrations/001_player_tables.sql` — player_state + hand_log already exist
- `api/leaderboard.ts` — proper TS version with 7 metrics, KV, JWT
- `vitest.config.ts` — existing test config for router tests
- `basketball/src/adapters/ftueRoster.ts` — the real FTUE (Tatum hand, fully scripted)

---

## The Correct Game Constants (from basketballConfig.ts)

| Parameter | Value |
|-----------|-------|
| Roster size | **6** (PG/SG/SF/PF/C/FLEX) |
| Salary cap | **$250** |
| Min spend | **$244** |
| Starting balance | **$100,000** |
| Base bet | **$10** |
| FP weights | pts×1.0, reb×1.2, ast×1.5, stl×2.0, blk×2.0, tov×**-1.0** |
| FP floor | **clamped to 0** (negative FP not possible) |

### All 19 Badges

| Badge | FP | Condition | Category rule |
|-------|----|-----------|---------------|
| GOD_MODE | +10 | pts >= 50 | Scoring (highest only) |
| FIRE | +5 | 40 <= pts < 50 | Scoring |
| BUCKET | +2 | 30 <= pts < 40 | Scoring |
| BEAST | +5 | reb >= 15 | Rebounds (highest only) |
| GLASS | +3 | 10 <= reb < 15 | Rebounds |
| WIZARD | +5 | ast >= 15 | Assists (highest only) |
| DIME | +3 | 10 <= ast < 15 | Assists |
| THIEF | +4 | stl >= 5 | Steals (highest only) |
| PICKPOCKET | +2 | 3 <= stl < 5 | Steals |
| SWAT | +4 | blk >= 5 | Blocks (highest only) |
| REJECTION | +2 | 3 <= blk < 5 | Blocks |
| MAESTRO | +8 | ast >= 10 AND tov == 0 | Efficiency (highest only) |
| PURE | +3 | ast >= 5 AND tov == 0 | Efficiency |
| SLOPPY | **-3** | 4 <= tov < 6 | Negative (highest only) |
| TURNOVER_MACHINE | **-6** | tov >= 6 | Negative |
| QUAD_DBL | +30 | 4+ stats >= 10 | Milestones (highest only) |
| 5X5 | +15 | all 5 stats >= 5 | Milestones (independent) |
| TRIPLE_DBL | +8 | 3+ stats >= 10 | Milestones |
| DOUBLE_DBL | +2 | 2+ stats >= 10 | Milestones |

### Win Tiers
| Tier | Min FP | Multiplier |
|------|--------|-----------|
| BUST | < 190 | 0x |
| ROOKIE | 190 | 0.5x |
| STARTER | 205 | 1.5x |
| ALL_STAR | 225 | 3x |
| MVP | 235 | 8x |
| LEGEND | 255 | 50x |

### Streak Multiplier (payout layer ONLY, never modifies FP or tier)
| Wins | Multiplier |
|------|-----------|
| 0-2 | 1.0x |
| 3-4 | 1.2x |
| 5-9 | 1.5x |
| 10+ | 2.0x |

### Salary Tiers (for log sampling bias)
| Tier | Salary | Log window (sorted best→worst) |
|------|--------|------|
| RED | >= $73 | Top 40% |
| ORANGE | >= $58 | Top 40% |
| PURPLE | >= $44 | Top 55% |
| BLUE | >= $30 | Middle 20-70% |
| GREEN | >= $23 | 30-80% |
| WHITE | < $23 | Bottom 40-100% |

---

## Step-by-Step Plan

### Step 1: Create clean branch

```
git checkout working
git checkout -b feature/server-side-hand-resolution-v2
```

### Step 2: Delete V1 prototype

Remove `src/` entirely. This is the shadow code that caused the v1 mistake.

```
rm -rf src/
git add -A src/
git commit -m "chore: remove V1 prototype (src/) — replaced by basketball/ + shared/"
```

### Step 3: Port infrastructure from v1

Cherry-pick or copy these files from the v1 branch (they're sport-agnostic and correct):

- `api/lib/auth.js` → keep as-is
- `api/lib/kv.js` → keep as-is
- `api/lib/supabaseServer.js` → keep as-is
- `api/__tests__/kv.test.js` → keep as-is
- `.env.example` → keep as-is

Update existing `vitest.config.ts` to include both test paths:
```ts
include: ['api/_lib/**/__tests__/**/*.test.ts', 'api/__tests__/**/*.test.{js,ts}']
```

Install `@vercel/kv` if not already in basketball's dependencies.

### Step 4: Extend database schema

Create `supabase/migrations/002_server_side_extension.sql`:

```sql
-- Extend player_state (table already exists from 001_player_tables.sql)
-- Existing columns: id (uuid PK), balance (integer), streak (integer), hands_played (integer), updated_at
ALTER TABLE player_state ADD COLUMN IF NOT EXISTS ftue_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE player_state ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_state ADD COLUMN IF NOT EXISTS last_credit_claim TIMESTAMPTZ;

-- Extend hand_log (table already exists)
-- Existing columns: id (bigint PK), player_id (uuid FK), roster_ids (text[]), total_fp, tier, payout, streak_at_play, verified, created_at
ALTER TABLE hand_log ADD COLUMN IF NOT EXISTS streak_multiplier NUMERIC(3,1) NOT NULL DEFAULT 1.0;
ALTER TABLE hand_log ADD COLUMN IF NOT EXISTS is_ftue BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hand_log ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hand_log ADD COLUMN IF NOT EXISTS seed TEXT;
ALTER TABLE hand_log ADD COLUMN IF NOT EXISTS hand_id TEXT;
ALTER TABLE hand_log ADD COLUMN IF NOT EXISTS bet_amount INTEGER NOT NULL DEFAULT 10;
ALTER TABLE hand_log ADD COLUMN IF NOT EXISTS final_roster JSONB;
ALTER TABLE hand_log ADD COLUMN IF NOT EXISTS scores JSONB;

-- resolve_hand RPC (new)
-- Inputs match existing column conventions (id not user_id, hands_played not hand_count, balance as integer)
CREATE OR REPLACE FUNCTION resolve_hand(
  p_user_id UUID,
  p_hand_id TEXT,
  p_bet_amount INTEGER,
  p_base_payout INTEGER,
  p_is_win BOOLEAN,
  p_roster_ids TEXT[],
  p_final_roster JSONB,
  p_scores JSONB,
  p_total_fp NUMERIC(6,1),
  p_tier TEXT,
  p_seed TEXT,
  p_is_ftue BOOLEAN,
  p_is_protected BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state player_state%ROWTYPE;
  v_new_balance INTEGER;
  v_new_streak INTEGER;
  v_streak_multiplier NUMERIC;
  v_final_payout INTEGER;
  v_new_hands_played INTEGER;
BEGIN
  -- Lock row
  SELECT * INTO v_state FROM player_state WHERE id = p_user_id FOR UPDATE;

  -- Initialize if first time
  IF NOT FOUND THEN
    INSERT INTO player_state (id) VALUES (p_user_id);
    SELECT * INTO v_state FROM player_state WHERE id = p_user_id FOR UPDATE;
  END IF;

  -- Streak: win = STARTER or above
  v_new_streak := CASE WHEN p_is_win THEN v_state.streak + 1 ELSE 0 END;

  -- Streak multiplier (payout layer only, never affects FP or tier)
  v_streak_multiplier := CASE
    WHEN v_new_streak >= 10 THEN 2.0
    WHEN v_new_streak >= 5 THEN 1.5
    WHEN v_new_streak >= 3 THEN 1.2
    ELSE 1.0
  END;

  v_final_payout := FLOOR(p_base_payout * v_streak_multiplier);
  v_new_balance := v_state.balance + v_final_payout - p_bet_amount;
  v_new_hands_played := v_state.hands_played + 1;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE player_state SET
    balance = v_new_balance,
    streak = v_new_streak,
    hands_played = v_new_hands_played,
    ftue_completed = CASE WHEN p_is_ftue THEN TRUE ELSE v_state.ftue_completed END,
    xp = v_state.xp + CASE WHEN p_is_win THEN 30 ELSE 10 END,
    updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO hand_log (
    player_id, hand_id, bet_amount, roster_ids, final_roster, scores,
    total_fp, tier, payout, streak_at_play, streak_multiplier,
    seed, is_ftue, is_protected, verified
  ) VALUES (
    p_user_id, p_hand_id, p_bet_amount, p_roster_ids, p_final_roster, p_scores,
    p_total_fp, p_tier, v_final_payout, v_new_streak, v_streak_multiplier,
    p_seed, p_is_ftue, p_is_protected, TRUE
  );

  RETURN json_build_object(
    'balance', v_new_balance,
    'streak', v_new_streak,
    'streakMultiplier', v_streak_multiplier,
    'finalPayout', v_final_payout,
    'handsPlayed', v_new_hands_played,
    'xp', v_state.xp + CASE WHEN p_is_win THEN 30 ELSE 10 END
  );
END;
$$;
```

Do NOT rename or restructure existing columns. Existing `001_player_tables.sql` uses:
- `id` (not `user_id`) as PK
- `hands_played` (not `hand_count`)
- `balance` as integer (not numeric)

Match those conventions.

### Step 5: Rewrite scoring module (`api/lib/scoring.js`)

Port from `basketball/src/adapters/SportAdapter.ts` + `basketballConfig.ts`.

Key differences from v1:
- **19 badges** (not 12) — includes PICKPOCKET, REJECTION, MAESTRO, PURE, SLOPPY(-3), TURNOVER_MACHINE(-6)
- **reb × 1.2** (not 1.25)
- **tov × -1.0** (not -0.5)
- **FP clamped to 0 minimum** (Math.max(0, baseFP))
- **GLASS threshold: reb >= 10** (not 12)
- **QUAD bonus: +30** (not +50)
- Badge dedup: one badge per category (scoring, rebounds, assists, steals, blocks, efficiency, negative, milestones). 5X5 is independent.

Tests must cover all 19 badges including negative ones.

### Step 6: Build engine adapter layer (`api/lib/engineAdapter.js`)

This is the bridge between client engines and server API format:

- `buildEvalPool(players, logs)` — convert DB rows into PlayerEval format matching rosterEngine expectations
- `buildResolveConfig()` — create ResolveConfig with fpScale=1, daily bonus map
- `buildRosterConfig()` — create RosterConfig with 6 slots, slot requirements
- `buildEconomyConfig()` — create EconomyConfig with $250 cap, tier thresholds
- `pickBiasedLog(playerId, tier, logs, rnd)` — server-side log sampling matching resolveEngine's bias windows

This layer ensures the server uses identical logic to the client without duplicating the engine code's internals.

### Step 7: Rewrite dealer module (`api/lib/dealer.js`)

Port from `shared/engines/rosterEngine.ts`:

Key differences from v1:
- **6 slots** (not 5)
- **$250 cap, $244 min spend** (not $15/$14.70)
- **Position-agnostic**: positions are display metadata only, no slot enforcement. Any player can fill any slot. The client labels slots PG/SG/SF/PF/C/FLEX for visual layout but the server does not validate this.
- **Tier-based anchor**: at least 1 ORANGE+ player (or 2 PURPLE if no ORANGE available)
- **Weighted random**: salary² weighting (not uniform random)
- **guaranteeTierFloor**: ensures minimum roster quality (anchor + min spend)
- **enforceCapWithReplacement**: 2-pass cap enforcement (downgrade non-premium first, then force-downgrade)
- **Biased log sampling**: RED/ORANGE get top 40%, WHITE gets bottom 60%

For draw: held cards stay (locked salary), non-held slots refilled within remaining budget. No position validation on replacements.

### Step 8: Rewrite protection module (`api/lib/protection.js`)

Retune for 6-player variance. **These floors are provisional** — tune after testing actual distribution with 6-player hands.

| Hand range | Level | Floor FP (provisional) | Max candidates |
|------------|-------|------------------------|----------------|
| 2-5 | Strong | ~210 (mid-STARTER) | 6 |
| 6-15 | Moderate | ~200 | 4 |
| 16-30 | Light | ~192 (just above BUST) | 3 |
| 31+ | None | — | 1 |

Floors are slightly higher than v1 because 6 players produce higher average FP. Candidate counts are slightly lower because each candidate requires 6 game log fetches. **Run the simulator after implementation to validate these produce the intended ~20% bust-avoidance for early users without making wins feel artificial.**

### Step 9: FTUE module (`api/lib/ftue.js`)

Port from `basketball/src/adapters/ftueRoster.ts`. The FTUE is already fully scripted:

**Deal hand (6 cards, $245):**
0. LaMelo Ball — ORANGE $58 PG — 36.4 FP (BUCKET, SLOPPY)
1. Jaylen Brown — PURPLE $53 SG — 33.1 FP
2. **Jayson Tatum — ORANGE $66 SF — 92.0 FP** (FIRE, BEAST, DIME, SLOPPY, TRIPLE_DBL, DOUBLE_DBL) ← HOLD
3. Klay Thompson — BLUE $33 SG — 10.6 FP (cold)
4. Sam Merrill — WHITE $21 SG — 19.4 FP
5. Maxi Kleber — WHITE $14 PF — 1.2 FP (cold)

**Draw hand (Tatum held + 5 new, $248):**
0. Steph Curry — PURPLE $57 PG — 52.0 FP (DIME, DOUBLE_DBL)
1. OG Anunoby — PURPLE $46 SF — 39.6 FP (PICKPOCKET)
2. Tatum (HELD) — 92.0 FP
3. Draymond Green — BLUE $43 PF — 9.5 FP (cold)
4. Kyle Lowry — WHITE $20 PG — 18.9 FP (PURE)
5. Cam Reddish — WHITE $16 SF — 12.1 FP (cold)

**Total: 224.1 FP → STARTER (0.9 short of ALL_STAR)**

The server FTUE module stores exact stat lines and badges, not just player/log IDs. This makes it fully deterministic regardless of database state.

### Step 10: Rewrite deal endpoint (`api/hand/deal.js`)

Same flow as v1 but:
- 6-card hands
- KV hand object has 6 roster entries + `seed` + `consumed` + `mode` + `debug` fields
- FTUE returns full stat lines from ftueRoster.ts port (not log IDs to look up)
- Protected mode generates 6-player candidates
- Position-agnostic (positions are metadata, no slot enforcement)
- If user already has a pending hand: **reject with error** (not last-write-wins)
- Balance floor enforcement
- Server-side logging: userId, mode, bet, candidate count

### Step 11: Rewrite draw endpoint (`api/hand/draw.js`)

Same flow as v1 but:
- 6-card resolution
- Replacement cards: position-agnostic, budget-constrained
- Biased log sampling (tier-dependent windows)
- Daily bonus applied: +20/+10/+5 FP for 3 daily players (deterministic by UTC date, same selection as client's `shared/utils/dailyBonus.ts`). Additive on top of FP. Does NOT affect MVP determination (MVP uses base FP + badges, excluding daily bonus).
- All 19 badges including negative ones (SLOPPY -3, TURNOVER_MACHINE -6)
- Payout breakdown in response: basePayout, streakMultiplier, finalPayout, netGain
- `finalRoster` array in response for client swap animation
- `mode` field in response for analytics
- KV failure protection (try/catch, fail fast — never proceed without KV integrity)
- Streak multiplier applied to PAYOUT only (never FP or tier)
- Server logging: userId, handId, totalFp, tier, payout, streak
- Leaderboard fire-and-forget (no await, wrapped in try/catch)

### Step 12: Wire into GameView.tsx

Replace client-side resolve with server API calls:
- Deal phase → `POST /api/hand/deal`
- Draw phase → `POST /api/hand/draw`
- Animation driven by server reveal payload
- Remove all local FP calculation, payout logic, balance mutation
- Balance/streak from server response is authoritative

### Step 13: Test and validate

- All unit tests pass (vitest)
- Build passes (basketball app)
- Manual test: full deal → hold → draw → reveal cycle
- Verify FTUE produces exactly 224.1 FP
- Verify DB state: player_state, hand_log written correctly
- Verify streak multiplier applies to payout only

---

## KV Hand Object (v2)

```json
{
  "version": 2,
  "handId": "uuid",
  "userId": "uuid",
  "betMultiplier": 1,
  "betAmount": 10,
  "createdAt": "ISO",
  "expiresAt": "ISO",
  "seed": "uuid",
  "debug": false,
  "consumed": false,
  "isFtue": false,
  "isProtected": false,
  "protectionLevel": null,
  "mode": "NORMAL",
  "roster": [
    { "playerId": "...", "name": "...", "team": "...", "position": "PG", "salary": 57, "tier": "PURPLE", "logData": { ... } },
    ... 6 entries
  ]
}
```

- `consumed`: safety flag for debugging/audit (GETDEL is the real guard)
- `mode`: "FTUE" | "PROTECTED" | "NORMAL" — for analytics/debugging, never exposed in UI
- `logData`: pre-selected game stats (from biased sampling at deal time). Draw uses these deterministically — no re-randomization.

## Draw Response (v2)

```json
{
  "version": "v2",
  "handId": "uuid",
  "serverTimestamp": "ISO",
  "mode": "NORMAL",
  "summary": {
    "totalFp": 224.1,
    "tier": "STARTER",
    "tierColor": "#22c55e",
    "betAmount": 10,
    "basePayout": 15,
    "streakCount": 3,
    "streakMultiplier": 1.2,
    "finalPayout": 18,
    "netGain": 8,
    "newBalance": 100008,
    "isWin": true
  },
  "finalRoster": ["playerId1", "playerId2", "playerId3", "playerId4", "playerId5", "playerId6"],
  "cards": [
    {
      "slot": 0,
      "position": "PG",
      "wasHeld": false,
      "player": { "playerId": "...", "name": "...", "team": "...", "salary": 57, "tier": "PURPLE" },
      "stats": { "pts": 26, "reb": 5, "ast": 10, "stl": 1, "blk": 0, "turnovers": 2, "min": 35, "gameDate": "...", "matchup": "..." },
      "fp": 52.0,
      "dailyBonus": 0,
      "badges": [{ "id": "DIME", "icon": "🧠", "label": "Dime", "fp": 3 }]
    },
    "... 6 cards total"
  ],
  "commentary": {
    "tierName": "STARTER",
    "totalFp": 224.1,
    "topScorer": { "name": "Jayson Tatum", "fp": 92.0 },
    "badgeCount": 8,
    "nearMiss": { "nextTier": "ALL_STAR", "gap": 0.9 }
  }
}
```

- `mode`: "FTUE" | "PROTECTED" | "NORMAL" — for analytics/debugging, not exposed in UI
- `finalRoster`: ordered array of player IDs post-draw, so client can diff deal vs draw for swap animation
- `tier`: STARTER (224.1 < 225), NOT ALL_STAR
- `nearMiss`: ALL_STAR at 0.9 gap (the near-miss hook)
- `basePayout`: 10 × 1.5 = 15 (STARTER multiplier)
- `finalPayout`: 15 × 1.2 = 18 (with streak multiplier)
- Streak multiplier applied to PAYOUT only — FP and tier are unaffected
```
