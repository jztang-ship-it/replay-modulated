# PostHog Dashboard Starter Pack (ReplayMod)

This starter pack is built for the event schema already emitted by `shared/analytics/analytics.ts` and `shared/analytics/useGameAnalytics.ts`.

Event naming pattern:
- `{product}/{feature}/{action}`
- Example: `basketball/gameplay/hand_resolved`

Common properties available:
- `product`, `feature`, `action`
- `platform`, `app_version`
- `score`, `tier`, `bust`, `badgeCount`, `duration_ms`
- `rosterCost`, `playerCount`
- `currentFp`, `nextTierFp`, `gapFp`
- `$session_id`

---

## 0) Dashboard Setup

Create one dashboard named:
- `ReplayMod - Core Gameplay Health`

Add global filters:
- `product = basketball` (duplicate dashboard per product if needed)
- Date range: `Last 14 days`

---

## 1) KPI Row (Top 6)

Add as "Single value" insights:

1. **DAU (players)**
   - Event: `basketball/system/app_opened`
   - Aggregation: `Unique users`

2. **Hands Played**
   - Event: `basketball/gameplay/hand_dealt`
   - Aggregation: `Total count`

3. **Hands Resolved**
   - Event: `basketball/gameplay/hand_resolved`
   - Aggregation: `Total count`

4. **Bust Rate**
   - Event: `basketball/gameplay/hand_resolved`
   - Filter: `bust = true`
   - Aggregation: `% of total` vs all `hand_resolved`

5. **Avg Score**
   - Event: `basketball/gameplay/hand_resolved`
   - Aggregation: `Average of property`
   - Property: `score`

6. **So-Close Rate**
   - Numerator: `basketball/gameplay/so_close`
   - Denominator: `basketball/gameplay/hand_resolved`
   - Use formula insight: `A / B`

---

## 2) Funnel: Core Hand Completion

Insight type: `Funnels`

Steps:
1. `basketball/system/app_opened`
2. `basketball/gameplay/hand_dealt`
3. `basketball/gameplay/hand_resolved`

Breakdown:
- by `platform`

Use this to watch onboarding friction and reveal flow failures.

---

## 3) Score Distribution Trend

Insight type: `Trends`

- Event: `basketball/gameplay/hand_resolved`
- Y axis: `Percentile of property`
- Property: `score`
- Series: P50, P75, P90

Why: quickly catches gameplay/economy drift after tuning.

---

## 4) Tier Outcome Mix

Insight type: `Trends` (or `Pie`)

- Event: `basketball/gameplay/hand_resolved`
- Breakdown: `tier`
- Aggregation: `Count`

Why: sanity check payout distribution against design targets.

---

## 5) Near-Miss Pressure (Psych Trigger Quality)

### A) So-Close by Gap Bucket

Create insight on event:
- `basketball/gameplay/so_close`
- Breakdown: `gapFp`

Then bucket values in UI (or create multiple filtered series):
- `0-1`
- `1-2.5`
- `2.5-5`

### B) Near-Miss to Next Hand Conversion

Funnel:
1. `basketball/gameplay/so_close`
2. `basketball/gameplay/hand_dealt` (within 10 minutes)

Why: measures if "almost won" drives replay intent.

---

## 6) Session Quality

From event: `basketball/gameplay/session_end`

Add 3 trends:
- Average `handsPlayed`
- Average `duration_ms`
- Average `totalScore`

Breakdown by:
- `platform`
- `app_version`

---

## 7) FTUE vs Non-FTUE Monitoring (Optional Next)

If you add `is_ftue` property to key events, create:
- Bust rate by `is_ftue`
- Hand resolved score percentiles by `is_ftue`
- So-close rate by `is_ftue`

This is useful for validating tutorial changes and progression pacing.

---

## 8) Suggested Alerts

Use PostHog dashboard thresholds/alerts:

1. **Hand completion drop**
   - Alert if funnel step `hand_dealt -> hand_resolved` drops > 15% day-over-day.

2. **Bust spike**
   - Alert if bust rate > expected baseline + 10%.

3. **So-close collapse**
   - Alert if so-close rate falls by > 30% (psych trigger may be broken).

---

## 9) Naming Conventions for New Events

Keep using:
- `{product}/{feature}/{action}`

Examples:
- `basketball/gameplay/reveal_skipped`
- `basketball/onboarding/ftue_completed`
- `basketball/settings/sfx_toggled`

Keep properties flat and scalar where possible for clean PostHog filtering.

---

## 10) Fast Build Order (15-20 min)

1. KPI row (6 cards)
2. Core funnel
3. Tier mix
4. Score percentiles
5. So-close conversion funnel
6. Session quality trends

This gives you immediate visibility into retention levers and balance quality.
