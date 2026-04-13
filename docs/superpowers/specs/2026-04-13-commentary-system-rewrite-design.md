# Commentary System Rewrite — Design Spec

**Date:** 2026-04-13
**Project:** ReplayMod
**Status:** Draft — pending user review

---

## 1. Problem

The current commentary system (`buildPostRevealCopy.ts`) has structural issues that prevent it from feeling human:

- **Two-line system** — line 1 (tier reaction) and line 2 (detail) are composed independently and often compete. A win line 1 gets paired with a blame line 2.
- **Fixed tone per tier** — BUST is always deadpan, ALL_STAR is always praising. No variety across a session.
- **No causal logic** — the message doesn't clearly answer "why did I win/lose?" It reacts to the tier, then bolts on a detail. The detail often has nothing to do with the tier reaction.
- **Near-miss dominates** — near-miss currently takes over line 1, making a win feel like a loss.
- **No smartass/Inside the NBA voice** — the closest things are two hardcoded Easter eggs ("pillow", "churros"). No systematic culture/wry layer.
- **Redundancy** — same culture lines surface repeatedly because the priority stack short-circuits to the first match with no variety mechanism.

### What we're replacing

- `buildPostRevealCopy.ts` — the current line 1 + line 2 phrase bank system (600+ lines)
- The file stays as a fallback during development. A feature flag switches between old and new.

### What we're keeping

- `playerCulture.ts` — the culture database. Content source for culture/wry templates.
- `teamFlavor.ts` — team-specific humor/identity lines. Content source for wry tone.
- `PostRevealCopyInput` interface — same input shape, no upstream changes.
- `PostRevealCopy` output interface — same `{ primary, secondary? }` shape. The new system sets `primary` to the full unified message and leaves `secondary` undefined.
- `attributeCultureLine()` — the helper that ensures culture lines always name the player.
- `isNameable()` — RED/ORANGE/PURPLE gate for player naming.

---

## 2. Core Principle

**Every message must answer: "Why did I win or lose?"**

- Wins → who carried
- Losses → who failed

Everything else is supporting detail. One message, one causal narrative, no competing angles.

---

## 3. The Formula

Executed in strict order for every hand:

```
Step 1: REGISTER    → win or loss (from winTier, sacred, never overridden)
Step 2: INTENSITY   → how much praise or sting (from winTier + margin)
Step 3: STAR        → identify the nameable player who caused this result
Step 4: STORY       → primary cause + supporting details (probabilistic assembly)
Step 5: TONE        → weighted random roll, session-aware anti-redundancy
Step 6: COMPOSE     → select template keyed by (register, intensity, story, tone)
```

---

## 4. Register (Step 1)

| Result | Register | Non-negotiable |
|--------|----------|----------------|
| **WIN** (ROOKIE–GOAT) | Congratulatory. The user won money. | Must feel good to read. No blame, no "but", no backhanded compliments. |
| **LOSS** (BUST) | Honest. The user lost. | Must feel fair, not cruel. Acknowledge it, explain it, move on. |

The register is the emotional foundation. Every word in the message must be consistent with it. A wry comment on a win is still congratulatory. A wry comment on a loss is still honest, not vicious.

---

## 5. Intensity (Step 2)

### Wins

| Tier | Intensity | Star ratio shapes language |
|------|-----------|--------------------------|
| ROOKIE | Mild | ratio ≥ 1.35 → "did enough", ratio < 1.35 → "quiet but the roster survived" |
| STARTER (barely, margin ≤ 5) | Respectful | "Close call but the money is real" |
| STARTER (normal) | Solid | "Good hand. Professional night." |
| STARTER (dominant, margin ≥ 15) | Enthusiastic | "This hand had something extra" |
| ALL_STAR | Big praise | "This is a real one" |
| MVP | Awe | "This doesn't happen often" |
| GOAT | Historic | "Remember this one" |

### Losses

| Subtype | Trigger | Intensity |
|---------|---------|-----------|
| BUST (close) | gap ≤ 8 to ROOKIE | Sympathetic |
| BUST (mid) | gap 9–25 to ROOKIE | Matter-of-fact |
| BUST (bad) | gap > 25 to ROOKIE | Blunt |

### ROOKIE "half your money back"

ROOKIE is 0.5x payout. ~40% of ROOKIE win messages should acknowledge this reality: "Half your money back. Not the end of the world." This is a content flag, not a tone — any tone can deliver it in its own voice.

