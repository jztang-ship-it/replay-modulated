# Supabase Anonymous Auth — Design Spec

**Date:** 2026-04-14
**Status:** Approved
**Goal:** Frictionless play with anonymous Supabase auth, soft nudges to register, PWA install prompt.

---

## Overview

Users play immediately with no sign-up. A real Supabase anonymous account is created silently on first visit, replacing the current localStorage-only identity (`rm_uid`). After meaningful moments (big wins, leaderboard appearances), soft non-blocking nudges encourage registration (email/Google). Registered or not, all users keep full functionality. A separate PWA "Add to Home Screen" prompt fires after registration or sustained play.

---

## Auth Flow

### 1. Silent Anonymous Sign-In

On app mount, `AuthProvider` checks for an existing Supabase session. If none exists, calls `supabase.auth.signInAnonymously()`. This creates a real server-side user with a UUID, verifiable via JWT. The user sees nothing — the game loads normally.

**Supabase project setup required:**
- Enable "Allow anonymous sign-ins" in Authentication → Settings
- Use existing project (same one serving headshot/audio storage)
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### 2. Session Persistence

Supabase stores its session token in localStorage automatically. Returning users get their existing session restored on page load — same UID, same leaderboard position, same everything. Multiple tabs share the session.

### 3. Account Upgrade (Registration)

When a user registers, Supabase's `updateUser({ email, password })` or `linkIdentity({ provider: 'google' })` upgrades the anonymous account in place. Same UUID, same row in the DB. No data migration, no duplicate accounts.

---

## Nudge System

All nudges are **one-shot** (fire at most once per user) and **non-blocking** (dismiss button always visible, gameplay continues behind). Tracked via localStorage flags.

| ID | Trigger | Message | When |
|----|---------|---------|------|
| `nudge_big_win` | First ALL_STAR+ tier hit | "Nice hit! Save your progress so you don't lose it." | Post-game result screen |
| `nudge_leaderboard` | First time appearing on leaderboard | "You're on the board! Claim your spot — add an email." | After leaderboard rank check |
| `nudge_retention` | 5th hand played, still anonymous | "Having fun? Save your account to play on any device." | Return to IDLE after hand 5 |
| `nudge_pwa` | After successful registration, OR 10th hand if anonymous | "Add ReplayMod to your home screen for instant access." | Return to IDLE |

**Nudge rules:**
- Never show during active gameplay (only during IDLE or result screens)
- Never stack two nudges — if multiple trigger simultaneously, fire highest priority (big_win > leaderboard > retention)
- Each nudge stores a `rm_nudge_{id}_shown` localStorage flag once displayed
- If user is already registered, auth nudges never fire. Only PWA nudge can fire for registered users.

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
- Fires after registration confirmation, or after 10th hand for anonymous users
- One-shot, tracked via `rm_nudge_pwa_shown`

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `shared/lib/supabase.ts` | Supabase client singleton. Reads `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` from env. |
| `shared/auth/AuthProvider.tsx` | React context provider. Handles anonymous sign-in on mount, exposes `{ user, uid, isReady, isAnonymous, signUp, linkGoogle }`. Wraps app at top level. |
| `shared/auth/useAuth.ts` | `useAuth()` hook — consumes AuthProvider context. |
| `shared/components/RegisterNudge.tsx` | Nudge banner/bottom-sheet component. Receives trigger condition + nudge ID + message. Handles one-shot display logic. |
| `shared/components/RegisterModal.tsx` | Email/password + Google sign-up modal. Calls `updateUser()` or `linkIdentity()` to upgrade anonymous account. |
| `shared/components/PwaInstallPrompt.tsx` | "Add to Home Screen" prompt. Captures `beforeinstallprompt` event, shows platform-appropriate UI. |

### Modified Files

| File | Change |
|------|--------|
| `basketball/src/App.tsx` | Wrap with `<AuthProvider>`. Show loading state while auth initializes. |
| `shared/utils/playerIdentity.ts` | `getPlayerUid()` returns Supabase `user.id` instead of localStorage `rm_uid`. Falls back to localStorage UID if auth not ready (offline/error). |
| `shared/analytics/analytics.ts` | `getOrCreateUserId()` uses Supabase UID when available, falls back to current localStorage approach. |
| `basketball/src/views/GameView.tsx` | Add nudge trigger points: after hand resolution (big win check), after leaderboard rank check, after hand count increment. Render `<RegisterNudge>` and `<PwaInstallPrompt>` components. |
| `api/leaderboard.ts` | Add optional Supabase JWT verification. Extract UID from token, reject if token UID doesn't match submitted UID. Log but don't block if token missing (graceful migration). |

### Unchanged

- Balance (localStorage — moves server-side in next project)
- Streak (localStorage — moves server-side in next project)
- Game mechanics, FP calculation, payout logic
- FTUE flow (CoachLayer, ftueRoster)
- Nickname system (random-generated, localStorage — can add "edit nickname" to profile later)

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Supabase unreachable on first load** | Fall back to localStorage UID. Game works normally. Leaderboard submissions include a `provisional: true` flag. Retry auth on next page load. |
| **User clears browser** | New anonymous account created. Old one orphaned. This is expected for anonymous users — registration nudges exist to prevent this. |
| **User registers, then clears browser** | Supabase session lost, but account exists. Need a "Sign in" path (email+password or Google) to recover. Add a small "Already have an account?" link on the landing page. |
| **Multiple devices** | Each device gets its own anonymous account. Registration links them — user signs in on second device, gets their account back. Pre-registration, devices are separate identities. |
| **Token expiry** | Supabase auto-refreshes tokens. If refresh fails (offline), fall back to localStorage UID until next successful refresh. |
| **Returning registered user, lost session** | Landing page shows small "Already have an account? Sign in" link. Tapping opens the same modal in sign-in mode (email+password or Google). On success, restores their account + leaderboard position. |

---

## Supabase Dashboard Setup (Manual Steps)

1. Open existing Supabase project (the one hosting headshots)
2. Authentication → Providers → Enable Email provider (if not already)
3. Authentication → Providers → Enable Google provider (add OAuth client ID/secret)
4. Authentication → Settings → Toggle "Allow anonymous sign-ins" ON
5. Copy project URL + anon key to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars
6. Add same env vars to Vercel project settings for production

---

## Security Notes

- Anonymous Supabase users get real JWTs — verifiable server-side without trusting the client
- `api/leaderboard.ts` validation: extract `sub` (user ID) from JWT, compare to submitted `uid`. Reject mismatches.
- Anonymous accounts have the same auth guarantees as registered accounts — the difference is recoverability, not security
- Rate limiting (separate project) should use Supabase UID, not IP, to prevent per-user abuse

---

## Success Criteria

- Zero friction to first hand (no sign-up screen, no loading wall beyond auth init)
- Auth init completes in <500ms (Supabase anonymous sign-in is fast)
- Leaderboard submissions carry a verifiable UID
- Registration nudges fire at the right moments without interrupting gameplay
- Users who register keep their exact leaderboard position and stats
- PWA install prompt appears for eligible users
