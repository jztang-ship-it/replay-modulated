# Inbox + Header Reorg — Design Spec

**Date:** 2026-04-26
**Status:** Approved (brainstorm complete; pending implementation plan)
**Branch:** `feature/inbox-header` (worktree at `/Users/john/Desktop/ReplayMod-inbox`)

## Problem

ReplayMod has no two-way comms channel between the team and players. The team can't:
- Welcome new users
- Recap big wins or bonus-pool wins
- Push announcements
- Run surveys to learn what early users want

And players can't reach the team without leaving the app for Discord/Reddit. For a product targeting its first ~50 users, that gap is the difference between "I have signal on what to build next" and "I'm guessing."

## Goals (v1)

1. **Team → User:** inbox messages (welcome, big-win recap, bonus-pool win, promo, survey) surfaced via a Profile inbox card and a header bell popover.
2. **User → Team:** a feedback modal with multi-choice questions + optional free text, rewarded with **100 coins** on first submit.
3. **Header reorg:** collapse 5 tabs → 3 visible (Play, Collect, Profile) + `⋮` overflow dropdown holding Pulse/Tourney as "SOON" pills, plus the new bell on the right edge.
4. Ship behind a feature flag for the feedback form so question content can be finalized without blocking infrastructure merge.

## Non-goals (v1)

- Push notifications, email channel
- Daily-standing cron messages, leaderboard make/break messages
- Admin UI for composing surveys / promos (manual SQL with service role key is fine)
- Pre-filled re-submission, message archive, message expiry
- Functional CTA buttons on messages (schema supports `payload.cta`; renderer stubs the click)
- Anonymous-user inbox (signed-in only; anon sees a sign-up nudge card)

---

## UI design

### Header

Single row, left → right: **wordmark · mute · sport-badge · [Play] [Collect] [Profile] [⋮] [🔔]**

- **Tabs:** 3 visible (Play, Collect, Profile); the `⋮` opens a small dropdown overlay with Pulse and Tourney, each marked with an amber `SOON` pill (do not hide them — keep the roadmap visible)
- **Bell (🔔):** rightmost element, separated from tabs by the `⋮`. Red dot when there are unread inbox messages. Tap → opens the bell popover (described below). **Hidden when `isAnonymous=true`.**
- **Profile-tab red dot:** *no longer used for the inbox.* Freed for other signals (e.g., "save your account").

### Inbox card on Profile

Inserted between the Identity card and Today's Standing on `ProfileScreen`. Composition:

- **Title row:** `📬 INBOX · {unread_count} new` (no "View all" link on Profile in v1 — the card renders every message inline; expected volume <20 makes pagination unnecessary)
- **Message list:** all inbox messages for the user, newest first. Each message renders as a card with type-specific icon, title (optional), body, optional CTA button, optional answer chips for surveys. Unread messages have a small red dot and a subtle red border tint.
- **Footer:** `💬 Send feedback ✏️` link (gated by feature flag) on the left; `{total} message(s)` count on the right.

For anonymous users, this card is replaced by a **placeholder card**: *"📬 Save your account to start receiving messages from the team"* with a `Save account` button that opens `RegisterModal`.

### Bell popover

Slim popover anchored to the bell button. Renders the latest 3 messages using the same message-card markup as the inbox card, plus a `View all on Profile →` link at the bottom that closes the popover and routes to Profile (scrolling to the inbox card).

Closes on click-outside or ESC.

### Feedback modal

Opens from the inbox-card footer link. Single scrollable modal. Header: *"💬 Help shape ReplayMod — You're one of our first players. We read every answer."*