---

## 6. Star Identification (Step 3)

**80–90% of messages must prominently feature a nameable player.**

The star is always identified. The trigger threshold determines intensity of language, not whether the player is named.

| Star ratio | Win language | Loss language |
|-----------|-------------|---------------|
| ≥ 1.5 | "went off", "went nuclear" | — |
| 1.35–1.5 | "delivered", "showed up big" | — |
| 1.0–1.35 | "did his job", "solid night" | — |
| 0.75–1.0 | "quiet night but the roster held up" | "came in below the line" |
| < 0.75 | — | "never showed up", "didn't deliver" |
| < 0.65 | — | "no-showed", "the reason this hand failed" |

Star selection: highest `headlineScore` among nameable players (RED/ORANGE/PURPLE). Uses existing `headlineScore()` formula (salary × 2.5 + actualFp × 1.5 + badgeFp × 4).

If no nameable player exists on the roster (rare), fall through to `clean_win` / `everyone_flat` generic messaging. This should be <10% of hands.

### Sentence structure variety (anti-robot)

The star must always be named, but the sentence structure must NOT be rigid. "Player name + what happened + emphasis" every time sounds like a template engine. Templates must vary where the player name appears and how the causal story is structured.

**Name placement patterns (randomized per message):**

| Pattern | Example |
|---------|---------|
| Name leads | "Anthony Edwards dropped 48 on Indiana. Take your money." |
| Name mid-sentence | "Nobody was stopping Anthony Edwards tonight — 48 and counting." |
| Name after setup | "48 points against Indiana. That was all Anthony Edwards." |
| Name as punchline | "Someone had to go for 48 tonight. Ant decided it was him." |

Templates should be written across all four patterns to prevent the "Player Name did X" repetition.

### Name form variety

Player references must rotate between available name forms to sound human. A real commentator doesn't say "Anthony Edwards" five times — they say "Edwards", then "Ant", then "Anthony Edwards" for emphasis.

**Available name forms (resolved at composition time):**

| Token | Resolves to | Example |
|-------|------------|---------|
| `{name}` | Full name | "Anthony Edwards" |
| `{last}` | Last name only | "Edwards" |
| `{first}` | First name only | "Anthony" |
| `{nick}` | Primary nickname from culture DB | "Ant" |
| `{nick2}` | Secondary nickname if available | "Ant-Man" |

**Rules:**
- Full name (`{name}`) should appear in ~40% of messages — used for emphasis or when the player hasn't been mentioned recently
- Last name (`{last}`) is the most common form (~30%) — natural, how fans talk
- Nickname (`{nick}`) ~20% — adds personality, requires culture DB entry
- First name (`{first}`) ~10% — intimate, used sparingly for warmth ("Anthony had a night")
- If a player has no nicknames in the culture DB, fall back to last name
- Within a single message, never repeat the same form twice if the player is referenced more than once

---

## 6b. NBA Records & Historic Achievements Detection

### The idea

When a player's game log contains a stat line that approaches, ties, or breaks an NBA record — or when a significant career milestone is reached on that night — the commentary should recognize it. This is treated at the SAME priority level as rare badges (GOD_MODE, 5X5, QUAD_DBL). It's proof of something extraordinary, attached to the star.

### Data source: `shared/data/nbaRecords.ts`

A static lookup table of NBA single-game records and notable thresholds, web-crawled and maintained. Sport-agnostic structure so baseball records follow the same pattern.

```typescript
interface StatRecord {
  stat: string;          // "pts", "ast", "reb", "stl", "blk", "turnovers", "threes"
  record: number;        // NBA single-game record value
  holder: string;        // "Wilt Chamberlain"
  date: string;          // "1962-03-02"
  nearRecordPct: number; // 0.75 = flag at 75% of record
}

interface MilestoneThreshold {
  stat: string;          // "career_pts", "career_ast", etc.
  thresholds: number[];  // [10000, 15000, 20000, 25000, 30000]
  label: string;         // "20,000 career points"
}
```

**Example records:**

| Stat | Record | Holder | Near-record threshold (75%) |
|------|--------|--------|-----------------------------|
| Points | 100 | Wilt Chamberlain | 75 pts |
| Assists | 30 | Scott Skiles | 23 ast |
| Rebounds | 55 | Wilt Chamberlain | 41 reb |
| Steals | 11 | Multiple | 8 stl |
| Blocks | 17 | Elmore Smith | 13 blk |
| 3PM | 16 | Klay Thompson | 12 threes |

