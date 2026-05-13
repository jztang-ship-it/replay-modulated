# Share & Challenge Mechanic Design

## Goal

After a hand resolves, surface a trigger-specific "Challenge a friend" prompt. Tapping generates a shareable PNG (satori) and a `/basketball/challenge/:id` link. The recipient opens the link, sees the challenger's exact hand and score, taps "Accept Challenge," and plays from the identical starting deal — same 5 cards, same cap, same constraints, their own hold/draw decisions. After their reveal, a side-by-side comparison appears with a "Send it back" button that closes the viral loop.

---

## Architecture

Five subsystems, executed in dependency order:

1. **Initial-deal capture** — store the pre-hold/draw roster in GameView so it's available at challenge-creation time.
2. **Data layer** — migration 006 extends `shared_challenges`, adds `challenge_attempts`.
3. **API layer** — 4 endpoints: `create`, `get`, `attempt`, `share/card`.
4. **Frontend components** — trigger hook, share prompt, landing screen, comparison screen.
5. **Email** — Resend transactional notification when an attempt completes.

---

## SportAdapter Contract Extensions

Add to `shared/adapters/SportAdapter.ts` (abstract base), with basketball implementations:

```typescript
/** Convert a GeneratedCard[] into a JSON-serializable snapshot for storage. */
abstract serializeRoster(cards: GeneratedCard[]): Record<string, unknown>;

/** Reconstruct a GeneratedCard[] from the stored snapshot. */
abstract deserializeRoster(snapshot: Record<string, unknown>): GeneratedCard[];

/** Minimal validation — returns false if snapshot is structurally invalid. */
abstract validateRosterSnapshot(snapshot: Record<string, unknown>): boolean;

/** Primary numeric value used for head-to-head comparison. */
abstract getComparisonValue(result: HandResult): number;

/** Human-readable formatted value, e.g. "218.4 FP". */
abstract formatComparisonValue(value: number): string;

/** Layout hints for the sport-specific share card satori renderer. */
abstract getShareCardConfig(): ShareCardConfig;
```

`ShareCardConfig` lives in `shared/adapters/types.ts`:

```typescript
export interface ShareCardConfig {
  sport: string;
  rosterSize: number;                         // 5 for basketball
  cardLayout: "3+2" | "2+3" | "2+2+1";       // grid rows
  statLabel: (card: GeneratedCard) => string; // e.g. "38.2 FP"
  tierAccentColor: (tier: string) => string;  // hex
  tierLabel: (tier: string) => string;        // "MVP", "All-Star", etc.
  tierBgColor: (tier: string) => string;      // background hex
}
```

Basketball implementation: `cardLayout = "3+2"`, `statLabel` returns `${card.actualFp.toFixed(1)} FP`, tier colors from existing `TIER_TOKENS`.

---

## Data Model — Migration 006

File: `supabase/migrations/006_challenges_v2.sql`

### Extend `shared_challenges`

```sql
ALTER TABLE public.shared_challenges
  ADD COLUMN IF NOT EXISTS initial_roster    jsonb           NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS challenger_name   text,
  ADD COLUMN IF NOT EXISTS trigger_type      text            NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS share_headline    text,
  ADD COLUMN IF NOT EXISTS sport             text            NOT NULL DEFAULT 'basketball',
  ADD COLUMN IF NOT EXISTS roster_size       integer         NOT NULL DEFAULT 5;
```

`initial_roster` stores the serialized snapshot from `adapter.serializeRoster(initialRoster)`. `slate_seed` (existing column) is left in place but unused for replay — it will store the `hand_id` as a reference string for auditing.

### `challenge_attempts` table

```sql
CREATE TABLE IF NOT EXISTS public.challenge_attempts (
  attempt_id       uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id     uuid           NOT NULL REFERENCES public.shared_challenges(challenge_id) ON DELETE CASCADE,
  user_id          uuid           REFERENCES auth.users(id) ON DELETE SET NULL,
  score            numeric(6,1)   NOT NULL,
  score_breakdown  jsonb,
  is_winner        boolean        NOT NULL,
  created_at       timestamptz    NOT NULL DEFAULT now()
);

ALTER TABLE public.challenge_attempts ENABLE ROW LEVEL SECURITY;

-- Anyone can record an attempt (anonymous players have no auth.uid)
CREATE POLICY "public insert" ON public.challenge_attempts
  FOR INSERT WITH CHECK (true);

-- Challenger can read attempts on their challenges
CREATE POLICY "challenger reads attempts" ON public.challenge_attempts
  FOR SELECT USING (
    challenge_id IN (
      SELECT challenge_id FROM public.shared_challenges WHERE created_by = auth.uid()
    )
  );

-- Attempter can read their own attempt
CREATE POLICY "own attempt readable" ON public.challenge_attempts
  FOR SELECT USING (user_id = auth.uid());
```

