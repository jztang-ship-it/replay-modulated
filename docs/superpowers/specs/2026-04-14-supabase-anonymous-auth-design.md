# Supabase Anonymous Auth — Design Spec

**Date:** 2026-04-14
**Status:** Approved (v2 — revised after pushback)
**Goal:** Frictionless play with anonymous Supabase auth, soft nudges to register, PWA install prompt.

---

## Overview

Users play immediately with no sign-up. A real Supabase anonymous account is created silently **in the background** — the game never waits for auth. The localStorage UID is the primary identity at load time; Supabase UID upgrades it when ready. After high-emotion moments (big wins, leaderboard appearances), soft non-blocking nudges encourage registration (email/Google). Registered or not, all users keep full functionality. A separate PWA "Add to Home Screen" prompt fires on return visits.

---

## Auth Flow

### 1. Non-Blocking Anonymous Sign-In

**Auth catches up to the game, not the other way around.**

On app mount, `AuthProvider` kicks off Supabase session check + anonymous sign-in **in the background**. The game renders immediately using the localStorage `rm_uid` as the working identity. When Supabase resolves (typically <500ms), the UID silently upgrades to the Supabase `user.id`. No loading screen, no blocking, no flash.

```
App mount
  ├── Game renders immediately (uid = localStorage rm_uid)
  └── Background: supabase.auth.getSession()
        ├── Session exists → upgrade uid to user.id
        └── No session → signInAnonymously() → upgrade uid to user.id
              └── Fails? → stay on localStorage uid, retry next load
```

**Supabase project setup required:**
- Enable "Allow anonymous sign-ins" in Authentication → Settings
- Use existing project (same one serving headshot/audio storage)
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### 2. UID Priority (First-Class, Not Fallback)

The localStorage UID is part of the normal flow, not an edge case. UID resolution order:

1. **Supabase `user.id`** — if auth session is ready (preferred, verifiable)
2. **Existing localStorage `rm_uid`** — immediate, always available
3. **Generate new `rm_uid`** — first-ever visit before Supabase resolves

When Supabase resolves after initial load, the system links the localStorage UID to the Supabase UID so any leaderboard entries or analytics submitted under the localStorage UID can be associated later.

### 3. Session Persistence

Supabase stores its session token in localStorage automatically. Returning users get their existing session restored on page load — same UID, same leaderboard position. Multiple tabs share the session.

### 4. Account Upgrade (Registration)

When a user registers, Supabase's `updateUser({ email, password })` or `linkIdentity({ provider: 'google' })` upgrades the anonymous account in place. Same UUID, same row in the DB. No data migration, no duplicate accounts.

---

## Nudge System

All nudges are **one-shot** (fire at most once per user) and **non-blocking** (dismiss button always visible, gameplay continues behind). Tracked via localStorage flags.

**Principle: only interrupt when emotion is HIGH, not just activity.**

| ID | Trigger | Message | When |
|----|---------|---------|------|
| `nudge_big_win` | First ALL_STAR+ tier hit | "Nice hit! Save your progress so you don't lose it." | Post-game result screen |
| `nudge_leaderboard` | First time appearing in **top 25** on any metric | "You're on the board! Claim your spot — add an email." | After leaderboard rank check |
| `nudge_retention` | 12th hand played, still anonymous | "Having fun? Save your account to play on any device." | Return to IDLE after hand 12 |
| `nudge_pwa` | **2nd session** (return visit), OR after successful registration | "Add ReplayMod to your home screen for instant access." | Return to IDLE on session 2+ |

**Nudge rules:**
- Never show during active gameplay (only during IDLE or result screens)
- Never stack two nudges — if multiple trigger simultaneously, fire highest priority (big_win > leaderboard > retention)
- Each nudge stores a `rm_nudge_{id}_shown` localStorage flag once displayed
- If user is already registered, auth nudges never fire. Only PWA nudge can fire for registered users.
- Max 1 auth nudge per session — even if multiple triggers fire in one session, only the first one shows