### Detection logic

At composition time, the story selector checks the star's stat line against the records table:

```
for each stat in star's statLine:
  if stat >= record        → RECORD_BROKEN (highest priority in the game)
  if stat >= nearRecordPct → NEAR_RECORD (same tier as rare badges)
```

For career milestones — these require an optional `careerStats` field on `PostRevealRosterCard` (future enhancement, when available from data source). When a player's career total + tonight's stats crosses a milestone threshold, flag it.

### Priority

| Event | Priority | How it's used |
|-------|----------|--------------|
| `record_broken` | **ABOVE rare badges** — this IS the message | "Trae Young just broke Scott Skiles' assist record. 31 assists. History." |
| `near_record` | **Same as rare badges** | Attached to star as proof. "{nick} had 24 assists tonight. The NBA record is 30. Think about that." |
| `career_milestone` | **Same as rare badges** | "{name} crossed 20,000 career points tonight. That's a different kind of night." |

### Template examples

**Record broken + hype:**
```
"{last} just broke the record. {pts} points in a single game. That's history and you had a front row seat."
```

**Near record + culture_wry:**
```
"{nick} had {ast} assists tonight. The NBA record is 30. Someone should let Scott Skiles know."
```

**Career milestone + warm:**
```
"{name} crossed 20,000 career points tonight. On a night like this, the payout is almost secondary."
```

### Data maintenance

The records table is small (~20-30 entries for basketball) and rarely changes. Web-crawl once, update manually when records are broken. Each sport gets its own records file (`nbaRecords.ts`, `mlbRecords.ts`).

---

## 7. Story Assembly (Step 4) — Star-First Causal Logic

**One main story (required) + probabilistic supporting details.**

The main story is ALWAYS the star's performance. Supporting details add context but never compete with or override the main story.

### Win — primary story is always `star_performance`

Supporting details (shuffled, each has an inclusion probability):

| Detail | Trigger | Inclusion % | Rule |
|--------|---------|-------------|------|
| `record_event` | stat ≥ record OR ≥ nearRecordPct OR career milestone | 95% | **Highest priority detail.** If a record was broken, this BECOMES the message — everything else is secondary. Near-record and milestones treated same as rare badges. |
| `rare_badge` | GOD_MODE, 5X5, QUAD_DBL, MAESTRO | 80% | Must attach to the star. "Booker went nuclear — 61 and GOD MODE." Never standalone. |
| `common_badge` | FIRE, BEAST, TRIPLE_DBL, etc. | 60% | Same — proof of the star's performance, not its own story. |
| `held_card_paid` | wasHeld + ratio ≥ 1.25 | 80% | Validates user decision. "Holding that card was the right call." |
| `high_stats` | pts ≥ 30, reb ≥ 12, ast ≥ 10 | 60% | Specific stat callout supporting the star narrative. |
| `near_miss_win` | gap ≤ 3 FP ONLY | 70% | Secondary sentence only, never lead. "You were 2 FP from MVP." |
| `streak_event` | first meaningful (2→3) OR milestone (5, 10) | 10–15% | Never lead. Heavily limited to prevent spam. |
| `culture_hit` | player has relevant culture lines | 40% | Flavor only, end of message. |

**Assembly logic:**

```
main = star_performance (REQUIRED)
details = shuffle(applicable_details)
selected = [
  main,
  details[0] if roll < its inclusion %,
  details[1] if roll < its inclusion % (max 30% chance of 2nd detail),
]
compose into single message
```

### Loss — primary story is always `star_failure`

Supporting details (shuffled, each has an inclusion probability):

| Detail | Trigger | Inclusion % | Rule |
|--------|---------|-------------|------|
| `record_event` | stat ≥ record OR ≥ nearRecordPct | 95% | Even on a loss, a record/near-record is worth mentioning. "Edwards had 25 assists and still lost. That's a different kind of pain." |
| `near_miss_loss` | gap ≤ 3 FP to ROOKIE | 80% | More frequent than win near-miss. "Almost survived it." |
| `zero_card` | any card ≤ 1.0 FP | 60% | Reinforces failure. Name if nameable, else generic. |
| `turnover_problem` | TURNOVER_MACHINE badge | 40% | NEVER primary. Just another stat shortfall. "The 6 turnovers didn't help." |
| `injury_cost` | nameable star < 15 min, < 8 FP | 70% | Context, not blame. "Left early — hard to overcome." |
| `streak_broken` | prevStreak ≥ 5 | 15% | Rare mention. |
| `culture_loss` | player has relevant loss culture | 40% | Flavor only. |