---

## API Endpoints

### `POST /api/challenge/create`

Creates a challenge row from a completed hand.

Request body:
```typescript
{
  hand_id:        string;            // hand_log.hand_id
  sport:          string;            // "basketball"
  season:         string;            // "2425"
  target_score:   number;            // challenger's final FP
  score_breakdown?: Record<string, unknown>;
  initial_roster: Record<string, unknown>;  // from adapter.serializeRoster()
  challenger_name: string;           // getNickname() at creation time
  trigger_type:   string;            // "big_score" | "rare_pull" | "near_miss" | "bad_beat" | "default"
  share_headline: string;            // pre-computed by evaluateTrigger()
}
```

Response:
```typescript
{
  challenge_id: string;
  share_url:    string;  // "https://replayifs.com/basketball/challenge/{id}"
  card_url:     string;  // "/api/share/card?challenge_id={id}&sport=basketball"
}
```

Implementation:
- Authenticates via Supabase anon key (user must be signed in; anonymous users may create challenges)
- Inserts into `shared_challenges` (sport-prefixed URL path stored in `share_url`)
- Sets `slate_seed = hand_id` as audit reference
- Returns immediately — no async work

### `GET /api/challenge/:id`

Public endpoint — no auth. Returns full challenge data for the landing screen.

Response:
```typescript
{
  challenge_id:    string;
  challenger_name: string;
  target_score:    number;
  sport:           string;
  season:          string;
  trigger_type:    string;
  share_headline:  string;
  initial_roster:  Record<string, unknown>;  // passed to adapter.deserializeRoster() on client
  roster_size:     number;
  created_at:      string;
  card_url:        string;
}
```

Increments `view_count` via a fire-and-forget `UPDATE` (not awaited before responding). Sets `Cache-Control: public, max-age=30`.

### `POST /api/challenge/:id/attempt`

Records a completed attempt. Auth optional (anonymous attempts allowed).

Request body:
```typescript
{
  score:           number;
  score_breakdown?: Record<string, unknown>;
  is_winner:       boolean;
  user_id?:        string;   // caller's uid if available
}
```

Response: `{ attempt_id: string, email_sent: boolean }`

Implementation:
1. Inserts into `challenge_attempts`
2. Increments `shared_challenges.attempt_count`
3. Looks up `created_by` from `shared_challenges` → looks up `email` from `auth.users` via service role
4. If email exists: sends Resend transactional email (see Email section)
5. `email_sent = true` only if Resend call succeeded

### `GET /api/share/card`

Returns a PNG share card via satori.

Query params: `challenge_id`, `sport`

Fetches the challenge row, deserializes via `getShareCardConfig()` (sport-specific layout), renders satori JSX to PNG, returns with:
```
Content-Type: image/png
Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
```

Image dimensions: 1080 × 1920 px (IG story portrait).

---

## Share Card — Satori Layout

File: `api/share/card.ts`

The satori function is a standard Vercel Node.js serverless function (not Edge — Fluid Compute for Node.js compatibility). Uses `@vercel/og` package.

Layout (1080 × 1920 flexbox column, dark background `#070A12`):

```
┌─────────────────────────────────────┐
│ REPLAYIFS · [SPORT BADGE]    100px  │  ← top bar
│                                     │
│  [SHARE HEADLINE]             200px │  ← trigger-specific copy, 48px bold
│  "[Name] scored 218 FP"       60px  │  ← subline
│                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ img  │ │ img  │ │ img  │  600px │  ← row 1 (3 cards for basketball)
│  │ 38FP │ │ 32FP │ │ 41FP │        │  each card: photo circle + player name + stat
│  └──────┘ └──────┘ └──────┘        │
│     ┌──────┐  ┌──────┐             │
│     │ img  │  │ img  │      450px │  ← row 2 (2 cards, centered)
│     │ 47FP │  │ 60FP │             │
│     └──────┘  └──────┘             │
│                                     │
│      ┌──────────────────┐    150px │  ← tier badge (e.g. "MVP TIER")
│      │  🏆  MVP  🏆     │          │
│      └──────────────────┘          │
│                                     │
│  [NAME] scored [FP]. Beat them. →  │  ← CTA line, 40px
│  replayifs.com/challenge/[id]       │  ← URL, 28px dim, 160px total
└─────────────────────────────────────┘
```