---

## Registration Modal

Triggered by any auth nudge's CTA button. Minimal bottom sheet or centered modal:

**Contents:**
- Email + password fields
- "Sign up with Google" button (one-tap)
- "Maybe later" dismiss link (always visible, closes modal, gameplay resumes)
- No username field (keep existing random nickname, editable later in profile)

**On success:**
- Anonymous account upgraded in place (same UID)
- Show brief confirmation ("Saved!") then auto-dismiss
- Fire `nudge_pwa` if not yet shown

**On error:**
- Show inline error (e.g. "Email already in use")
- User can retry or dismiss

---

## PWA Install Prompt

**"Add to Home Screen" nudge** — separate from auth nudges.

- Uses the browser's `beforeinstallprompt` event (Chrome/Edge/Samsung)
- For Safari/iOS, shows manual instructions ("Tap Share → Add to Home Screen")
- Fires on **2nd session** (return visit) or immediately after successful registration
- One-shot, tracked via `rm_nudge_pwa_shown`
- Requires: user has spent 2+ minutes in app OR completed 5+ hands (shows intent)

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `shared/lib/supabase.ts` | Supabase client singleton. Reads `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` from env. |
| `shared/auth/AuthProvider.tsx` | React context provider. Kicks off anonymous sign-in in background, exposes `{ user, uid, isAnonymous, isAuthenticated, signUp, linkGoogle }`. **Never blocks rendering.** |
| `shared/auth/useAuth.ts` | `useAuth()` hook — consumes AuthProvider context. |
| `shared/components/RegisterNudge.tsx` | Nudge banner/bottom-sheet component. Receives trigger condition + nudge ID + message. Handles one-shot display logic. |
| `shared/components/RegisterModal.tsx` | Email/password + Google sign-up modal. Calls `updateUser()` or `linkIdentity()` to upgrade anonymous account. |
| `shared/components/PwaInstallPrompt.tsx` | "Add to Home Screen" prompt. Captures `beforeinstallprompt` event, shows platform-appropriate UI. |

### New: Database Schema (Scaffold Now)

Create Supabase tables now to prepare for server-side state. Don't migrate localStorage data yet, but start logging minimally so the schema is proven before the full migration.

```sql
-- User profile (extends Supabase auth.users)
create table public.player_profiles (
  id uuid primary key references auth.users(id),
  nickname text not null,
  created_at timestamptz default now(),
  is_anonymous boolean default true
);

-- Game state (balance, streak — scaffold now, populate in server-side hand resolution project)
create table public.player_state (
  id uuid primary key references auth.users(id),
  balance integer not null default 100000,
  streak integer not null default 0,
  hands_played integer not null default 0,
  updated_at timestamptz default now()
);

-- Hand log (write-only audit trail — start logging on auth, validate during server-side project)
create table public.hand_log (
  id bigint generated always as identity primary key,
  player_id uuid references auth.users(id),
  roster_ids text[] not null,
  total_fp numeric(6,1) not null,
  tier text not null,
  payout integer not null,
  streak_at_play integer not null default 0,
  created_at timestamptz default now()
);

-- RLS: users can only read/write their own rows
alter table public.player_profiles enable row level security;
alter table public.player_state enable row level security;
alter table public.hand_log enable row level security;

create policy "Users read own profile" on public.player_profiles for select using (auth.uid() = id);
create policy "Users read own state" on public.player_state for select using (auth.uid() = id);
create policy "Users read own hands" on public.hand_log for select using (auth.uid() = player_id);
-- Writes go through server-side functions only (no client-side insert policies)
```

**What we do now:** Create tables + scaffold. On anonymous sign-in, insert a `player_profiles` row. On each hand, insert a `hand_log` row (client-side for now, moves to server-validated in next project). This gives us an audit trail from day 1.

**What we do later (server-side hand resolution project):** `player_state` balance/streak become authoritative. `hand_log` becomes server-written only. Client stops writing directly.