### Anti-robot rule

Do NOT include all available data. A human commentator picks ONE angle and commits. The probabilistic assembly ensures variety — same hand played twice might highlight the badge one time and the near-miss the other.

---

## 8. Tone Engine (Step 5) — Session-Aware Weighted Random

### The 6 tones

| Tone | Win delivery | Loss delivery |
|------|-------------|---------------|
| **Hype** | Genuine excitement, energy | Never used |
| **Warm** | Appreciative, "feel good" | Sympathetic, "tough one" |
| **Culture/Wry** | Player-specific + smartass, congratulatory first | Player-specific + honest humor, not cruel |
| **Observational** | Smart, specific, straight | "Here's what went wrong" |
| **Analytical** | GM/scout voice | Explains the math |
| **Deadpan** | Understated cool | "It is what it is" |

### Win weights

| Tone | ROOKIE | STARTER | ALL_STAR | MVP | GOAT |
|------|--------|---------|----------|-----|------|
| Hype | 5% | 15% | 25% | 35% | 45% |
| Warm | 20% | 20% | 20% | 15% | 15% |
| Culture/Wry | 35% | 35% | 35% | 35% | 30% |
| Observational | 20% | 15% | 15% | 10% | 5% |
| Analytical | 15% | 10% | 5% | 5% | 5% |
| Deadpan | 5% | 5% | 0% | 0% | 0% |

### Loss weights

| Tone | BUST (close) | BUST (mid) | BUST (bad) |
|------|-------------|------------|------------|
| Hype | 0% | 0% | 0% |
| Warm | 20% | 10% | 5% |
| Culture/Wry | 35% | 35% | 35% |
| Observational | 20% | 20% | 20% |
| Analytical | 10% | 10% | 10% |
| Deadpan | 15% | 25% | 30% |

### Session-aware anti-redundancy

Recent tones stored in localStorage (`rm_recent_tones`, last 5 tones). Each repeat halves that tone's weight before the roll:

- 1 recent occurrence → weight × 0.5
- 2 recent occurrences → weight × 0.25
- 3+ → weight × 0.1

Remaining weight redistributed proportionally. This makes back-to-back-to-back same-tone nearly impossible while preserving the target distribution over a session.

Tone history cleared on session start or after 30 minutes of inactivity.

---

## 9. Composition (Step 6) — Template Lookup

Templates are keyed by `(register, story, tone)` and live in a structured phrase bank.

### Template structure

```typescript
interface CommentaryTemplate {
  register: "win" | "loss";
  story: string;        // "star_went_off", "star_no_showed", etc.
  tone: string;         // "hype", "culture_wry", "warm", etc.
  templates: string[];  // pool of 3-8 alternatives per combination
}
```

Each template is a single cohesive message (1-2 sentences, ~100-200 chars) with placeholder tokens:

- `{name}` — star player full name ("Anthony Edwards")
- `{last}` — last name only ("Edwards")
- `{first}` — first name only ("Anthony")
- `{nick}` — primary nickname from culture DB ("Ant"), falls back to `{last}`
- `{nick2}` — secondary nickname if available ("Ant-Man"), falls back to `{nick}`
- `{pts}` / `{reb}` / `{ast}` — stat values
- `{opp}` — opponent phrase ("against Indiana", "in Phoenix")
- `{badge}` — badge label
- `{streak}` — streak count
- `{gap}` — FP gap to next tier

### Example templates

**Win + star_went_off + hype (varied sentence structures):**
```
"{name} dropped {pts}{opp} and this hand rode that wave all the way to the bank."
"{pts} points. That was all {last}. Statement game."
"Nobody was stopping {nick} tonight — {pts} and counting."
```

**Win + star_went_off + culture_wry (varied name forms):**
```
"{last} put up {pts}{opp} and honestly, someone should check on the opposing defense."
"{nick} decided to remind everyone tonight. {pts} points. Message received."
"Someone had to go for {pts}. {first} decided it was him."
```