Card layout row configuration comes from `ShareCardConfig.cardLayout`. Basketball uses `"3+2"`. Each card shows: player headshot (`headshotUrl(photoCode)`) in a 120px circle, player name (20px), stat from `statLabel(card)`.

Headlines by trigger type (examples for basketball; final copy generated from `share_headline` stored at creation):
- `rare_pull`: "This game only happens once in a generation."
- `big_score`: "You hit MVP. Same slate. Beat them."
- `near_miss`: "You missed All-Star by 3.1 FP. Can they finish it?"
- `bad_beat`: "Brutal. See if they can survive the same slate."
- `default`: "[Name] scored [FP]. Same slate. Beat them."

---

## Trigger Evaluation

File: `shared/hooks/useChallengeShare.ts`

Trigger types evaluated in priority order: `rare_pull > big_score > near_miss > bad_beat > default`.

```typescript
export type TriggerType = 'rare_pull' | 'big_score' | 'near_miss' | 'bad_beat' | 'default';

export interface TriggerResult {
  type: TriggerType;
  headline: string;    // share card top line
  subline: string;     // e.g. "[Name] scored 218.4 FP"
  ctaText: string;     // button label, e.g. "Challenge a Friend"
}

export function evaluateTrigger(params: {
  cards: GeneratedCard[];
  totalFp: number;
  fpTier: string;
  isWin: boolean;
  challengerName: string;
  adapter: SportAdapter;
}): TriggerResult
```

**`rare_pull`** — any card in the final hand has a record badge:
```
adapter.computeBadges(card, ctx).some(b => b.type === 'record' || b.type === 'top_game')
```
Headline: `"You pulled {playerName}'s {stat} game. Challenge someone to beat this."`

**`big_score`** — `fpTier` is `ALL_STAR`, `MVP`, or `LEGEND`:
Headline: `"You hit {tierLabel}. Same slate. Beat them."`

**`near_miss`** — final FP is within 5 of the next tier's threshold AND next tier exists:
```typescript
const thresholds = adapter.getWinThresholds();    // ordered list of { tier, minFp }
const nextTier = thresholds.find(t => t.minFp > totalFp);
const gap = nextTier ? nextTier.minFp - totalFp : Infinity;
// fires when gap <= 5
```
Headline: `"You missed {nextTierLabel} by {gap.toFixed(1)} FP. Send this slate — see if they finish the job."`

**`bad_beat`** — tier is `BUST` or `ROOKIE` AND hand contains at least one `RED` or `ORANGE` tier card:
Headline: `"Brutal hand. Challenge a friend to survive the same slate."`

**`default`** — always fires if none above matched:
Headline: `"[Name] scored {totalFp.toFixed(1)} FP. Same slate. Beat them."`

---

## `useChallengeShare` Hook

File: `shared/hooks/useChallengeShare.ts`

```typescript
export function useChallengeShare(adapter: SportAdapter) {
  const [triggerResult, setTriggerResult] = useState<TriggerResult | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /** Call after reveal is complete, once per hand. */
  function evalAndArm(params: {
    cards: GeneratedCard[];
    totalFp: number;
    fpTier: string;
    isWin: boolean;
    challengerName: string;
  }): void;

  /**
   * Creates the challenge row + fires analytics.
   * Must be called before shareChallenge().
   */
  async function createChallenge(params: {
    handId: string;
    season: string;
    initialRoster: GeneratedCard[];  // pre-hold/draw
    totalFp: number;
    scoreBreakdown?: Record<string, unknown>;
    challengerName: string;
  }): Promise<void>;

  /**
   * Opens the Web Share API sheet with the card image + link.
   * Falls back to copying link to clipboard.
   */
  async function shareChallenge(): Promise<void>;

  /** Reset all state for next hand. */
  function reset(): void;

  return { triggerResult, challengeId, shareUrl, loading, evalAndArm, createChallenge, shareChallenge, reset };
}
```

`evalAndArm` calls `evaluateTrigger(...)` and stores the result. `createChallenge` calls `POST /api/challenge/create`. `shareChallenge` uses `navigator.share({ title, text, url, files: [imageBlob] })` — fetches the PNG from `card_url` as a Blob to include in the share sheet, falls back to `navigator.clipboard.writeText(shareUrl)` if share fails. Fires `share_action_taken` analytics on completion.

---

## Frontend Components

### `ChallengeSharePrompt` — `shared/components/ChallengeSharePrompt.tsx`

Shown in the results phase, rendered by GameView alongside `PostHandSheet`. Receives `triggerResult` and fires challenge creation on tap.

Props:
```typescript
interface ChallengeSharePromptProps {
  triggerResult: TriggerResult;
  onShare: () => void;       // calls createChallenge() then shareChallenge()
  loading: boolean;
  sport: string;
}
```

