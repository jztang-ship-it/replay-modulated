# Inbox + Header Reorg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Supabase-backed inbox (team→user messages + user→team feedback survey) plus the header reorg (5 tabs → 3 + ⋮ overflow + bell).

**Architecture:** New `shared/inbox/` module with 4 files (data + 3 components) plus one migration adding two tables (`inbox_messages`, `feedback_submissions`) and one `grant_coins` RPC. RLS lets users insert their own welcome/big-win/bonus-pool messages but blocks promo/survey inserts (those use service-role SQL). All inserts client-side; no DB triggers, no realtime subscriptions. Feedback form gated behind `VITE_FEATURE_FEEDBACK_FORM` so question content can land later.

**Tech Stack:** TypeScript, React, Vite, Supabase (Postgres + RLS + RPC), Vitest (node env, logic-only).

**Spec:** `docs/superpowers/specs/2026-04-26-inbox-header-design.md`

---

## File Map

**New files:**
- `supabase/migrations/003_inbox.sql` — `inbox_messages` + `feedback_submissions` tables, RLS policies, `grant_coins` RPC
- `shared/inbox/inbox.ts` — Supabase wrapper functions (queries, inserts, feedback flow)
- `shared/inbox/InboxCard.tsx` — Profile inline card + anon placeholder subcomponent
- `shared/inbox/BellSheet.tsx` — Header bell popover
- `shared/inbox/FeedbackModal.tsx` — Multi-question survey modal + post-submit screen
- `shared/inbox/__tests__/inbox.test.ts` — logic tests (just `getSubmissionNumber` math)

**Modified files:**
- `shared/components/AppHeader.tsx` — split TABS into PRIMARY/OVERFLOW, add inline overflow dropdown, add bell button, hide bell when anon
- `shared/components/ProfileScreen.tsx` — mount `<InboxCard />` between Identity card and Today's Standing
- `shared/components/RegisterModal.tsx` — call `addWelcomeMessage()` after successful signup / Google link
- `basketball/src/views/GameView.tsx:177` — call `addBigWinMessage()` after `hand_log` insert when tier in MVP+/LEGEND
- `shared/analytics/analytics.ts` — extend `Feature` enum with `'inbox'` and `'nav'` (only if not already present)

**Build/test commands:**
- Run all tests: `npm test`
- Run inbox tests: `npx vitest run shared/inbox/__tests__/inbox.test.ts`
- Local dev: `npm run dev` (basketball) — primary surface for manual QA
- Apply migration: paste contents of `003_inbox.sql` into Supabase dashboard SQL editor and execute (matching how 001 + 002 were applied)

**Commit discipline:** one commit per task. Message convention from repo: `feat:` / `fix:` / `chore:` / `docs:` prefix.

**Branch:** `feature/inbox-header` (already created at worktree root).

---

## Task 1: Migration — schema, RLS, grant_coins RPC

**Files:**
- Create: `supabase/migrations/003_inbox.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/003_inbox.sql
-- Inbox + feedback two-way comms channel.
-- Spec: docs/superpowers/specs/2026-04-26-inbox-header-design.md

-- =============================================================================
-- inbox_messages: team → user channel
-- Welcome / big_win / bonus_pool / promo / survey
-- =============================================================================

create table if not exists public.inbox_messages (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  message_type  text        not null check (message_type in (
                              'welcome', 'big_win', 'bonus_pool', 'promo', 'survey'
                            )),
  payload       jsonb       not null,
  read_at       timestamptz null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_inbox_messages_user_created
  on public.inbox_messages (user_id, created_at desc);

alter table public.inbox_messages enable row level security;

create policy "inbox: users select own"
  on public.inbox_messages for select
  using (user_id = auth.uid());

create policy "inbox: users update own"
  on public.inbox_messages for update
  using (user_id = auth.uid());

-- Client may only insert event-driven types. Promos/surveys come from service role.
create policy "inbox: users insert own client-allowed types"
  on public.inbox_messages for insert
  with check (
    user_id = auth.uid()
    and message_type in ('welcome', 'big_win', 'bonus_pool')
  );

-- =============================================================================
-- feedback_submissions: user → team channel
-- Multi-choice survey + optional free text. Latest per user is the canonical answer.
-- =============================================================================

create table if not exists public.feedback_submissions (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  answers            jsonb       not null,
  submission_number  int         not null,
  metadata           jsonb       not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists idx_feedback_submissions_user_created
  on public.feedback_submissions (user_id, created_at desc);

alter table public.feedback_submissions enable row level security;

create policy "feedback: users insert own"
  on public.feedback_submissions for insert
  with check (user_id = auth.uid());

-- No SELECT/UPDATE/DELETE for users — admin-only via service role.

-- =============================================================================
-- grant_coins(p_amount, p_reason) — SECURITY DEFINER RPC
-- Caps + reason whitelist prevent client-side coin grant abuse.
-- =============================================================================

create or replace function public.grant_coins(p_amount int, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reason not in ('feedback_v1') then
    raise exception 'invalid reason: %', p_reason;
  end if;
  if p_amount <= 0 or p_amount > 500 then
    raise exception 'invalid amount: %', p_amount;
  end if;

  update public.player_state
    set balance = balance + p_amount,
        updated_at = now()
    where id = auth.uid();
end;
$$;

revoke all on function public.grant_coins(int, text) from public;
grant execute on function public.grant_coins(int, text) to authenticated;
```

- [ ] **Step 2: Apply via Supabase dashboard**

1. Open Supabase dashboard → SQL Editor → New query
2. Paste the entire contents of `003_inbox.sql`
3. Run

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify tables and RPC exist**

In SQL Editor, run:

```sql
select table_name from information_schema.tables
  where table_schema='public' and table_name in ('inbox_messages','feedback_submissions');
select proname from pg_proc where proname='grant_coins';
select policyname from pg_policies where tablename in ('inbox_messages','feedback_submissions');
```

Expected: 2 tables, 1 function, 4 policies (3 on inbox_messages, 1 on feedback_submissions).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_inbox.sql
git commit -m "feat(inbox): migration — inbox_messages + feedback_submissions + grant_coins RPC"
```

---

## Task 2: `shared/inbox/inbox.ts` — data module

**Files:**
- Create: `shared/inbox/inbox.ts`
- Create: `shared/inbox/__tests__/inbox.test.ts`

- [ ] **Step 1: Create the module**

```ts
// shared/inbox/inbox.ts
// Supabase wrapper functions for the inbox + feedback flows.
// All inserts are client-side via RLS-allowed types; promo/survey are server-side only.

import { supabase } from "@shared/lib/supabase";

// ---------- Types ----------

export type MessageType = 'welcome' | 'big_win' | 'bonus_pool' | 'promo' | 'survey';

export type CTA = { label: string; url: string };

export type SurveyPayload = {
  question: string;
  options: string[];
  type: 'single' | 'multi';
  response?: string | string[];
  answered_at?: string;
};

export type Payload = {
  body: string;
  title?: string;
  cta?: CTA;
  // big_win
  tier?: 'MVP+' | 'LEGEND';
  fp?: number;
  hand_id?: string;
  // bonus_pool
  amount_won?: number;
  // survey
  survey?: SurveyPayload;
};