**Win + star_went_off + warm (name mid/end):**
```
"Good night to have {name} on your roster. {pts} points, clean and efficient."
"{pts}{opp}. That's {last} doing exactly what you paid for."
"The roster had a guy tonight. {name} set the tone and never let up."
```

**Win + star_went_off + deadpan:**
```
"{last} went for {pts}. Won. On to the next one."
"{pts} from {nick}. That'll do."
```

**Loss + star_no_showed + culture_wry (varied structures):**
```
"{last} had more turnovers than highlights tonight and that's genuinely hard to do."
"{nick} picked tonight to take a personal day. The roster noticed."
"Way below his usual night. {name} owes the supporting cast an apology."
```

**Loss + star_no_showed + deadpan:**
```
"{last} came in way below his line. Not much else to say about this one."
"Needed {nick} to show up. He didn't. Happens."
```

**Win + ROOKIE + warm (half-back, varied):**
```
"Half your money back. {last} did just enough to keep this one from going sideways."
"Not the night you drew up, but {nick} kept the roster alive. Half back beats empty."
"Got some of it back. {name} held it together — barely."
```

### Template token resolution

The composer resolves tokens using the input data:

- `{name}` → `subject.name` (full name, e.g. "Anthony Edwards")
- `{last}` → `lastName(subject.name)` (e.g. "Edwards")
- `{first}` → first word of `subject.name` (e.g. "Anthony")
- `{nick}` → `lookupCulture(subject.name)?.nicknames[0]`, falls back to `{last}`
- `{nick2}` → `lookupCulture(subject.name)?.nicknames[1]`, falls back to `{nick}`
- Stats pulled from `statN()` helper
- `{opp}` → `oppPhrase()` helper (existing)
- `{badge}` → from subject's achievements array
- `{gap}` → `nextTierMin - totalFp`
- `{streak}` → from input

### Supporting detail injection

After the main template is resolved, supporting details are appended if their roll succeeded:

```typescript
// Main message from template
let message = resolveTemplate(template, data);

// Supporting details — append as natural continuation
if (nearMissDetail) {
  message += ` You were ${gap} away from ${nextTier}.`;
}
if (badgeDetail && !message.includes(badge)) {
  message += ` ${badge} on the stat sheet.`;
}
if (streakDetail) {
  message += ` That's ${streak} in a row.`;
}

// Cap at ~200 chars, break at sentence boundary
message = capAtSentence(message, 200);
```

Detail injection respects the character cap — if the main template is already 180 chars, no details get appended. Main message is always preserved whole.

---

## 10. Culture/Wry Content Strategy

Culture and wry are NOT separate systems. They work in cohesion:

- **Culture content** = the WHAT (player personality, history, opponent flavor, signature moments)
- **Wry tone** = the HOW (delivery style — smartass, Inside the NBA energy)

When `culture_wry` tone is rolled, the template should pull from culture lines AND deliver them with humor. Not culture OR humor — culture WITH humor.

### Culture content sources

| Source | Used for |
|--------|----------|
| `nbaRecords` (static) | Record broken, near-record, career milestone detection |
| `playerCulture.overperform` | Win + star went off |
| `playerCulture.underperform` | Loss + star no-showed |
| `playerCulture.turnovers` | Supporting detail on loss |
| `playerCulture.tier1/tier2/tier3` | General flavor, gated by handCount |
| `playerCulture.bigGame` | Win + rare badge or high stats |
| `playerCulture.quietGame` | Loss + star below average |
| `playerCulture.opponentFlavor` | When opponent matches a key |
| `playerCulture.streakLines` | When streak detail is included |
| `teamFlavor.humor` | Wry tone seasoning when opponent is known |

All culture lines run through `attributeCultureLine()` to ensure the player is always named.

### Wry content requirements

Every culture category in `playerCulture.ts` needs wry-compatible variants. Some existing lines already work:

- "The price of being Denver's entire offense." (Jokić turnovers — already wry)
- "Still salty about losing to the Lakers in 2020." (Jokić controversy — wry)

Lines that DON'T work for wry tone:

- "Two-time MVP who revolutionized the center position with his playmaking genius." (straight factual — good for warm/observational, not wry)

The audit harness will flag culture lines that get used with wry tone but score low on humor. Those get rewritten or tagged as non-wry-compatible.

---

## 11. File Architecture — Sport-Agnostic by Design

The composer, tone engine, story selector, and template resolver are fully sport-agnostic. They live in `shared/` and operate on the existing `PostRevealCopyInput` interface which is already sport-agnostic. The only sport-specific pieces are the template bank (phrasing) and the culture/flavor databases (content). Adding baseball (or any future sport) means:

1. Create `baseball/src/utils/playerCulture.ts` — player culture DB for MLB
2. Create `baseball/src/utils/teamFlavor.ts` — team humor/identity for MLB
3. Create `shared/commentary/templateBank.baseball.ts` — baseball-specific templates using the same `(register, story, tone)` keying
4. The composer auto-selects the right template bank based on `input.sport`

No changes to the composer, tone engine, story selector, or resolver. The formula (register → intensity → star → story → tone → compose) works identically for any sport. "Star went off" in baseball might be "Ohtani went 4-for-4 with 2 homers" instead of "Edwards dropped 48" — the structure is the same, only the templates differ.

```
shared/commentary/
  composeCommentary.ts           — NEW: the unified composer (Steps 1-6), sport-agnostic
  toneEngine.ts                  — NEW: weighted random + session-aware anti-redundancy
  storySelector.ts               — NEW: star-first causal logic + detail assembly
  templateBank.ts                — NEW: template bank loader + registry by sport
  templateBank.basketball.ts     — NEW: basketball templates keyed by (register, story, tone)
  templateResolver.ts            — NEW: token resolution + detail injection + char cap
  types.ts                       — EXISTING: add CommentaryTemplate type
  promptBuilder.ts               — EXISTING: unchanged (for future LLM re-enable)
  generateCommentary.ts          — EXISTING: unchanged (for future LLM re-enable)