Layout: a full-width pill button below the PostHandSheet's PLAY AGAIN button. When `triggerResult.type !== 'default'`, shows the trigger headline above the button in 12px muted text. Button label = `triggerResult.ctaText` ("Challenge a Friend" for all types). While `loading`, shows a spinner. Does not render at all if `triggerResult` is null (evaluation hasn't run yet).

Integration in `GameView.tsx`:
1. Maintain `initialRosterRef = useRef<GeneratedCard[]>([])` — set at deal time (line ~1302, after `setRoster(nextRoster)`)
2. Call `useChallengeShare(adapter)` inside the component
3. In the `useEffect` that fires when `gameState === "RESULTS"`, call `evalAndArm(...)` using the final roster + scores
4. Render `<ChallengeSharePrompt>` alongside `PostHandSheet` in the results area
5. Call `reset()` on each new deal

### `ChallengeLandingScreen` — `shared/components/ChallengeLandingScreen.tsx`

Shown when `window.location.pathname` matches `/[sport]/challenge/:id`. Detected in `App.tsx` (same pattern as profile wall). Fetches `GET /api/challenge/:id` on mount.

Layout:
```
[Back button]
─────────────────────────────
[Challenger name] scored [FP]
[trigger headline in muted text]
─────────────────────────────
[5 cards grid — face-up, same layout as share card]
each card: player photo + name + stat
─────────────────────────────
[Accept Challenge]  ← full-width primary CTA
─────────────────────────────
```

No homepage redirect. No account wall. No "estimated time" copy. The "Back" button calls `window.history.back()`.

On "Accept Challenge" tap:
1. Fires `challenge_attempt_start` analytics
2. Calls `adapter.deserializeRoster(challenge.initial_roster)` — validates via `adapter.validateRosterSnapshot()`
3. Stores `{ challengeId, initialRoster, targetScore, challengerName, challengerFp }` in a `challengeCtx` state in `App.tsx`
4. Navigates to the game (sets view = "game")

### `ChallengeComparisonScreen` — `shared/components/ChallengeComparisonScreen.tsx`

Replaces PostHandSheet after the recipient's reveal when `challengeCtx !== null`. GameView checks `challengeCtx` in the results phase and renders this instead of/after PostHandSheet.

Props:
```typescript
interface ChallengeComparisonScreenProps {
  myScore: number;
  theirScore: number;
  myCards: GeneratedCard[];
  theirCards: GeneratedCard[];  // from challengeCtx.initial_roster (challenger's final, not initial)
  challengerName: string;
  challengeId: string;
  adapter: SportAdapter;
  onSendBack: () => void;       // creates new challenge from recipient's hand
  onChallengeNew: () => void;   // plays again without challenge context
  onPlayAgain: () => void;      // standard play again
}
```

Layout:
```
YOU             [CHALLENGER_NAME]
218.4 FP        195.0 FP
─────────────────────────────────
You win by 23.4 FP   (or "They beat you by X FP")
─────────────────────────────────
[Send it back →]       ← primary CTA
[Challenge someone else]
[Play Again]
```

`onSendBack`: calls `useChallengeShare.createChallenge()` with the recipient's hand (using the same `initialRosterRef`), then `shareChallenge()` — this creates a new challenge aimed back at the original challenger. The share sheet text reads: "[Recipient] accepted your challenge and scored [X FP]. Run it back?"

`onChallengeNew`: same as `onSendBack` but generic share (not targeted at original challenger).

Fires `challenge_attempt_complete` on mount.

---

## Challenge Replay Flow — GameView Integration

### Initial roster capture

In `GameView.tsx`, add:
```typescript
const initialRosterRef = useRef<GeneratedCard[]>([]);
```

At line ~1302, immediately after `setRoster(nextRoster)`:
```typescript
initialRosterRef.current = nextRoster;   // capture pre-hold/draw deal
```

Reset in the deal phase at the top of the `gameState === "IDLE"` branch:
```typescript
initialRosterRef.current = [];
```

### Challenge mode deal override

`App.tsx` detects the `/[sport]/challenge/:id` path and stores:
```typescript
const [challengeCtx, setChallengeCtx] = useState<ChallengeContext | null>(null);

interface ChallengeContext {
  challengeId: string;
  initialRoster: GeneratedCard[];    // deserialized
  targetScore: number;
  challengerName: string;
  challengerFp: number;
}
```

`GameView` receives `challengeCtx?: ChallengeContext` as a prop.