A coin-reward callout sits below the header: `🪙 +100 coins on submit` (visible only when this is the user's first submission).

**Question rendering is config-driven.** A `FEEDBACK_QUESTIONS` array in `FeedbackModal.tsx` defines the questions; the modal renders each according to its `type`:

```ts
type Question =
  | { id: string; type: 'single';   label: string; options: string[]; required?: boolean }
  | { id: string; type: 'multi';    label: string; options: string[]; required?: boolean }
  | { id: string; type: 'rating';   label: string; min: number; max: number; required?: boolean }
  | { id: string; type: 'freetext'; label: string; placeholder?: string; required?: boolean };
```

The v1 question set ships with **placeholder questions** (3 generic items) and is gated behind a feature flag. Final question content gets written and committed before flipping the flag — see the *Rollout* section.

Submit button: `Send to the team`. After successful submit, the modal swaps to a confirmation screen showing `+100 coins added` (when first-time) and *"Watch your inbox 📬 — that's where we'll respond."* Re-submitters see *"Got it — your earlier reward stands."* (no coin grant).

---

## Data model

One migration file: `supabase/migrations/<ts>_inbox.sql`.

### `inbox_messages`

```sql
create table inbox_messages (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users on delete cascade,
  message_type  text        not null check (message_type in (
                              'welcome', 'big_win', 'bonus_pool', 'promo', 'survey'
                            )),
  payload       jsonb       not null,
  read_at       timestamptz null,
  created_at    timestamptz not null default now()
);

create index inbox_messages_user_created_idx
  on inbox_messages (user_id, created_at desc);

alter table inbox_messages enable row level security;

create policy "users select own"  on inbox_messages
  for select using (user_id = auth.uid());

create policy "users update own"  on inbox_messages
  for update using (user_id = auth.uid());

create policy "users insert own client-allowed types" on inbox_messages
  for insert with check (
    user_id = auth.uid()
    and message_type in ('welcome', 'big_win', 'bonus_pool')
  );
```

`promo` and `survey` rows are inserted server-side via the service-role key (bypasses RLS) — see *Triggers*.

`payload` shape (canonical):

```ts
type Payload = {
  body: string;                          // required, all variants
  title?: string;                        // optional, all variants
  cta?: { label: string; url: string };  // optional; renderer stubs the click in v1
  // big_win extras
  tier?: 'MVP+' | 'LEGEND';
  fp?: number;
  hand_id?: string;
  // bonus_pool extras
  amount_won?: number;
  // survey extras
  survey?: {
    question: string;
    options: string[];
    type: 'single' | 'multi';
    response?: string | string[];        // null until answered
    answered_at?: string;
  };
};
```

### `feedback_submissions`

```sql
create table feedback_submissions (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users on delete cascade,
  answers            jsonb       not null,                  -- keyed by question id
  submission_number  int         not null,                  -- 1, 2, 3 ... per user
  metadata           jsonb       not null default '{}',     -- app_version, sport, last_hand_id
  created_at         timestamptz not null default now()
);

create index feedback_submissions_user_created_idx
  on feedback_submissions (user_id, created_at desc);

alter table feedback_submissions enable row level security;

create policy "users insert own" on feedback_submissions
  for insert with check (user_id = auth.uid());

-- No SELECT policy for users — admin-only via service role.
```

`submission_number` is computed client-side as `count(prior submissions for this user) + 1`. Latest answers are derived in analysis as `WHERE submission_number = MAX(submission_number) PER user_id`.

### `grant_coins` RPC

A `SECURITY DEFINER` function so the client can't grant arbitrary coin amounts. Allowed reasons whitelist for v1: `feedback_v1`.

```sql
create or replace function grant_coins(p_amount int, p_reason text)
returns void
language plpgsql
security definer
as $$
begin
  if p_reason not in ('feedback_v1') then
    raise exception 'invalid reason: %', p_reason;
  end if;
  if p_amount <= 0 or p_amount > 500 then
    raise exception 'invalid amount: %', p_amount;
  end if;
  update player_state
    set balance = balance + p_amount
    where id = auth.uid();
end;
$$;

grant execute on function grant_coins(int, text) to authenticated;
```

### Forward-compat for v1.1

- Survey-as-inbox-message variant is in v1 already. v1.1 additions are purely additive (e.g., new question types like `rating` for inline survey messages — schema already JSONB).
- Coin-grant ledger table (`coin_grants`) is *not* in v1; if `grant_coins` evolves to log grants, that's a future migration.

---

## Component layout

New module: `shared/inbox/` — four files.

| File | Responsibility |
|---|---|
| `inbox.ts` | Supabase client functions: `listMessages()`, `markRead(id)`, `submitFeedback(answers, metadata)`, `addBigWinMessage(payload)`, `addBonusPoolMessage(payload)`, `addWelcomeMessage()`, `submitSurveyResponse(messageId, response)`. Plus `getSubmissionNumber(userId)`. |
| `InboxCard.tsx` | Profile inline card. Fetches messages on mount via `useEffect`, renders message list, handles read-on-view auto-mark, exposes feedback-footer trigger. ~150 LOC. |
| `BellSheet.tsx` | Header bell popover. Same fetch on open, same message render markup (duplicated JSX — intentional), `View all on Profile →` link. ~80 LOC. |
| `FeedbackModal.tsx` | Multi-question form, coin-reward callout, post-submit confirmation. Hosts `FEEDBACK_QUESTIONS` config. ~200 LOC. |

No `MessageVariants/` subfolder; chat and survey both render inline in the same JSX — survey detection is `if (message.payload.survey)`.

No `useInboxMessages` hook abstraction; `InboxCard` and `BellSheet` each call `listMessages()` independently. Acceptable duplicate fetch given typical message volume (<20).

### Modified existing files (in-place edits)

| File | Change |
|---|---|
| `shared/components/AppHeader.tsx` | Replace 5-tab `TABS` const with `PRIMARY_TABS` (3) + `OVERFLOW_TABS` (2). Add `OverflowDropdown` rendered inline (no extracted component). Add `BellButton` rendered inline; receives `unreadCount` and `onClick`. Hide bell when `isAnonymous`. |
| `shared/components/ProfileScreen.tsx` | Insert `<InboxCard />` between the identity-card section and Today's Standing. For anonymous users, render `<InboxAnonPlaceholder />` instead — a small subcomponent in `InboxCard.tsx` that renders the sign-up nudge card. |
| `shared/components/RegisterModal.tsx` | After successful signup (post-`signUp` or post-`linkGoogle`), call `addWelcomeMessage()`. Inline call, not via observer pattern. |
| Wherever `hand_log` is inserted today | After successful insert, if `tier in ('MVP+', 'LEGEND')`, call `addBigWinMessage({ tier, fp, hand_id })`. Same call site for both basketball and baseball (shared code). |
| Wherever bonus-pool credits are distributed today | After credit success, call `addBonusPoolMessage({ amount_won })`. |

---

## Behavior

### Read state

- Each visible message marks itself read 1.5s after entering the viewport (intersection observer or simple visibility check, whichever is simpler in the existing codebase). One row update per message; idempotent because `read_at` only sets when null.
- Bell red-dot count = `count(*) where user_id=$me and read_at is null`. Refetched when the popover or Profile mounts; not realtime in v1.
- Surveys mark `read_at` on view (just like chat). The `payload.survey.response` is set independently when the user taps an answer chip — answer chips remain tappable indefinitely (no "answered = locked" state).

### Event triggers (insert paths)

| Event | Where | Insert |
|---|---|---|
| Welcome | `RegisterModal` after successful auth-user creation | `addWelcomeMessage()` — RLS allows |
| Big win | After `hand_log` insert, conditional on tier | `addBigWinMessage(...)` — RLS allows |
| Bonus pool | At bonus-pool distribution site | `addBonusPoolMessage(...)` — RLS allows |
| Promo | Manual psql with service role | direct SQL `INSERT INTO inbox_messages ... SELECT id, 'promo', ... FROM auth.users WHERE ...` |
| Survey | Manual psql with service role | same pattern |

### Coin reward (feedback)

Submit flow in `FeedbackModal.tsx`:

```ts
const submissionNumber = await getSubmissionNumber(userId); // count + 1
await submitFeedback(answers, metadata, submissionNumber);
if (submissionNumber === 1) {
  await supabase.rpc('grant_coins', { p_amount: 100, p_reason: 'feedback_v1' });
}
showConfirmationScreen({ coinsGranted: submissionNumber === 1 ? 100 : 0 });
```

The RPC is the gate against client tampering; the client cannot pass `p_amount: 999999`.

---

## Telemetry (PostHog)

Reuse `track()` from `shared/analytics/analytics.ts`. Feature: `inbox` (new) and `nav` (existing).

| Event | Properties |
|---|---|
| `inbox/opened` | `source: 'profile' \| 'bell'`, `unread_count` |
| `inbox/message_read` | `message_type` |
| `inbox/cta_clicked` | `message_type`, `cta_url` |
| `inbox/survey_answered` | `inbox_message_id`, `answer` |
| `inbox/feedback_modal_opened` | (none) |
| `inbox/feedback_submitted` | `submission_number`, `has_freetext`, `completed_questions` |
| `inbox/feedback_dismissed` | `questions_filled` |
| `nav/overflow_opened` | (none) |
| `nav/bell_clicked` | `unread_count` |

---

## Rollout & feature flag

The feedback form is gated by `VITE_FEATURE_FEEDBACK_FORM` (env var, defaults to `0`). When `0`:

- Inbox card footer renders without the `💬 Send feedback ✏️` link
- The `FeedbackModal` component is still imported but never reachable
- Database tables and RPC are live regardless

This lets us merge the full implementation, ship it to prod with the form hidden, and flip the flag once the question set has been finalized.

The bell, inbox card, and team→user message paths (welcome, big-win, bonus-pool, promo, survey) ship live from day 1 — no flag.

---

## Open questions for implementation

1. **Bonus-pool distribution site** — needs a grep during implementation; spec assumes a single existing call site that can be augmented with `addBonusPoolMessage()`.
2. **`isAnonymous` propagation to AppHeader** — currently `AppHeader` doesn't read auth state; needs a prop or context read. Trivial but worth noting.
3. **Read-on-view detection** — IntersectionObserver vs. simple "card mounted = visible" assumption. With messages all in-card on Profile, the latter is probably fine.
4. **Survey insertion ergonomics** — the manual SQL for bulk-inserting a survey row per user works but is awkward. Acceptable for v1; consider a small admin script later (out of scope).

---

## File-level summary

```
NEW
  shared/inbox/
    inbox.ts
    InboxCard.tsx
    BellSheet.tsx
    FeedbackModal.tsx
  supabase/migrations/<ts>_inbox.sql

MODIFIED
  shared/components/AppHeader.tsx
  shared/components/ProfileScreen.tsx
  shared/components/RegisterModal.tsx
  <hand_log insert site(s)>
  <bonus-pool distribution site>
  shared/analytics/analytics.ts (add 'inbox' and 'nav' to feature enum if not present)
```

Total v1 footprint: ~600 LOC of new code, ~50 LOC of edits, one migration with 2 tables + 1 RPC.