shared/data/
  nbaRecords.ts                  — NEW: NBA single-game records + career milestone thresholds
  recordDetector.ts              — NEW: compares stat line against records, returns record events

basketball/src/utils/
  buildPostRevealCopy.ts     — EXISTING: kept as fallback, feature flag switches
  playerCulture.ts           — EXISTING: content source, may get wry variants added
  teamFlavor.ts              — EXISTING: content source for wry tone

basketball/src/tools/
  commentaryAudit.ts         — NEW: scenario generator + grader + report
```

### Feature flag

```typescript
// In GameView.tsx or wherever commentary is called
const USE_NEW_COMMENTARY = true; // flip to false to revert to old system

const copy = USE_NEW_COMMENTARY
  ? composeCommentary(input)
  : buildPostRevealCopy(input);
```

---

## 12. Scenario Test Harness

### 12a. Scenario Generator

Generates ~2,200 `PostRevealCopyInput` objects covering:

| Dimension | Values |
|-----------|--------|
| Win tier | BUST, ROOKIE, STARTER, ALL_STAR, MVP, GOAT |
| Margin | barely (≤5), comfortable (6-14), dominant (≥15) |
| Near-miss | none, ≤3 FP gap (triggers detail), 4-8 FP gap (should NOT trigger — validates suppression) |
| Star ratio | cold (<0.65), below (0.75), average (1.0), above (1.2), went off (1.5+) |
| Streak | 0, 3, 5, 10, broken from 7+ |
| Badges | none, common (FIRE/BEAST), rare (GOD_MODE/5X5), TURNOVER_MACHINE |
| Held card | not held, held+paid off, held+busted |
| Roster shape | 1 star + 4 bench, 2 stars + 3 bench |

~2,000 strategic combinations covering every path + ~200 random fuzz scenarios.

### 12b. Rule-Based Grader

Every generated output is scored. Failed and warned scenarios are **rejected** — their triggering templates are flagged for rewriting or removal.

| Check | Severity | Rule |
|-------|----------|------|
| Register consistency | **FAIL** | Win message contains blame/negative language? Loss message contains celebration? → reject |
| Star-first | **FAIL** | Message doesn't prominently feature a nameable player when one exists? → reject |
| Banned content | **FAIL** | Contains "FP", tier names, engine internals, non-nameable player names? → reject |
| Attribution | **FAIL** | Culture line used without player name? → reject |
| Length | **FAIL** | Outside 80-200 chars? → reject |
| Redundancy | **FAIL** | Same message text produced by 2+ different scenarios? → reject |
| Causal clarity | **WARN → reject** | Doesn't answer "why did I win/lose"? → reject |
| Tone match | **WARN → reject** | Rolled tone doesn't match delivery style? → reject |
| ROOKIE distribution | **WARN** | Over 100 ROOKIE scenarios, "half back" appears <30% or >50%? → flag for tuning |
| Tone distribution | **WARN** | Over 1000 hands, any tone >±10% from target weights? → flag for tuning |

### 12c. The Quality Loop

```
Run audit → report shows failures/warnings
         → failed templates removed from bank
         → warned templates flagged for rewrite
         → you rewrite or approve LLM-generated alternatives
         → re-run audit → verify scores improved
         → repeat until pass rate ≥ 95%