In the `gameState === "IDLE"` deal branch, instead of calling `dealInitialRoster()`:
```typescript
if (props.challengeCtx) {
  res = { roster: props.challengeCtx.initialRoster, handId: generateLocalHandId() };
} else {
  res = ftueStillActive ? await ftueDealRoster() : await dealInitialRoster();
}
```

`generateLocalHandId()` returns a client-side UUID for the recipient's `hand_log` entry.

The bet multiplier is **not** inherited from the challenge — the recipient sets their own.

### Results phase with challenge context

In the `gameState === "RESULTS"` rendering block:
- If `props.challengeCtx !== null`: render `ChallengeComparisonScreen` (hides PostHandSheet)
- If `props.challengeCtx === null`: render standard `ChallengeSharePrompt` alongside PostHandSheet

---

## Email Notification — Resend

File: called from `POST /api/challenge/:id/attempt`

Install: `resend` npm package (root `package.json`)

Environment variable: `RESEND_API_KEY` (set in Vercel dashboard)
From address: `challenges@replayifs.com` (configure in Resend dashboard)

Template (plain text with single CTA):
```
Subject: [Name] accepted your [sport] challenge

[Recipient name] scored [X FP] on your [season] slate.
You scored [Y FP].

[Winner message: "They beat you by Z FP. Run it back?" OR "You still lead by Z FP. They're coming for you."]

→ Run it back: {challenge_url_for_original_challenger}
```

The run-it-back link points to the recipient's challenge URL (the new challenge created by `onSendBack`, if it exists) or to the generic game URL if no return challenge was created yet. Implementation: pass `return_challenge_id` as an optional field in the attempt body; if present, use it as the CTA link.

Email is only sent if `auth.users.email` is non-null for the original challenger — fetched via service role.

---

## Analytics Events

All via `track(feature, action, props)` from `@shared/analytics/analytics`. Feature: `"challenges"`.

| Action | When | Key props |
|--------|------|-----------|
| `share_trigger_fired` | `evalAndArm()` after reveal | `trigger_type`, `sport`, `season`, `fp_tier` |
| `challenge_create` | `POST /api/challenge/create` succeeds | `challenge_id`, `sport`, `trigger_type` |
| `share_card_generated` | `GET /api/share/card` hit | `challenge_id`, `sport` (server-side via Supabase insert or header logging) |
| `share_action_taken` | Web Share API result | `challenge_id`, `method: 'native_share' \| 'clipboard'` |
| `challenge_link_open` | `ChallengeLandingScreen` mount | `challenge_id`, `sport`, `has_referrer` |
| `challenge_attempt_start` | "Accept Challenge" tapped | `challenge_id`, `sport` |
| `challenge_attempt_complete` | `ChallengeComparisonScreen` mount | `challenge_id`, `sport`, `is_winner`, `score_delta` |

`"challenges"` feature must be added to the `Feature` union in `shared/analytics/analytics.ts`.

---

## Build Order

Matches the user-specified sequence:

1. **Initial deal capture** — `initialRosterRef` in `GameView.tsx`; smoke-test that ref is populated before hold
2. **Migration 006** — extend `shared_challenges`, add `challenge_attempts`, apply locally
3. **SportAdapter extensions** — abstract methods + basketball implementation
4. **`POST /api/challenge/create` + `GET /api/challenge/:id`** — core CRUD, unit-tested
5. **`GET /api/share/card`** — satori endpoint, PNG verified locally
6. **Trigger evaluation** — `evaluateTrigger()` pure function + unit tests for all 4 types
7. **`useChallengeShare` hook** — integrates trigger eval, create, Web Share API
8. **`ChallengeSharePrompt`** — wired into GameView results phase
9. **`ChallengeLandingScreen`** — path detection in App.tsx, challenge fetch, Accept flow
10. **Challenge replay deal override** — `challengeCtx` in App.tsx → GameView prop → deal branch
11. **`ChallengeComparisonScreen`** — post-reveal comparison + send-back
12. **`POST /api/challenge/:id/attempt`** + email — Resend integration
13. **Analytics** — `"challenges"` Feature + all events wired

---

## Scope Notes

- Seed-based replay is explicitly out of scope. Snapshot is the mechanism.
- Native social SDK integrations (Instagram, Twitter) are out of scope — Web Share API only.
- Anonymous users may accept challenges and play through; their `user_id` in `challenge_attempts` is null.
- Challenge expiry (`expires_at`) column exists in schema; not enforced in this iteration.
- Push notifications are a named future target; email is the only notification channel for MVP.
- Basketball is the first sport; the sport-adapter pattern ensures adding baseball/football requires only adapter implementations, not shared-code changes.