export type InboxMessage = {
  id: string;
  user_id: string;
  message_type: MessageType;
  payload: Payload;
  read_at: string | null;
  created_at: string;
};

export type FeedbackAnswers = Record<string, string | string[] | number | null>;

export type FeedbackMetadata = {
  app_version?: string;
  sport?: string;
  last_hand_id?: string;
};

// ---------- Reads ----------

export async function listMessages(userId: string): Promise<InboxMessage[]> {
  const { data, error } = await supabase
    .from('inbox_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[inbox] listMessages failed', error); return []; }
  return (data ?? []) as InboxMessage[];
}

export async function markRead(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('inbox_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('read_at', null);
  if (error) console.warn('[inbox] markRead failed', error);
}

// ---------- Inserts (event-driven, RLS-allowed types only) ----------

export async function addWelcomeMessage(userId: string): Promise<void> {
  const payload: Payload = {
    title: 'Welcome to ReplayMod',
    body: "You're in. Pick a roster, watch the hand play out, see how you stacked up. We'll send notes here when something big happens.",
  };
  const { error } = await supabase
    .from('inbox_messages')
    .insert({ user_id: userId, message_type: 'welcome', payload });
  if (error) console.warn('[inbox] addWelcomeMessage failed', error);
}

export async function addBigWinMessage(
  userId: string,
  args: { tier: 'MVP+' | 'LEGEND'; fp: number; hand_id: string }
): Promise<void> {
  const payload: Payload = {
    title: `${args.tier} hand`,
    body: `${args.fp.toFixed(1)} fp — top of the day. The bench paid off.`,
    tier: args.tier,
    fp: args.fp,
    hand_id: args.hand_id,
  };
  const { error } = await supabase
    .from('inbox_messages')
    .insert({ user_id: userId, message_type: 'big_win', payload });
  if (error) console.warn('[inbox] addBigWinMessage failed', error);
}

export async function addBonusPoolMessage(
  userId: string,
  args: { amount_won: number }
): Promise<void> {
  // No call site exists yet (bonus-pool distribution is post-beta). Function is here
  // so the wiring is ready when the distribution event lands.
  const payload: Payload = {
    title: 'You got a piece of the pool',
    body: `+${args.amount_won.toLocaleString()} coins from the bonus pool. Nice run.`,
    amount_won: args.amount_won,
  };
  const { error } = await supabase
    .from('inbox_messages')
    .insert({ user_id: userId, message_type: 'bonus_pool', payload });
  if (error) console.warn('[inbox] addBonusPoolMessage failed', error);
}

// ---------- Survey response ----------

export async function submitSurveyResponse(
  messageId: string,
  response: string | string[]
): Promise<void> {
  // Read-modify-write the message's payload to set survey.response and survey.answered_at.
  const { data, error: readErr } = await supabase
    .from('inbox_messages')
    .select('payload')
    .eq('id', messageId)
    .single();
  if (readErr || !data) { console.warn('[inbox] submitSurveyResponse read failed', readErr); return; }
  const payload = data.payload as Payload;
  const survey = payload.survey;
  if (!survey) return;

  const updatedPayload: Payload = {
    ...payload,
    survey: { ...survey, response, answered_at: new Date().toISOString() },
  };
  const { error: writeErr } = await supabase
    .from('inbox_messages')
    .update({ payload: updatedPayload })
    .eq('id', messageId);
  if (writeErr) console.warn('[inbox] submitSurveyResponse write failed', writeErr);
}

// ---------- Feedback flow ----------

export async function getSubmissionNumber(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('feedback_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) { console.warn('[inbox] getSubmissionNumber failed', error); return 1; }
  return (count ?? 0) + 1;
}

export async function submitFeedback(
  userId: string,
  answers: FeedbackAnswers,
  submissionNumber: number,
  metadata: FeedbackMetadata = {}
): Promise<void> {
  const { error } = await supabase
    .from('feedback_submissions')
    .insert({
      user_id: userId,
      answers,
      submission_number: submissionNumber,
      metadata,
    });
  if (error) console.warn('[inbox] submitFeedback failed', error);
}

export async function grantFeedbackCoins(amount: number): Promise<void> {
  const { error } = await supabase.rpc('grant_coins', { p_amount: amount, p_reason: 'feedback_v1' });
  if (error) console.warn('[inbox] grantFeedbackCoins failed', error);
}
```

- [ ] **Step 2: Write the failing test for `getSubmissionNumber`**

```ts
// shared/inbox/__tests__/inbox.test.ts
// Logic tests for inbox.ts. Other functions are thin Supabase wrappers and are
// verified by manual smoke testing — only the count→number+1 logic warrants a test.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist-friendly mock — must come before importing the module under test.
const fromMock = vi.fn();
vi.mock('@shared/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: vi.fn(),
  },
}));

import { getSubmissionNumber } from '../inbox';

beforeEach(() => {
  fromMock.mockReset();
});

describe('getSubmissionNumber', () => {
  it('returns 1 when the user has zero prior submissions', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ count: 0, error: null }),
      }),
    });
    const n = await getSubmissionNumber('user-a');
    expect(n).toBe(1);
  });

  it('returns N+1 when the user has N prior submissions', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ count: 3, error: null }),
      }),
    });
    const n = await getSubmissionNumber('user-a');
    expect(n).toBe(4);
  });

  it('returns 1 on Supabase error (safe fallback)', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ count: null, error: new Error('boom') }),
      }),
    });
    const n = await getSubmissionNumber('user-a');
    expect(n).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests, verify they pass**

```bash
npx vitest run shared/inbox/__tests__/inbox.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add shared/inbox/inbox.ts shared/inbox/__tests__/inbox.test.ts
git commit -m "feat(inbox): data module — listMessages, inserts, feedback + survey, getSubmissionNumber"
```

---

## Task 3: AppHeader — primary/overflow tab split + dropdown + bell button

**Files:**
- Modify: `shared/components/AppHeader.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file contents with:

```tsx
/**
 * shared/components/AppHeader.tsx
 * LAYER 1: Sport-agnostic top header — wordmark + nav tabs + overflow + bell.
 *
 * Props:
 *   sportLabel?: string  — optional sport badge ("World Cup", "NBA")
 *   onCollect?, onProfile?, onBell?  — tab/icon handlers
 *   hasUncollected? — collect-tab red dot
 *   unreadInboxCount? — bell red dot trigger (>0 shows dot)
 */

import { useEffect, useRef, useState } from "react";
import { soundManager } from "@shared/utils/soundManager";
import { useAuth } from "@shared/auth/useAuth";

type TabId = "home" | "pulse" | "tourney" | "collect" | "profile";

const PRIMARY_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "home",    label: "Play",    icon: "⚡" },
  { id: "collect", label: "Collect", icon: "🃏" },
  { id: "profile", label: "Profile", icon: "👤" },
];

const OVERFLOW_TABS: { id: TabId; label: string; icon: string; soon: boolean }[] = [
  { id: "pulse",   label: "Pulse",   icon: "📈", soon: true },
  { id: "tourney", label: "Tourney", icon: "🏆", soon: true },
];