### Modified Files

| File | Change |
|------|--------|
| `basketball/src/App.tsx` | Wrap with `<AuthProvider>`. **No loading state** — game renders immediately, auth resolves in background. |
| `shared/utils/playerIdentity.ts` | `getPlayerUid()` uses UID priority chain: Supabase `user.id` → localStorage `rm_uid` → generate new. |
| `shared/analytics/analytics.ts` | `getOrCreateUserId()` uses same UID priority chain. |
| `basketball/src/views/GameView.tsx` | Add nudge trigger points: after hand resolution (big win check), after leaderboard rank check, after hand count increment. Render `<RegisterNudge>` and `<PwaInstallPrompt>`. Log hands to `hand_log` table. |
| `api/leaderboard.ts` | Supabase JWT verification: if token present, enforce UID match. If no token, accept but flag as `verified: false`. |

### Unchanged

- Balance (localStorage — moves to `player_state` in server-side project)
- Streak (localStorage — moves to `player_state` in server-side project)
- Game mechanics, FP calculation, payout logic
- FTUE flow (CoachLayer, ftueRoster)
- Nickname system (random-generated, stored in `player_profiles` on auth)

---

## Leaderboard Security

Two-tier verification system that doesn't block growth:

| Scenario | Behavior |
|----------|----------|
| **Token present, UID matches** | `verified: true` — full trust |
| **Token present, UID mismatch** | **Reject** — someone is spoofing |
| **No token (offline, auth failed)** | Accept but flag `verified: false` — shows on leaderboard, but future reward systems can require verification |

This avoids blocking users who had auth issues while protecting against deliberate spoofing. The `verified` flag becomes a gate for future features (prizes, withdrawals, etc.) without punishing normal users now.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Supabase unreachable on first load** | Game loads instantly on localStorage UID. Auth retries silently. Leaderboard submissions flagged `verified: false`. |
| **Supabase resolves mid-session** | UID upgrades seamlessly. Any leaderboard entries already submitted under localStorage UID get associated via the hand_log. |
| **User clears browser** | New anonymous account created. Old one orphaned. Registration nudges exist to prevent this. |
| **User registers, then clears browser** | Landing page shows "Already have an account? Sign in" link. Signs back in, restores everything. |
| **Multiple devices** | Each device gets its own anonymous account. Registration links them — sign in on second device to restore. |
| **Token expiry** | Supabase auto-refreshes. If refresh fails, fall back to localStorage UID, retry on next load. |

---

## Supabase Dashboard Setup (Manual Steps)

1. Open existing Supabase project (the one hosting headshots)
2. Authentication → Providers → Enable Email provider (if not already)
3. Authentication → Providers → Enable Google provider (add OAuth client ID/secret)
4. Authentication → Settings → Toggle "Allow anonymous sign-ins" ON
5. Copy project URL + anon key to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars
6. Add same env vars to Vercel project settings for production
7. Run SQL migration to create `player_profiles`, `player_state`, `hand_log` tables + RLS policies

---

## Security Notes

- Anonymous Supabase users get real JWTs — verifiable server-side without trusting the client
- Leaderboard uses two-tier verification (verified/unverified) — doesn't block, does flag
- Anonymous accounts have the same auth guarantees as registered accounts — the difference is recoverability, not security
- Rate limiting (separate project) should use Supabase UID, not IP, to prevent per-user abuse
- `hand_log` table creates an audit trail from day 1 — invaluable for detecting cheating when server-side validation lands

---

## Success Criteria

- Zero friction to first hand — game never waits for auth
- Auth resolves in background, typically <500ms
- localStorage UID works as first-class identity when auth is pending
- Leaderboard submissions carry verifiable UID when available, flagged when not
- Registration nudges fire only at high-emotion moments, max 1 per session
- Users who register keep their exact leaderboard position and stats
- PWA install prompt appears on return visits for engaged users
- Database schema scaffolded and logging hands from day 1