```

The template bank only ships templates that survived the audit. Every future change triggers a re-run. The pool gets stronger with each cycle.

### 12d. Report format

```
$ npx tsx basketball/src/tools/commentaryAudit.ts

Commentary Audit — 2,200 scenarios
═══════════════════════════════════
Pass: 1,847 (84%)
Rejected: 353 (16%)

Rejection breakdown:
  - 89× register_inconsistency
  - 67× redundancy
  - 52× star_missing
  - 41× causal_unclear
  - 38× tone_mismatch
  - 33× banned_content
  - 18× attribution
  - 15× length

Tone distribution (target → actual):
  culture_wry:   35% → 33.2% ✓
  hype:          18% → 19.1% ✓
  warm:          18% → 17.4% ✓
  observational: 15% → 14.8% ✓
  analytical:     9% →  9.6% ✓
  deadpan:        5% →  5.9% ✓

Weakest templates (most rejections):
  1. loss/star_no_showed/warm — "Tough night for the roster." (no star named)
  2. win/clean_win/analytical — "The math worked out." (no causal story)
  ...

Flagged culture lines (used with wry tone, low humor score):
  1. jokic.overperform[0] — "When Jokić goes nuclear, he stuffs every category"
  2. edwards.tier1[0] — "Minnesota's franchise cornerstone who can drop 50"
  ...
```

---

## 13. Target Examples

### Wins

| Tier + Tone | Message |
|-------------|---------|
| ALL_STAR + hype | "Anthony Edwards dropped 48 on Indiana and this hand absolutely cashed. That's a night." |
| MVP + culture_wry | "Jokić put up a triple-double and made it look like he was running errands. Take your money." |
| STARTER + warm | "Good night to have Jayson Tatum on the roster. Solid across the board, nothing wasted." |
| GOAT + hype | "Giannis went for 55 and nobody else needed to do a single thing. Remember this one." |
| ROOKIE + warm (half-back) | "Half your money back. Trae Young did just enough to keep this one from going sideways." |
| STARTER + culture_wry + near-miss | "Booker went nuclear — 61 and GOD MODE. You were 2 FP from MVP. Greedy to even mention it." |
| ALL_STAR + deadpan | "Edwards went for 42. Won big. On to the next one." |

### Losses

| Subtype + Tone | Message |
|----------------|---------|
| BUST (mid) + culture_wry | "Tatum picked tonight to take a personal day. Way below his usual night — the 6 turnovers just made it worse." |
| BUST (close) + warm | "Almost survived it. Jokić came in right below his line and it cost you by 2." |
| BUST (bad) + deadpan | "Giannis no-showed. Nobody else made up for it. Happens." |
| BUST (mid) + observational | "Edwards came in 40% below his average. Hard to overcome that from anyone on the roster." |

---

## 14. Migration Plan

1. Build new composer + tone engine + template bank alongside old system
2. Wire up feature flag — old system is default
3. Build scenario generator + grader
4. Seed initial template bank (~50-80 templates covering core combinations)
5. Run first audit → expect ~60-70% pass rate
6. Iterate templates until ≥ 90% pass rate
7. Flip feature flag to new system
8. Monitor in beta, keep old system as emergency revert
9. Delete old system once new system is validated

---

## 15. Out of Scope (for now)

- **LLM-assisted template rewriting** — future enhancement plugging into the audit pipeline
- **Runtime LLM commentary** — stays disabled. The phrase bank is the runtime engine.
- **Baseball template bank + culture DB** — this spec builds basketball first. The architecture is sport-agnostic (see Section 11) so baseball plugs in by adding templates and culture content, no composer changes needed.
- **Audio integration** — no changes to sound system.
- **Leaderboard context override** — remove. All commentary flows through the composer. If leaderboard data is relevant, it becomes a supporting detail, not a replacement.