type Props = {
  sportLabel?: string;
  onCollect?: () => void;
  onProfile?: () => void;
  onBell?: () => void;
  hasUncollected?: boolean;
  unreadInboxCount?: number;
};

export function AppHeader({
  sportLabel,
  onCollect,
  onProfile,
  onBell,
  hasUncollected,
  unreadInboxCount = 0,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [muted, setMuted] = useState(soundManager.isMuted());
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const { isAnonymous } = useAuth();

  // Click-outside to close overflow dropdown
  useEffect(() => {
    if (!overflowOpen) return;
    function onDocClick(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [overflowOpen]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>

      {/* Wordmark + mute + optional sport badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 2 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 950, letterSpacing: -0.5, color: "#EAF0FF" }}>REPLAY</span>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: "#FFB14A", marginLeft: 2 }}>IFS</span>
        </div>
        <span
          onClick={(e) => { e.stopPropagation(); soundManager.toggleMute(); setMuted(soundManager.isMuted()); }}
          style={{ fontSize: 14, cursor: "pointer", opacity: 0.5, userSelect: "none" }}
        >{muted ? "🔇" : "🔊"}</span>
        {sportLabel && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
            color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
            border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, padding: "1px 5px",
          }}>{sportLabel}</span>
        )}
      </div>

      {/* Right cluster: primary tabs · overflow · bell */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {PRIMARY_TABS.map(({ id, label, icon }) => {
          const active   = activeTab === id;
          const isCollect = id === "collect";
          function handleClick() {
            if (isCollect) { onCollect?.(); return; }
            if (id === "profile") { onProfile?.(); return; }
            setActiveTab(id);
          }
          return (
            <div key={id} style={{ position: "relative" }}>
              <button
                onClick={handleClick}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                  padding: "3px 8px",
                  background: active ? "rgba(255,177,74,0.12)" : "transparent",
                  border: active ? "1px solid rgba(255,177,74,0.3)" : "1px solid transparent",
                  borderRadius: 8, cursor: "pointer",
                  transition: "all 150ms ease", minWidth: 40,
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
                <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: active ? "#FFB14A" : "#EAF0FF" }}>
                  {label}
                </span>
              </button>
              {isCollect && hasUncollected && (
                <div style={{
                  position: "absolute", top: 0, right: 2,
                  width: 7, height: 7, borderRadius: "50%",
                  background: "#EF4444", border: "1.5px solid #070A12",
                  pointerEvents: "none",
                }} />
              )}
            </div>
          );
        })}

        {/* Overflow ⋮ */}
        <div ref={overflowRef} style={{ position: "relative" }}>
          <button
            onClick={() => setOverflowOpen((v) => !v)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "3px 8px", minWidth: 32,
              background: overflowOpen ? "rgba(255,177,74,0.12)" : "transparent",
              border: overflowOpen ? "1px solid rgba(255,177,74,0.3)" : "1px solid transparent",
              borderRadius: 8, cursor: "pointer",
              fontSize: 16, color: overflowOpen ? "#FFB14A" : "#7c8aa3",
            }}
            aria-label="More"
          >⋮</button>
          {overflowOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0,
              minWidth: 148, background: "#11192b",
              border: "1px solid #2a3550", borderRadius: 8,
              boxShadow: "0 8px 18px rgba(0,0,0,0.5)",
              overflow: "hidden", zIndex: 100,
            }}>
              {OVERFLOW_TABS.map(({ id, label, icon, soon }, i) => (
                <div key={id} style={{
                  padding: "8px 10px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderBottom: i < OVERFLOW_TABS.length - 1 ? "1px solid #1c2540" : "none",
                  cursor: soon ? "default" : "pointer", opacity: soon ? 0.55 : 1,
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>{icon} {label}</span>
                  {soon && (
                    <span style={{
                      fontSize: 8, color: "#FFB14A",
                      border: "1px solid rgba(255,177,74,0.3)", borderRadius: 3,
                      padding: "1px 4px",
                    }}>SOON</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bell — hidden when anonymous */}
        {!isAnonymous && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => onBell?.()}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "3px 8px", minWidth: 32, background: "transparent",
                border: "1px solid transparent", borderRadius: 8, cursor: "pointer",
                fontSize: 14,
              }}
              aria-label="Inbox"
            >🔔</button>
            {unreadInboxCount > 0 && (
              <div style={{
                position: "absolute", top: 0, right: 2,
                width: 7, height: 7, borderRadius: "50%",
                background: "#EF4444", border: "1.5px solid #070A12",
                pointerEvents: "none",
              }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke**

```bash
npm run dev
```

Open the dev URL. Confirm:
- 3 primary tabs visible (Play, Collect, Profile) — Pulse and Tourney are gone from the tab row
- ⋮ button visible after Profile; clicking it opens a dropdown with Pulse·SOON and Tourney·SOON
- Click outside the dropdown → closes
- 🔔 visible when signed-in; hidden when anonymous (toggle by signing out via DevTools or testing in incognito)
- No console errors

- [ ] **Step 3: Commit**

```bash
git add shared/components/AppHeader.tsx
git commit -m "feat(header): collapse 5 tabs to 3 + ⋮ overflow + bell button"
```

---

## Task 4: `shared/inbox/BellSheet.tsx` — header bell popover

**Files:**
- Create: `shared/inbox/BellSheet.tsx`

- [ ] **Step 1: Create the popover**

```tsx
// shared/inbox/BellSheet.tsx
// Slim popover triggered by the header bell. Shows latest 3 messages + "View all on Profile →".
// Same fetch on open; no realtime subscription.

import { useEffect, useState } from "react";
import { listMessages, markRead, type InboxMessage } from "./inbox";
import { track } from "@shared/analytics/analytics";

type Props = {
  userId: string;
  onClose: () => void;
  onViewAll: () => void;
};

export function BellSheet({ userId, onClose, onViewAll }: Props) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listMessages(userId).then((all) => {
      if (cancelled) return;
      setMessages(all.slice(0, 3));
      setLoading(false);
      const unread = all.filter((m) => m.read_at == null).length;
      track('inbox', 'opened', { source: 'bell', unread_count: unread }, 'system');
      // Auto-mark visible-in-popover as read after 1.5s
      const timer = setTimeout(() => {
        all.slice(0, 3).filter((m) => m.read_at == null).forEach((m) => {
          markRead(m.id);
          track('inbox', 'message_read', { message_type: m.message_type }, 'system');
        });
      }, 1500);
      return () => clearTimeout(timer);
    });
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 90, background: "transparent",
      }} />
      <div style={{
        position: "fixed", top: 56, right: 12,
        width: 320, maxWidth: "calc(100vw - 24px)",
        background: "#11192b", border: "1px solid #2a3550", borderRadius: 10,
        boxShadow: "0 12px 28px rgba(0,0,0,0.55)", zIndex: 100,
        padding: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#EAF0FF", letterSpacing: 0.5 }}>📬 INBOX</div>
          <span onClick={onClose} style={{ fontSize: 14, color: "#7c8aa3", cursor: "pointer" }}>×</span>
        </div>

        {loading && <div style={{ fontSize: 11, color: "#7c8aa3", padding: 8 }}>Loading...</div>}

        {!loading && messages.length === 0 && (
          <div style={{ fontSize: 11, color: "#7c8aa3", padding: 12, textAlign: "center" }}>
            No messages yet.
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} style={{
            border: "1px solid #2a3550", borderRadius: 6, padding: 8, marginBottom: 6,
            background: m.read_at == null ? "rgba(239,68,68,0.04)" : "#0d1320",
          }}>
            {m.payload.title && (
              <div style={{ fontSize: 11, fontWeight: 700, color: "#EAF0FF", marginBottom: 2 }}>
                {iconFor(m.message_type)} {m.payload.title}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.4 }}>{m.payload.body}</div>
          </div>
        ))}

        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: "1px dashed #2a3550",
          textAlign: "right", fontSize: 11, color: "#FFB14A", cursor: "pointer",
        }} onClick={() => { onViewAll(); onClose(); }}>
          View all on Profile →
        </div>
      </div>
    </>
  );
}

function iconFor(type: InboxMessage["message_type"]): string {
  switch (type) {
    case 'welcome':     return '👋';
    case 'big_win':     return '🎉';
    case 'bonus_pool':  return '💰';
    case 'promo':       return '📢';
    case 'survey':      return '📋';
  }
}
```

- [ ] **Step 2: Commit (component is unmounted at this point — wired in Task 6)**

```bash
git add shared/inbox/BellSheet.tsx
git commit -m "feat(inbox): BellSheet popover component"
```

---

## Task 5: `shared/inbox/InboxCard.tsx` — Profile inline card

**Files:**
- Create: `shared/inbox/InboxCard.tsx`

- [ ] **Step 1: Create the card + anon placeholder + survey-answer subcomponent**

```tsx
// shared/inbox/InboxCard.tsx
// Inline inbox card on Profile. Renders all messages. Auto-marks read 1.5s after mount.
// Anonymous variant renders a sign-up nudge instead.
// Feedback footer link is feature-flag gated.

import { useEffect, useState } from "react";
import {
  listMessages, markRead, submitSurveyResponse,
  type InboxMessage, type SurveyPayload,
} from "./inbox";
import { track } from "@shared/analytics/analytics";

const FEEDBACK_FLAG = (import.meta.env.VITE_FEATURE_FEEDBACK_FORM ?? "0") === "1";

type Props = {
  userId: string;
  isAnonymous: boolean;
  onSaveAccount: () => void;
  onOpenFeedback: () => void;
};

export function InboxCard({ userId, isAnonymous, onSaveAccount, onOpenFeedback }: Props) {
  if (isAnonymous) {
    return <InboxAnonPlaceholder onSaveAccount={onSaveAccount} />;
  }
  return <InboxCardSignedIn userId={userId} onOpenFeedback={onOpenFeedback} />;
}

// ---------- Anonymous placeholder ----------

function InboxAnonPlaceholder({ onSaveAccount }: { onSaveAccount: () => void }) {
  return (
    <div style={{
      border: "1px solid #2a3550", borderRadius: 10, padding: 14, background: "#11192b",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#EAF0FF", marginBottom: 6 }}>📬 INBOX</div>
      <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.45, marginBottom: 10 }}>
        Save your account to start receiving messages from the team — recaps, news, and the occasional question.
      </div>
      <button onClick={onSaveAccount} style={{
        background: "#FFB14A", color: "#0d1320", border: "none", borderRadius: 6,
        padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
      }}>Save account</button>
    </div>
  );
}

// ---------- Signed-in card ----------

function InboxCardSignedIn({ userId, onOpenFeedback }: { userId: string; onOpenFeedback: () => void }) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listMessages(userId).then((all) => {
      if (cancelled) return;
      setMessages(all);
      setLoading(false);
      const unread = all.filter((m) => m.read_at == null).length;
      track('inbox', 'opened', { source: 'profile', unread_count: unread }, 'system');
      // Auto-mark all-visible as read after 1.5s
      const timer = setTimeout(() => {
        all.filter((m) => m.read_at == null).forEach((m) => {
          markRead(m.id);
          track('inbox', 'message_read', { message_type: m.message_type }, 'system');
        });
      }, 1500);
      return () => clearTimeout(timer);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const unreadCount = messages.filter((m) => m.read_at == null).length;
  const hasUnread = unreadCount > 0;

  return (
    <div style={{
      border: hasUnread ? "2px solid #EF4444" : "1px solid #2a3550",
      borderRadius: 10, padding: 14,
      background: hasUnread ? "rgba(239,68,68,0.04)" : "#11192b",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#EAF0FF", letterSpacing: 0.5 }}>
          📬 INBOX{hasUnread ? ` · ${unreadCount} new` : ""}
        </div>
      </div>

      {loading && <div style={{ fontSize: 11, color: "#7c8aa3", padding: 8 }}>Loading...</div>}

      {!loading && messages.length === 0 && (
        <div style={{ fontSize: 11, color: "#7c8aa3", padding: 12, textAlign: "center" }}>
          No messages yet — we'll be in touch.
        </div>
      )}

      {messages.map((m) => <MessageItem key={m.id} message={m} />)}

      <div style={{
        marginTop: 10, paddingTop: 8, borderTop: "1px dashed #2a3550",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        {FEEDBACK_FLAG ? (
          <span onClick={() => { onOpenFeedback(); track('inbox', 'feedback_modal_opened', {}, 'system'); }}
                style={{ fontSize: 11, color: "#FFB14A", cursor: "pointer" }}>
            💬 Send feedback ✏️
          </span>
        ) : <span />}
        <span style={{ fontSize: 10, color: "#7c8aa3" }}>
          {messages.length} message{messages.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

// ---------- Single message renderer ----------

function MessageItem({ message }: { message: InboxMessage }) {
  const isUnread = message.read_at == null;
  const survey = message.payload.survey;

  return (
    <div style={{
      border: survey ? "1px solid #FFB14A" : "1px solid #2a3550",
      borderRadius: 6, padding: 8, marginTop: 6,
      background: isUnread ? "rgba(239,68,68,0.04)" : "#0d1320",
    }}>
      {message.payload.title && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#EAF0FF", marginBottom: 4 }}>
          <span>{iconFor(message.message_type)}</span>
          <span>{message.payload.title}</span>
          {isUnread && <span style={{ marginLeft: "auto", width: 6, height: 6, background: "#EF4444", borderRadius: "50%" }} />}
        </div>
      )}
      <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.45 }}>{message.payload.body}</div>

      {message.payload.cta && (
        <button
          onClick={() => track('inbox', 'cta_clicked', { message_type: message.message_type, cta_url: message.payload.cta!.url }, 'system')}
          style={{
            marginTop: 6, padding: "4px 10px", fontSize: 11,
            background: "#FFB14A", color: "#0d1320", border: "none", borderRadius: 4, cursor: "pointer",
          }}
        >{message.payload.cta.label}</button>
      )}

      {survey && <SurveyAnswerBlock messageId={message.id} survey={survey} />}
    </div>
  );
}

function SurveyAnswerBlock({ messageId, survey }: { messageId: string; survey: SurveyPayload }) {
  const [response, setResponse] = useState<string | string[] | undefined>(survey.response);
  const answered = response !== undefined && response !== "" && (!Array.isArray(response) || response.length > 0);

  function pickSingle(opt: string) {
    setResponse(opt);
    submitSurveyResponse(messageId, opt);
    track('inbox', 'survey_answered', { inbox_message_id: messageId, answer: opt }, 'system');
  }

  function toggleMulti(opt: string) {
    const current = Array.isArray(response) ? response : [];
    const next = current.includes(opt) ? current.filter((x) => x !== opt) : [...current, opt];
    setResponse(next);
    submitSurveyResponse(messageId, next);
    track('inbox', 'survey_answered', { inbox_message_id: messageId, answer: next.join('|') }, 'system');
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: "#EAF0FF", marginBottom: 6 }}>{survey.question}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {survey.options.map((opt) => {
          const selected = survey.type === 'single'
            ? response === opt
            : Array.isArray(response) && response.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => survey.type === 'single' ? pickSingle(opt) : toggleMulti(opt)}
              style={{
                fontSize: 11, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                background: selected ? "rgba(255,177,74,0.18)" : "transparent",
                border: selected ? "1px solid #FFB14A" : "1px solid #2a3550",
                color: "#EAF0FF",
              }}
            >{opt}{selected ? " ✓" : ""}</button>
          );
        })}
      </div>
      {answered && (
        <div style={{ fontSize: 10, color: "#7c8aa3", marginTop: 6 }}>Thanks — answer saved.</div>
      )}
    </div>
  );
}

function iconFor(type: InboxMessage["message_type"]): string {
  switch (type) {
    case 'welcome':     return '👋';
    case 'big_win':     return '🎉';
    case 'bonus_pool':  return '💰';
    case 'promo':       return '📢';
    case 'survey':      return '📋';
  }
}
```

- [ ] **Step 2: Commit (component is unmounted — wired in Task 6)**

```bash
git add shared/inbox/InboxCard.tsx
git commit -m "feat(inbox): InboxCard component with anon placeholder + survey answer UI"
```

---

## Task 6: Mount InboxCard on Profile + wire BellSheet to AppHeader

**Files:**
- Modify: `shared/components/ProfileScreen.tsx`
- Modify: `basketball/src/views/GameView.tsx` (or wherever AppHeader/ProfileScreen are rendered together — find via grep)

- [ ] **Step 1: Insert InboxCard into ProfileScreen**

Open `shared/components/ProfileScreen.tsx`. Locate the section ordering (Identity card → Save Account → Today's Standing → Invite Friends → Personal Bests). Insert the inbox card between **Identity card** and **Today's Standing**.

Add to the imports at the top:

```ts
import { InboxCard } from "@shared/inbox/InboxCard";
```

Add a prop to the `ProfileScreen` props type:

```ts
type Props = {
  // ... existing props
  onOpenFeedback: () => void;
};
```

Inside the component body, between the Identity card JSX and the Today's Standing JSX, add:

```tsx
<InboxCard
  userId={currentUid}
  isAnonymous={isAnonymous}
  onSaveAccount={onSaveAccount ?? (() => {})}
  onOpenFeedback={onOpenFeedback}
/>
```

(The `currentUid`, `isAnonymous`, and `onSaveAccount` props already exist on ProfileScreen per the existing code.)

- [ ] **Step 2: Locate AppHeader render site and wire bell + sheet**

```bash
grep -rn "AppHeader" /Users/john/Desktop/ReplayMod-inbox/basketball/src/ /Users/john/Desktop/ReplayMod-inbox/baseball/src/ /Users/john/Desktop/ReplayMod-inbox/worldcup/src/
```

You'll find it imported and rendered in each sport's `GameView.tsx` (or similar). For each, do the wiring. Below shows the basketball version — apply the same pattern to baseball/worldcup.

In `basketball/src/views/GameView.tsx` (or wherever AppHeader is rendered):

```tsx
import { useState, useEffect } from "react";
import { BellSheet } from "@shared/inbox/BellSheet";
import { listMessages } from "@shared/inbox/inbox";
import { useAuth } from "@shared/auth/useAuth";
import { track } from "@shared/analytics/analytics";

// Inside the component:
const { user, isAnonymous } = useAuth();
const [bellOpen, setBellOpen] = useState(false);
const [unreadCount, setUnreadCount] = useState(0);

// Refresh unread count on mount + when bell sheet closes
useEffect(() => {
  if (!user || isAnonymous) { setUnreadCount(0); return; }
  listMessages(user.id).then((all) => {
    setUnreadCount(all.filter((m) => m.read_at == null).length);
  });
}, [user, isAnonymous, bellOpen]);

// In the JSX where <AppHeader ... /> is rendered, add:
<AppHeader
  /* ...existing props... */
  unreadInboxCount={unreadCount}
  onBell={() => { setBellOpen(true); track('nav', 'bell_clicked', { unread_count: unreadCount }, 'system'); }}
/>

{bellOpen && user && (
  <BellSheet
    userId={user.id}
    onClose={() => setBellOpen(false)}
    onViewAll={() => onProfile?.()}  // existing onProfile already opens ProfileScreen
  />
)}
```

Pass `onOpenFeedback` to `ProfileScreen` from the same site:

```tsx
const [feedbackOpen, setFeedbackOpen] = useState(false);

<ProfileScreen
  /* ...existing props... */
  onOpenFeedback={() => setFeedbackOpen(true)}
/>

{feedbackOpen && user && (
  // FeedbackModal mounted here in Task 9; for now leave a TODO comment
  // and skip rendering — keeping the wiring shell ready
  null
)}
```

- [ ] **Step 3: Manual smoke**

```bash
npm run dev
```

Confirm:
- Bell shows red dot if there are unread messages (insert one via dashboard if needed: `INSERT INTO inbox_messages (user_id, message_type, payload) VALUES ('<your uid>', 'promo', '{"body":"Test message"}'::jsonb);`)
- Tap bell → popover shows up to 3 messages + "View all on Profile →"
- Tap "View all" → bell closes, Profile opens
- Profile shows the inbox card between Identity and Today's Standing
- After 1.5s on Profile, the red dot count drops (messages marked read)
- For an anonymous user, bell is hidden and Profile shows the "Save your account..." placeholder

- [ ] **Step 4: Commit**

```bash
git add shared/components/ProfileScreen.tsx basketball/src/views/GameView.tsx
git commit -m "feat(inbox): mount InboxCard on Profile, wire BellSheet to header"
```

---

## Task 7: Welcome message trigger in RegisterModal

**Files:**
- Modify: `shared/components/RegisterModal.tsx`

- [ ] **Step 1: Locate the post-signup success branches**

```bash
grep -n "signUp\|linkGoogle\|signIn" /Users/john/Desktop/ReplayMod-inbox/shared/components/RegisterModal.tsx | head
```

You're looking for the spots where a *new* user is created — the `signUp` (email path) and `linkGoogle` (anonymous → Google upgrade) success branches.

- [ ] **Step 2: Call `addWelcomeMessage` after each new-user creation**

Add to imports:
```ts
import { addWelcomeMessage } from "@shared/inbox/inbox";
import { supabase } from "@shared/lib/supabase";
```

In the `signUp` success branch (after the auth user is confirmed created, e.g. after the `signUp` callback resolves with no error):

```ts
// Insert welcome message for the new user
const { data: { user } } = await supabase.auth.getUser();
if (user) await addWelcomeMessage(user.id);
```

In the `linkGoogle` success branch (after a successful link / new-user-via-OAuth case):

```ts
const { data: { user } } = await supabase.auth.getUser();
if (user) await addWelcomeMessage(user.id);
```

(For OAuth-link flows the welcome appears even if the user was anonymous before — per the design, "anonymous user becomes signed-in" creates the welcome row. If there's later a need to suppress duplicate welcomes for already-signed-in users, gate by checking whether the user has any inbox row already; not required in v1.)

- [ ] **Step 3: Manual smoke**

1. Sign up with a fresh email → check `inbox_messages` in Supabase dashboard, should have 1 row with `message_type='welcome'`
2. Open Profile → "Welcome to ReplayMod" message should be the first card
3. Bell red dot lights up; goes away 1.5s after viewing

- [ ] **Step 4: Commit**

```bash
git add shared/components/RegisterModal.tsx
git commit -m "feat(inbox): welcome message inserted on signup + Google link"
```

---

## Task 8: Big-win trigger in GameView

**Files:**
- Modify: `basketball/src/views/GameView.tsx` (existing call site at line 177)

- [ ] **Step 1: Add the big-win insert**

Find the existing block at `basketball/src/views/GameView.tsx:177` that does `await supabase.from("hand_log").insert(...)`. After that insert succeeds, add:

```ts
import { addBigWinMessage } from "@shared/inbox/inbox";

// (add after the existing hand_log.insert success path)
if (tier === 'MVP+' || tier === 'LEGEND') {
  const handIdGuess = `hand-${Date.now()}`; // existing code may have a hand_id var; use it if available
  await addBigWinMessage(uid, { tier, fp: totalFp, hand_id: handIdGuess });
}
```

If a real `hand_id` value is available in scope (check whether `handResult.id` or similar exists nearby), use that instead of `handIdGuess`.

- [ ] **Step 2: Mirror to baseball + worldcup if they also insert hand_log**

```bash
grep -rn "hand_log" /Users/john/Desktop/ReplayMod-inbox/baseball/src/ /Users/john/Desktop/ReplayMod-inbox/worldcup/src/
```

If found, apply the same pattern. If not (per memory, baseball doesn't have full auth wiring yet), skip — the message simply won't fire for baseball until that wiring lands.

- [ ] **Step 3: Manual smoke**

Play hands until you hit MVP+ or LEGEND tier (or temporarily lower the tier threshold for testing). Confirm:
- A new row in `inbox_messages` with `message_type='big_win'`
- Profile inbox card shows the 🎉 message
- Bell red dot lights up

- [ ] **Step 4: Commit**

```bash
git add basketball/src/views/GameView.tsx
git commit -m "feat(inbox): big-win message inserted after MVP+/LEGEND hand_log row"
```

---

## Task 9: FeedbackModal — UI scaffold + placeholder questions

**Files:**
- Create: `shared/inbox/FeedbackModal.tsx`

- [ ] **Step 1: Create the modal with placeholder questions and renderers**

```tsx
// shared/inbox/FeedbackModal.tsx
// Multi-question feedback modal. Questions live in a config array — content is
// intentionally placeholder for v1; finalize before flipping the feature flag.
// 100-coin reward on first submission; re-submissions get a "thanks for the update".

import { useState } from "react";
import {
  getSubmissionNumber, submitFeedback, grantFeedbackCoins,
  type FeedbackAnswers, type FeedbackMetadata,
} from "./inbox";
import { track } from "@shared/analytics/analytics";

type Question =
  | { id: string; type: 'single';   label: string; options: string[]; required?: boolean }
  | { id: string; type: 'multi';    label: string; options: string[]; required?: boolean }
  | { id: string; type: 'rating';   label: string; min: number; max: number; required?: boolean }
  | { id: string; type: 'freetext'; label: string; placeholder?: string; required?: boolean };

const FEEDBACK_QUESTIONS: Question[] = [
  // PLACEHOLDER — replace before flipping the feature flag.
  // See spec "Rollout & feature flag" section.
  { id: 'general',   type: 'single',   label: 'How are you finding ReplayMod so far?',
    options: ['Loving it', 'Pretty good', 'Mixed', 'Not great', 'Confused'] },
  { id: 'pain',      type: 'multi',    label: 'Anything bugging you? (pick any)',
    options: ['Rules unclear', 'Too slow', 'UI clunky', 'Not enough sports', 'Nothing major'] },
  { id: 'wishlist',  type: 'freetext', label: 'One feature you wish existed (optional)',
    placeholder: "e.g., 'multiplayer', 'NFL', 'rematch button'..." },
];

const COIN_REWARD = 100;

type Props = {
  userId: string;
  onClose: () => void;
  metadata?: FeedbackMetadata;
};

export function FeedbackModal({ userId, onClose, metadata = {} }: Props) {
  const [answers, setAnswers] = useState<FeedbackAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ coinsGranted: number } | null>(null);

  function setAnswer(id: string, value: FeedbackAnswers[string]) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    const submissionNumber = await getSubmissionNumber(userId);
    await submitFeedback(userId, answers, submissionNumber, metadata);
    let coinsGranted = 0;
    if (submissionNumber === 1) {
      await grantFeedbackCoins(COIN_REWARD);
      coinsGranted = COIN_REWARD;
    }
    track('inbox', 'feedback_submitted', {
      submission_number: submissionNumber,
      has_freetext: typeof answers['wishlist'] === 'string' && (answers['wishlist'] as string).trim().length > 0,
      completed_questions: Object.keys(answers).length,
    }, 'system');
    setDone({ coinsGranted });
    setSubmitting(false);
  }

  function handleDismiss() {
    if (!done) {
      track('inbox', 'feedback_dismissed', { questions_filled: Object.keys(answers).length }, 'system');
    }
    onClose();
  }

  return (
    <>
      <div onClick={handleDismiss} style={{
        position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.65)",
      }} />
      <div style={{
        position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        width: "90%", maxWidth: 380, maxHeight: "90vh", overflowY: "auto",
        background: "#11192b", border: "1px solid #2a3550", borderRadius: 10,
        padding: 16, zIndex: 120,
      }}>
        {done ? (
          <DoneScreen coinsGranted={done.coinsGranted} onClose={onClose} />
        ) : (
          <FormScreen
            questions={FEEDBACK_QUESTIONS}
            answers={answers}
            onAnswer={setAnswer}
            onSubmit={handleSubmit}
            onCancel={handleDismiss}
            submitting={submitting}
          />
        )}
      </div>
    </>
  );
}

// ---------- Form ----------

function FormScreen({
  questions, answers, onAnswer, onSubmit, onCancel, submitting,
}: {
  questions: Question[];
  answers: FeedbackAnswers;
  onAnswer: (id: string, v: FeedbackAnswers[string]) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#EAF0FF" }}>💬 Help shape ReplayMod</div>
          <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4, lineHeight: 1.45 }}>
            You're one of our first players. We read every answer.
          </div>
        </div>
        <span onClick={onCancel} style={{ fontSize: 14, color: "#7c8aa3", cursor: "pointer", marginLeft: 8 }}>×</span>
      </div>

      <div style={{
        margin: "10px 0 14px", padding: "8px 10px",
        border: "1px solid rgba(255,177,74,0.4)", borderRadius: 6,
        background: "rgba(255,177,74,0.08)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>🪙</span>
        <div style={{ fontSize: 11, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600, color: "#FFB14A" }}>+{COIN_REWARD} coins on submit</div>
          <div style={{ color: "#cbd5e1", opacity: 0.8 }}>First time only — about 1 free hand on us.</div>
        </div>
      </div>

      {questions.map((q, i) => (
        <div key={q.id} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#EAF0FF", marginBottom: 6 }}>
            {i + 1} · {q.label}
            {q.type === 'multi' && <span style={{ fontWeight: 400, color: "#7c8aa3", marginLeft: 6 }}>(pick any)</span>}
            {!q.required && q.type === 'freetext' && <span style={{ fontWeight: 400, color: "#7c8aa3", marginLeft: 6 }}>(optional)</span>}
          </div>

          {q.type === 'single' && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {q.options.map((opt) => {
                const selected = answers[q.id] === opt;
                return (
                  <button key={opt} onClick={() => onAnswer(q.id, opt)} style={chipStyle(selected)}>
                    {opt}{selected ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === 'multi' && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {q.options.map((opt) => {
                const current = (answers[q.id] as string[] | undefined) ?? [];
                const selected = current.includes(opt);
                return (
                  <button key={opt} onClick={() => {
                    const next = selected ? current.filter((x) => x !== opt) : [...current, opt];
                    onAnswer(q.id, next);
                  }} style={chipStyle(selected)}>
                    {opt}{selected ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === 'rating' && (
            <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              {Array.from({ length: q.max - q.min + 1 }, (_, k) => k + q.min).map((n) => {
                const selected = answers[q.id] === n;
                return (
                  <button key={n} onClick={() => onAnswer(q.id, n)} style={{
                    ...chipStyle(selected), minWidth: 24, padding: "3px 6px", fontSize: 10,
                  }}>{n}</button>
                );
              })}
            </div>
          )}

          {q.type === 'freetext' && (
            <textarea
              value={(answers[q.id] as string | undefined) ?? ""}
              onChange={(e) => onAnswer(q.id, e.target.value)}
              placeholder={q.placeholder}
              style={{
                width: "100%", minHeight: 60, fontSize: 11, padding: 6,
                background: "#0d1320", color: "#EAF0FF",
                border: "1px solid #2a3550", borderRadius: 4, resize: "none",
              }}
            />
          )}
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: "#7c8aa3" }}>🪙 +{COIN_REWARD} on submit</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onCancel} disabled={submitting} style={{
            fontSize: 11, padding: "6px 12px",
            background: "transparent", border: "1px solid #2a3550",
            color: "#7c8aa3", borderRadius: 4, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={onSubmit} disabled={submitting} style={{
            fontSize: 12, fontWeight: 600, padding: "6px 14px",
            background: "#FFB14A", color: "#0d1320", border: "none",
            borderRadius: 4, cursor: submitting ? "wait" : "pointer",
          }}>{submitting ? "Sending..." : "Send to the team"}</button>
        </div>
      </div>
    </>
  );
}

function chipStyle(selected: boolean): React.CSSProperties {
  return {
    fontSize: 11, padding: "4px 9px", borderRadius: 4, cursor: "pointer",
    background: selected ? "rgba(255,177,74,0.18)" : "transparent",
    border: selected ? "1px solid #FFB14A" : "1px solid #2a3550",
    color: "#EAF0FF",
  };
}

// ---------- Done screen ----------

function DoneScreen({ coinsGranted, onClose }: { coinsGranted: number; onClose: () => void }) {
  const isFirst = coinsGranted > 0;
  return (
    <div style={{ textAlign: "center", padding: "20px 8px" }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>{isFirst ? "🪙" : "📬"}</div>
      {isFirst ? (
        <div style={{ fontSize: 18, fontWeight: 700, color: "#FFB14A", marginBottom: 6 }}>+{coinsGranted} coins added</div>
      ) : (
        <div style={{ fontSize: 16, fontWeight: 600, color: "#EAF0FF", marginBottom: 6 }}>Thanks for the update</div>
      )}
      <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5, marginBottom: 14 }}>
        {isFirst
          ? "Got it — we read every one. Watch your inbox 📬 — that's where we'll respond."
          : "Your earlier reward stands. We'll factor in your latest answers."}
      </div>
      <button onClick={onClose} style={{
        fontSize: 12, padding: "8px 16px",
        background: "#FFB14A", color: "#0d1320", border: "none",
        borderRadius: 4, cursor: "pointer", fontWeight: 600,
      }}>Back to game</button>
    </div>
  );
}
```

- [ ] **Step 2: Wire FeedbackModal where the bell + ProfileScreen are mounted**

In the same parent component as Task 6 (`basketball/src/views/GameView.tsx`):

```tsx
import { FeedbackModal } from "@shared/inbox/FeedbackModal";

// Replace the `null` placeholder from Task 6 with:
{feedbackOpen && user && (
  <FeedbackModal
    userId={user.id}
    onClose={() => setFeedbackOpen(false)}
    metadata={{ sport: 'basketball' }}
  />
)}
```

- [ ] **Step 3: Manual smoke (with feature flag ON)**

Set `VITE_FEATURE_FEEDBACK_FORM=1` in `basketball/.env.local` and restart dev server.

1. Open Profile → "💬 Send feedback ✏️" link visible at bottom of inbox card
2. Click → modal opens with 3 placeholder questions and the +100 coin callout
3. Pick answers, click "Send to the team"
4. Confirmation screen shows "+100 coins added" (first time)
5. Reopen modal, submit again → confirmation says "Thanks for the update" (no coin grant)
6. Verify in Supabase: 2 rows in `feedback_submissions`, `submission_number` = 1 and 2; `player_state.balance` increased by exactly 100

- [ ] **Step 4: Commit**

```bash
git add shared/inbox/FeedbackModal.tsx basketball/src/views/GameView.tsx
git commit -m "feat(inbox): FeedbackModal — placeholder questions + 100-coin reward flow"
```

---

## Task 10: Feature flag default + .env.example documentation

**Files:**
- Modify: `basketball/.env.local` (already gitignored — local only) and document in repo

- [ ] **Step 1: Confirm flag default behavior**

The `InboxCard` reads `import.meta.env.VITE_FEATURE_FEEDBACK_FORM ?? "0"`. Without the env var set, the feedback footer link is hidden — exactly the safe default for shipping infrastructure without exposing the form.

- [ ] **Step 2: Document the flag**

If a `.env.example` or `.env.local.example` exists in `basketball/`, add a line:

```
# Feedback form (inbox card footer). Set to 1 to expose to users.
VITE_FEATURE_FEEDBACK_FORM=0
```

If not, add a short note to the spec or to the repo README under "Feature flags." (Optional — the flag is self-documenting in `InboxCard.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add basketball/.env.example  # only if you created/modified it
git commit -m "chore(inbox): document VITE_FEATURE_FEEDBACK_FORM flag"
```

(Skip the commit if no files changed.)

---

## Task 11: PostHog event surface — verify Feature enum coverage

**Files:**
- Modify (maybe): `shared/analytics/analytics.ts`

- [ ] **Step 1: Inspect the existing Feature/Product enums**

```bash
grep -n "type Feature\|type Product\|Feature =" /Users/john/Desktop/ReplayMod-inbox/shared/analytics/analytics.ts
```

The events emitted across this implementation use:
- Feature: `'inbox'`, `'nav'`
- Product: `'system'`

If `'inbox'` and `'nav'` are not already in the Feature union, add them. Same for `'system'` if missing. (Per the explore report, the existing enum already includes `'auth'`, `'gameplay'`, `'profile'`, `'notifications'`, `'onboarding'` — `'inbox'` and `'nav'` are likely new.)

Example edit:

```ts
// before
type Feature = 'gameplay' | 'auth' | 'profile' | 'notifications' | 'onboarding';

// after
type Feature = 'gameplay' | 'auth' | 'profile' | 'notifications' | 'onboarding' | 'inbox' | 'nav';
```

- [ ] **Step 2: Run typecheck**

```bash
npm test
```

Expected: all tests still pass; no TS compile errors propagate (vitest uses esbuild — type errors only surface in IDE / dedicated tsc run; checking for any new failures is enough here).

- [ ] **Step 3: Commit**

```bash
git add shared/analytics/analytics.ts
git commit -m "chore(analytics): extend Feature enum with inbox + nav"
```

(Skip if no change needed.)

---

## Task 12: Smoke test — end-to-end pass

**No file changes — manual verification of the full flow.**

- [ ] **Step 1: Reset to a clean state**

Either use a fresh email signup or, in Supabase dashboard, delete your test user's `inbox_messages` and `feedback_submissions` rows so you start clean.

- [ ] **Step 2: Walk the happy path**

1. Sign up with a fresh email
2. Welcome message appears on Profile inbox card; bell red dot lights up; 1.5s after viewing Profile, dot disappears
3. Insert a fake big-win row via dashboard if you can't easily hit MVP+/LEGEND in a play session:
   ```sql
   insert into inbox_messages (user_id, message_type, payload)
   values ('<your uid>', 'big_win', '{"title":"MVP+ hand","body":"42.0 fp — top of the day.","tier":"MVP+","fp":42,"hand_id":"test"}'::jsonb);
   ```
4. Bell red dot returns; tapping bell shows the popover with welcome + big-win + "View all on Profile →"
5. Tap "View all" → Profile opens; both messages visible in the card
6. Insert a survey row:
   ```sql
   insert into inbox_messages (user_id, message_type, payload)
   values ('<your uid>', 'survey', '{"title":"Quick survey","body":"Which sport do you play most?","survey":{"question":"Pick one","options":["Basketball","Baseball","World Cup"],"type":"single"}}'::jsonb);
   ```
7. Refresh Profile; survey card appears with answer chips. Tap one → chip shows ✓; reload → still selected (response persisted in `payload.survey.response`)
8. With `VITE_FEATURE_FEEDBACK_FORM=1`: footer "💬 Send feedback ✏️" visible. Click → modal opens. Submit → +100 coins; verify `player_state.balance` increased by exactly 100; second submit no coin grant
9. Sign out / open incognito anonymous session → bell hidden, Profile shows "Save your account..." placeholder

- [ ] **Step 3: Walk the error paths**

1. Network offline: open Profile → "Loading..." then either "No messages yet" or stale data; no JS crash
2. Unauthorized insert (in dashboard, try `INSERT INTO inbox_messages (user_id, message_type, payload) VALUES ('<some other uid>', 'promo', '{}')` as the anon role) — should fail with RLS error. Confirms RLS is wired.

- [ ] **Step 4: Commit any tweaks discovered + push**

```bash
# If any fixups were needed during smoke:
git add -p
git commit -m "fix(inbox): <whatever was discovered>"

# Push branch
git push -u origin feature/inbox-header
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "feat: inbox + header reorg" --body "$(cat <<'EOF'
## Summary
- Two-way comms channel: inbox messages (welcome, big-win, bonus-pool, promo, survey) + feedback survey modal with 100-coin reward
- Header collapsed from 5 tabs to 3 + ⋮ overflow + bell on right
- Feedback form gated by `VITE_FEATURE_FEEDBACK_FORM` so question content can land independently
- Migration `003_inbox.sql`: 2 tables, 4 RLS policies, 1 RPC

Spec: docs/superpowers/specs/2026-04-26-inbox-header-design.md

## Test plan
- [ ] Run `003_inbox.sql` via Supabase dashboard SQL editor
- [ ] Sign up with a fresh email → welcome message appears in inbox; bell red-dot lights and clears 1.5s after viewing
- [ ] Force MVP+/LEGEND hand → big-win message lands
- [ ] Header reorg: 3 tabs visible; ⋮ shows Pulse·SOON + Tourney·SOON; click outside closes
- [ ] Bell hidden when anonymous; Profile shows "Save your account" placeholder
- [ ] With `VITE_FEATURE_FEEDBACK_FORM=1`: feedback modal opens; +100 coins on first submit; re-submit grants nothing; player_state.balance verified
- [ ] Survey response persists in `payload.survey.response` after reload

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Summary

| # | Task | Files (new / modified) |
|---|---|---|
| 1 | Migration | `003_inbox.sql` |
| 2 | inbox.ts data module + tests | `shared/inbox/inbox.ts`, `shared/inbox/__tests__/inbox.test.ts` |
| 3 | AppHeader reorg | `shared/components/AppHeader.tsx` |
| 4 | BellSheet | `shared/inbox/BellSheet.tsx` |
| 5 | InboxCard | `shared/inbox/InboxCard.tsx` |
| 6 | Mount + wire | `ProfileScreen.tsx`, `basketball/src/views/GameView.tsx` |
| 7 | Welcome trigger | `RegisterModal.tsx` |
| 8 | Big-win trigger | `basketball/src/views/GameView.tsx` |
| 9 | FeedbackModal + wire | `shared/inbox/FeedbackModal.tsx`, `GameView.tsx` |
| 10 | Feature flag docs | `.env.example` (optional) |
| 11 | Analytics enum | `shared/analytics/analytics.ts` (if needed) |
| 12 | Smoke + PR | (no code) |

12 tasks. ~600 LOC of new code, ~80 LOC of edits. One migration. One feature flag.
