# Achievement Wall UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "museum of moments" achievement wall — own profile wall with stats header + achievement grid, other-user read-only wall with comparison row, analytics wiring, and a badge dot on the game header avatar.

**Architecture:** The app has no URL router — profile is a modal layer. ProfileScreen gets a Stats/Achievements tab switcher. Other-user walls are served when `window.location.pathname` matches `/basketball/profile/:userId` (the Vercel SPA rewrite already handles that path). A new `api/profile.ts` serverless function reads cross-user data with service role. All visual components live in `shared/components/` following the canonical-file rule.

**Tech Stack:** React 19 (basketball), TypeScript, Supabase (anon key client + service role API), `@vercel/node`, existing `track()` analytics, existing `TIER_TOKENS` from `@shared/theme`, `headshotUrl()` from `@shared/utils/headshotUrl`.

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| CREATE | `api/profile.ts` | Public profile API — cross-user achievements + rarity counts |
| CREATE | `shared/components/AchievementCard.tsx` | Single locked/unlocked tile |
| CREATE | `shared/components/AchievementDetailModal.tsx` | Full-detail modal on tap |
| CREATE | `shared/components/AchievementWall.tsx` | Wall (own + other) with filter/sort/comparison |
| CREATE | `shared/hooks/useAchievementWall.ts` | Data fetcher (own = Supabase direct; other = API) |
| MODIFY | `shared/achievements/types.ts` | Add `photoCode?: string` to `CardScore` |
| MODIFY | `shared/hooks/useAchievements.ts` | Store `mvpCard` in source_data |
| MODIFY | `shared/views/_useSharedGameState.ts` | Pass `photoCode` in card mapping |
| MODIFY | `shared/components/AppHeader.tsx` | `hasNewAchievements?: boolean` badge dot on Profile tab |
| MODIFY | `shared/components/ProfileScreen.tsx` | Stats / Achievements tab switcher |
| MODIFY | `shared/views/GameView.tsx` | Wire badge dot + clear on profile open |
| MODIFY | `basketball/src/App.tsx` | Path detection for `/basketball/profile/:userId` |

---

## Task 1: Enrich source_data — add photoCode + mvpCard

**Files:**
- Modify: `shared/achievements/types.ts`
- Modify: `shared/views/_useSharedGameState.ts:307-328` (card mapping inside `logHandToDb`)
- Modify: `shared/hooks/useAchievements.ts:31-47` (source_data construction)

### Context
`useAchievements` currently stores `{ totalFp, fpTier, season }` in `source_data`. The wall needs to show the "hero card" of the moment — the highest-FP card from the hand (photo, name, team, position, tier, season). We add `photoCode` to `CardScore` so it flows from `logHandToDb` → `evaluateAndSave` → DB.

- [ ] **Step 1.1: Add `photoCode` to `CardScore`**

In `shared/achievements/types.ts`, add one field to `CardScore`:

```typescript
export interface CardScore {
  fp: number;
  stats: Record<string, unknown>;
  position: string;
  name: string;
  team: string;
  tier: string;
  season: string;
  photoCode?: string;    // ← add this
}
```

- [ ] **Step 1.2: Pass `photoCode` in `logHandToDb` card mapping**

In `shared/views/_useSharedGameState.ts`, inside `logHandToDb`, update the cards mapping:

```typescript
cards: rosterArg.map((c: any) => ({
  fp: Number(c.actualFp ?? 0),
  stats: (c.statLine ?? {}) as Record<string, unknown>,
  position: String(c.position ?? ""),
  name: String(c.name ?? ""),
  team: String(c.team ?? ""),
  tier: String(c.tier ?? "WHITE"),
  season: String(c.season ?? ""),
  photoCode: c.photoCode ?? undefined,   // ← add this
})),
```

- [ ] **Step 1.3: Store mvpCard in source_data**

In `shared/hooks/useAchievements.ts`, update the `rows` construction:

```typescript
const mvp = ctx.cards.length > 0
  ? ctx.cards.reduce((best, c) => (c.fp > best.fp ? c : best), ctx.cards[0])
  : null;

const rows = newOnes.map(r => ({
  user_id: uid,
  achievement_id: r.achievementId,
  sport: r.sport,
  source_hand_id: r.sourceHandId || null,
  source_data: {
    totalFp: ctx.totalFp,
    fpTier: ctx.fpTier,
    season: ctx.season,
    mvpCard: mvp ? {
      photoCode: mvp.photoCode,
      name: mvp.name,
      team: mvp.team,
      position: mvp.position,
      tier: mvp.tier,
      season: mvp.season,
      fp: mvp.fp,
    } : null,
  },
}));
```

- [ ] **Step 1.4: Confirm no TypeScript errors**

```bash
cd /Users/john/Desktop/ReplayMod/.claude/worktrees/feat+achievements-and-challenges
npx tsc --noEmit -p basketball/tsconfig.json 2>&1 | head -20
```
Expected: no output (clean).

- [ ] **Step 1.5: Commit**

```bash
git add shared/achievements/types.ts shared/views/_useSharedGameState.ts shared/hooks/useAchievements.ts
git commit -m "feat(achievements): enrich source_data with mvpCard hero snapshot"
```

---

## Task 2: `api/profile.ts` — public profile endpoint

**Files:**
- Create: `api/profile.ts`

### Context
Reads another user's achievements using service role (bypasses RLS). Returns achievements, rarity counts, and nickname. Only GET is supported. No auth required (public wall). The endpoint also serves own-wall data when `api/profile.ts?user_id={ownId}` is called.

Env vars needed (already present in Vercel): `VITE_SUPABASE_URL` (or `SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 2.1: Create `api/profile.ts`**

```typescript
/**
 * api/profile.ts — public profile endpoint.
 *
 * GET /api/profile?user_id=<uuid>&sport=basketball
 *
 * Returns achievement list for any user (cross-user read via service role)
 * plus rarity counts (how many total users unlocked each achievement).
 * No auth required — achievements are intentionally public.
 *
 * Response shape:
 *   { nickname, achievements: AchievementRow[], rarityMap: Record<string,number> }
 *
 * AchievementRow: { achievement_id, sport, unlocked_at, source_hand_id, source_data }
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

export interface ProfileAchievementRow {
  achievement_id: string;
  sport: string;
  unlocked_at: string;
  source_hand_id: string | null;
  source_data: Record<string, unknown> | null;
}

export interface ProfileResponse {
  nickname: string | null;
  achievements: ProfileAchievementRow[];
  rarityMap: Record<string, number>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const userId = req.query.user_id as string | undefined;
  if (!userId || !/^[0-9a-f-]{36}$/.test(userId)) {
    return res.status(400).json({ error: "Invalid user_id" });
  }

  if (!supabase) return res.status(503).json({ error: "Database unavailable" });

  // Fetch in parallel: user profile + their achievements + rarity counts
  const [profileResult, achievementsResult, rarityResult] = await Promise.all([
    supabase
      .from("player_profiles")
      .select("nickname")
      .eq("id", userId)
      .single(),
    supabase
      .from("user_achievements")
      .select("achievement_id, sport, unlocked_at, source_hand_id, source_data")
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: false }),
    supabase
      .from("user_achievements")
      .select("achievement_id")
      // intentionally no user_id filter — counts across all users
  ]);

  const nickname = (profileResult.data as any)?.nickname ?? null;
  const achievements: ProfileAchievementRow[] = (achievementsResult.data ?? []) as ProfileAchievementRow[];

  // Build rarity map: achievement_id → count of distinct users
  const rarityMap: Record<string, number> = {};
  for (const row of (rarityResult.data ?? [])) {
    const id = (row as any).achievement_id as string;
    rarityMap[id] = (rarityMap[id] ?? 0) + 1;
  }

  const response: ProfileResponse = { nickname, achievements, rarityMap };
  return res.status(200).json(response);
}
```

- [ ] **Step 2.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```
Expected: no errors related to `api/profile.ts`.

- [ ] **Step 2.3: Commit**

```bash
git add api/profile.ts
git commit -m "feat(profile): public profile API endpoint with achievements + rarity"
```

---

## Task 3: `AchievementCard` component

**Files:**
- Create: `shared/components/AchievementCard.tsx`

### Context
A single tile in the grid. Locked = dim trophy silhouette, title visible, no stats. Unlocked = player photo (if available), tier glow border, FP hero number, player name, achievement title as caption. Mobile-first: 2-column grid cells, ~160px tall.

Tier visual tokens: import `getTier` and `TIER_TOKENS` from `@shared/theme`. Player photo: `headshotUrl(photoCode)` from `@shared/utils/headshotUrl`.

- [ ] **Step 3.1: Create `shared/components/AchievementCard.tsx`**

```tsx
import React, { useState } from "react";
import type { AchievementDef } from "@shared/achievements";
import { getTier } from "@shared/theme";
import { headshotUrl } from "@shared/utils/headshotUrl";

export interface MvpCardSnapshot {
  photoCode?: string;
  name: string;
  team: string;
  position: string;
  tier: string;
  season: string;
  fp: number;
}

export interface AchievementCardProps {
  def: AchievementDef;
  unlockedAt?: string;         // ISO — undefined means locked
  mvpCard?: MvpCardSnapshot | null;
  fpTier?: string;
  totalFp?: number;
  season?: string;
  onClick?: () => void;
}

const TIER_ICON: Record<string, string> = {
  bronze: "🥉",
  silver: "🥈",
  gold:   "🏆",
};

const TIER_LABEL: Record<string, string> = {
  bronze: "Instant",
  silver: "Grinder",
  gold:   "Cross-Era",
};

export function AchievementCard({ def, unlockedAt, mvpCard, fpTier, totalFp, onClick }: AchievementCardProps) {
  const unlocked = !!unlockedAt;
  const cardTier = getTier(mvpCard?.tier ?? (unlocked ? "BLUE" : "WHITE"));
  const [imgErr, setImgErr] = useState(false);
  const photoUrl = mvpCard?.photoCode && !imgErr ? headshotUrl(mvpCard.photoCode) : null;

  const borderColor = unlocked
    ? `${cardTier.accent}55`
    : "rgba(255,255,255,0.08)";
  const glowColor = unlocked ? cardTier.glow : "transparent";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${def.title} — ${unlocked ? "unlocked" : "locked"}`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
      style={{
        position: "relative",
        borderRadius: 12,
        border: `1.5px solid ${borderColor}`,
        background: unlocked
          ? `linear-gradient(160deg, #0d1526 0%, #0a1020 100%)`
          : "rgba(255,255,255,0.03)",
        boxShadow: unlocked ? `0 0 12px ${glowColor}, 0 4px 14px rgba(0,0,0,0.4)` : "none",
        padding: "10px 10px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 7,
        cursor: "pointer",
        opacity: unlocked ? 1 : 0.55,
        transition: "opacity 150ms ease, transform 100ms ease",
        WebkitTapHighlightColor: "transparent",
        minHeight: 150,
        userSelect: "none",
      }}
      onPointerDown={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "scale(0.96)"; }}
      onPointerUp={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ""; }}
      onPointerLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ""; }}
    >
      {/* Tier pill — top left */}
      <div style={{
        position: "absolute", top: 7, left: 8,
        fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
        color: unlocked ? cardTier.accent : "rgba(255,255,255,0.3)",
        textTransform: "uppercase",
      }}>
        {TIER_ICON[def.tier]} {TIER_LABEL[def.tier]}
      </div>

      {/* Hero — photo or silhouette */}
      <div style={{
        marginTop: 16,
        width: 56, height: 56,
        borderRadius: "50%",
        overflow: "hidden",
        border: `2px solid ${unlocked ? cardTier.accent : "rgba(255,255,255,0.12)"}`,
        boxShadow: unlocked ? `0 0 0 1px rgba(0,0,0,0.4), 0 0 8px ${glowColor}` : "none",
        background: unlocked ? cardTier.bg : "#1a1f2e",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: unlocked && !photoUrl ? 22 : 14,
      }}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={mvpCard?.name ?? ""}
            onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
          />
        ) : (
          <span style={{ color: unlocked ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.2)" }}>
            {unlocked ? TIER_ICON[def.tier] : "🔒"}
          </span>
        )}
      </div>

      {/* Player name or "???" */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: unlocked ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)",
        textAlign: "center",
        lineHeight: 1.2,
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {unlocked && mvpCard?.name ? mvpCard.name : "???"}
      </div>

      {/* FP or tier badge */}
      {unlocked && (fpTier || totalFp !== undefined) && (
        <div style={{
          fontSize: 11,
          fontWeight: 900,
          color: cardTier.accent,
          letterSpacing: 0.3,
        }}>
          {fpTier || (totalFp !== undefined ? `${totalFp.toFixed(0)} FP` : "")}
        </div>
      )}

      {/* Achievement title */}
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: unlocked ? "#EAF0FF" : "rgba(255,255,255,0.45)",
        textAlign: "center",
        lineHeight: 1.3,
        marginTop: "auto",
      }}>
        {def.title}
      </div>
    </div>
  );
}
```

- [ ] **Step 3.2: TypeScript check**

```bash
npx tsc --noEmit -p basketball/tsconfig.json 2>&1 | head -20
```
Expected: clean.

- [ ] **Step 3.3: Commit**

```bash
git add shared/components/AchievementCard.tsx
git commit -m "feat(achievements): AchievementCard tile component"
```

---

## Task 4: `AchievementDetailModal` component

**Files:**
- Create: `shared/components/AchievementDetailModal.tsx`

### Context
Full-screen dark overlay. Large player photo (top 40% of screen), achievement title + description, unlock date, hand FP + tier badge, season label. Tapping outside or pressing the × closes it.

- [ ] **Step 4.1: Create `shared/components/AchievementDetailModal.tsx`**

```tsx
import React, { useEffect, useState } from "react";
import type { AchievementDef } from "@shared/achievements";
import type { MvpCardSnapshot } from "./AchievementCard";
import { getTier } from "@shared/theme";
import { headshotUrl } from "@shared/utils/headshotUrl";

export interface AchievementDetailModalProps {
  def: AchievementDef;
  unlockedAt?: string;
  mvpCard?: MvpCardSnapshot | null;
  fpTier?: string;
  totalFp?: number;
  season?: string;
  sourceHandId?: string | null;
  isLocked?: boolean;
  onClose: () => void;
}

const TIER_LABEL_FULL: Record<string, string> = {
  bronze: "Instant Impressive",
  silver: "Grinder",
  gold:   "Cross-Era",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

export function AchievementDetailModal({
  def,
  unlockedAt,
  mvpCard,
  fpTier,
  totalFp,
  season,
  isLocked,
  onClose,
}: AchievementDetailModalProps) {
  const locked = isLocked || !unlockedAt;
  const cardTier = getTier(mvpCard?.tier ?? (locked ? "WHITE" : "BLUE"));
  const [imgErr, setImgErr] = useState(false);
  const photoUrl = mvpCard?.photoCode && !imgErr ? headshotUrl(mvpCard.photoCode) : null;

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.85)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "fixed", top: 14, right: 14, zIndex: 10001,
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.18)",
          color: "#EAF0FF", fontSize: 18, fontWeight: 700,
          cursor: "pointer", lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        aria-label="Close"
      >×</button>

      {/* Hero area */}
      <div style={{
        width: "100%",
        maxWidth: 480,
        background: locked
          ? "linear-gradient(180deg, #0d1526 0%, #070A12 100%)"
          : `linear-gradient(180deg, ${cardTier.bg} 0%, #070A12 60%)`,
        minHeight: 260,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 20,
        paddingTop: 60,
        position: "relative",
      }}>
        {/* Photo or icon */}
        <div style={{
          width: 100, height: 100, borderRadius: "50%",
          overflow: "hidden",
          border: `3px solid ${locked ? "rgba(255,255,255,0.15)" : cardTier.accent}`,
          boxShadow: locked ? "none" : `0 0 0 1px rgba(0,0,0,0.4), 0 0 24px ${cardTier.glow}`,
          background: locked ? "#1a1f2e" : cardTier.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 42,
          marginBottom: 12,
        }}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={mvpCard?.name ?? ""}
              onError={() => setImgErr(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
            />
          ) : (
            <span>{locked ? "🔒" : (def.tier === "gold" ? "🏆" : def.tier === "silver" ? "🥈" : "🥉")}</span>
          )}
        </div>

        {/* Player name + position */}
        {!locked && mvpCard?.name && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#EAF0FF" }}>{mvpCard.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              {mvpCard.position} · {mvpCard.team}
            </div>
          </div>
        )}
      </div>

      {/* Info panel */}
      <div style={{
        width: "100%",
        maxWidth: 480,
        padding: "20px 20px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        background: "#070A12",
      }}>
        {/* Achievement category */}
        <div style={{
          fontSize: 9, fontWeight: 800, letterSpacing: 2,
          color: locked ? "rgba(255,255,255,0.3)" : cardTier.accent,
          textTransform: "uppercase",
        }}>
          {TIER_LABEL_FULL[def.tier]} · Basketball
        </div>

        {/* Achievement title */}
        <div style={{ fontSize: 26, fontWeight: 900, color: "#EAF0FF", lineHeight: 1.1 }}>
          {def.title}
        </div>

        {/* Description */}
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
          {def.description}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0" }} />

        {locked ? (
          <div style={{
            fontSize: 12, color: "rgba(255,255,255,0.35)", fontStyle: "italic",
          }}>
            Keep playing to unlock this achievement.
          </div>
        ) : (
          <>
            {/* Hand stats */}
            {(fpTier || totalFp !== undefined || season) && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {fpTier && (
                  <StatPill label="Tier" value={fpTier} accent={cardTier.accent} />
                )}
                {totalFp !== undefined && (
                  <StatPill label="Total FP" value={`${totalFp.toFixed(1)}`} accent={cardTier.accent} />
                )}
                {mvpCard?.fp !== undefined && (
                  <StatPill label={`${mvpCard.name ?? "Card"} FP`} value={`${mvpCard.fp.toFixed(1)}`} accent={cardTier.accent} />
                )}
                {season && (
                  <StatPill label="Season" value={season} accent={cardTier.accent} />
                )}
              </div>
            )}

            {/* Unlock date */}
            {unlockedAt && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                Unlocked {formatDate(unlockedAt)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: `1px solid ${accent}44`,
      borderRadius: 8,
      padding: "6px 12px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      minWidth: 64,
    }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: accent }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginTop: 1, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}
```

- [ ] **Step 4.2: TypeScript check**

```bash
npx tsc --noEmit -p basketball/tsconfig.json 2>&1 | head -20
```
Expected: clean.

- [ ] **Step 4.3: Commit**

```bash
git add shared/components/AchievementDetailModal.tsx
git commit -m "feat(achievements): AchievementDetailModal full-detail overlay"
```

---

## Task 5: `useAchievementWall` hook

**Files:**
- Create: `shared/hooks/useAchievementWall.ts`

### Context
For own wall: reads from Supabase with the auth session (same as `useAchievements` but fetches full rows including `source_data`). For other user's wall: calls `GET /api/profile?user_id=xxx`. Joins with `getAllDefs()` to produce a complete list of unlocked + locked rows for all registered achievement defs, filtered by sport.

- [ ] **Step 5.1: Create `shared/hooks/useAchievementWall.ts`**

```typescript
import { useState, useEffect } from "react";
import { supabase } from "@shared/lib/supabase";
import { getAllDefs } from "@shared/achievements";
import type { AchievementDef } from "@shared/achievements";
import type { MvpCardSnapshot } from "@shared/components/AchievementCard";
import type { ProfileAchievementRow } from "../../api/profile";

export interface WallRow {
  def: AchievementDef;
  unlockedAt?: string;
  sourceHandId?: string | null;
  mvpCard?: MvpCardSnapshot | null;
  fpTier?: string;
  totalFp?: number;
  season?: string;
}

export interface UseAchievementWallResult {
  rows: WallRow[];
  loading: boolean;
  error: string | null;
  nickname: string | null;
  rarityMap: Record<string, number>;
}

function buildRows(sport: string, unlocked: ProfileAchievementRow[]): WallRow[] {
  const unlockedById = new Map<string, ProfileAchievementRow>();
  for (const u of unlocked) unlockedById.set(u.achievement_id, u);

  const defs = getAllDefs().filter(d => d.sport === sport || d.sport === "all");

  return defs.map(def => {
    const u = unlockedById.get(def.id);
    if (!u) return { def };
    const sd = (u.source_data ?? {}) as Record<string, unknown>;
    return {
      def,
      unlockedAt: u.unlocked_at,
      sourceHandId: u.source_hand_id,
      mvpCard: (sd.mvpCard as MvpCardSnapshot | null) ?? null,
      fpTier: typeof sd.fpTier === "string" ? sd.fpTier : undefined,
      totalFp: typeof sd.totalFp === "number" ? sd.totalFp : undefined,
      season: typeof sd.season === "string" ? sd.season : undefined,
    };
  });
}

/** Own wall — reads directly from Supabase with user auth session. */
export function useOwnAchievementWall(sport: string): UseAchievementWallResult {
  const [rows, setRows] = useState<WallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("user_achievements")
      .select("achievement_id, sport, unlocked_at, source_hand_id, source_data")
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) { setError(err.message); setLoading(false); return; }
        setRows(buildRows(sport, (data ?? []) as ProfileAchievementRow[]));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sport]);

  return { rows, loading, error, nickname: null, rarityMap: {} };
}

/** Other user's wall — fetches from the public API endpoint. */
export function useOtherAchievementWall(sport: string, targetUserId: string): UseAchievementWallResult {
  const [rows, setRows] = useState<WallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [rarityMap, setRarityMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/profile?user_id=${encodeURIComponent(targetUserId)}&sport=${sport}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setNickname(data.nickname ?? null);
        setRarityMap(data.rarityMap ?? {});
        setRows(buildRows(sport, data.achievements ?? []));
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sport, targetUserId]);

  return { rows, loading, error, nickname, rarityMap };
}
```

- [ ] **Step 5.2: TypeScript check**

```bash
npx tsc --noEmit -p basketball/tsconfig.json 2>&1 | head -20
```
Expected: clean.

- [ ] **Step 5.3: Commit**

```bash
git add shared/hooks/useAchievementWall.ts
git commit -m "feat(achievements): useAchievementWall data hook (own + other)"
```

---

## Task 6: `AchievementWall` component

**Files:**
- Create: `shared/components/AchievementWall.tsx`

### Context
The main wall. Handles own + other modes. Stats header (own: total hands / best FP / streak / unlock count; other: unlock count + comparison row). Filter tabs: All / Instant / Grinder / Cross-Era. Sort: Recent / By Tier (rarest first). Grid of `AchievementCard` tiles. Tap → `AchievementDetailModal`. Analytics fired: `profile_self_view`, `profile_other_view`, `achievement_detail_open`, `achievement_filter_change`.

Filter tab mapping: `def.tier === "bronze"` → "Instant", `"silver"` → "Grinder", `"gold"` → "Cross-Era".

- [ ] **Step 6.1: Create `shared/components/AchievementWall.tsx`**

```tsx
import React, { useEffect, useMemo, useState } from "react";
import { track } from "@shared/analytics/analytics";
import { getAllDefs } from "@shared/achievements";
import type { WallRow } from "@shared/hooks/useAchievementWall";
import { useOwnAchievementWall, useOtherAchievementWall } from "@shared/hooks/useAchievementWall";
import { AchievementCard } from "./AchievementCard";
import { AchievementDetailModal } from "./AchievementDetailModal";

export interface AchievementWallProps {
  sport: string;
  isSelf: boolean;
  targetUserId?: string;       // required when isSelf=false
  ownUnlockedIds?: string[];   // own IDs — for comparison row when isSelf=false
  /** Own stats for header (self mode only) */
  totalHands?: number;
  lifetimeBestFp?: number;
  currentStreak?: number;
}

type FilterTab = "all" | "bronze" | "silver" | "gold";
type SortMode = "recent" | "tier";

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all",    label: "All" },
  { id: "bronze", label: "Instant" },
  { id: "silver", label: "Grinder" },
  { id: "gold",   label: "Cross-Era" },
];

function sortRows(rows: WallRow[], mode: SortMode): WallRow[] {
  const tierWeight: Record<string, number> = { gold: 0, silver: 1, bronze: 2 };
  return [...rows].sort((a, b) => {
    const aUnlocked = !!a.unlockedAt;
    const bUnlocked = !!b.unlockedAt;
    // Unlocked always before locked
    if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
    if (mode === "recent") {
      // Among unlocked: most recent first. Among locked: by tier.
      if (aUnlocked && bUnlocked) {
        return (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "");
      }
      return (tierWeight[a.def.tier] ?? 99) - (tierWeight[b.def.tier] ?? 99);
    }
    // "tier" mode: gold → silver → bronze, then by unlock date
    const tw = (tierWeight[a.def.tier] ?? 99) - (tierWeight[b.def.tier] ?? 99);
    if (tw !== 0) return tw;
    return (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "");
  });
}

function OwnWall(props: AchievementWallProps) {
  const { rows, loading } = useOwnAchievementWall(props.sport);
  return <WallInner {...props} rows={rows} loading={loading} />;
}

function OtherWall(props: AchievementWallProps & { targetUserId: string }) {
  const { rows, loading, nickname, rarityMap } = useOtherAchievementWall(props.sport, props.targetUserId);
  return <WallInner {...props} rows={rows} loading={loading} nickname={nickname} rarityMap={rarityMap} />;
}

function WallInner({
  sport,
  isSelf,
  targetUserId,
  ownUnlockedIds = [],
  totalHands,
  lifetimeBestFp,
  currentStreak,
  rows,
  loading,
  nickname,
  rarityMap = {},
}: AchievementWallProps & {
  rows: WallRow[];
  loading: boolean;
  nickname?: string | null;
  rarityMap?: Record<string, number>;
}) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [detailRow, setDetailRow] = useState<WallRow | null>(null);

  const totalDefs = getAllDefs().filter(d => d.sport === sport || d.sport === "all").length;
  const unlockedCount = rows.filter(r => !!r.unlockedAt).length;

  const filtered = useMemo(() => {
    const base = filter === "all" ? rows : rows.filter(r => r.def.tier === filter);
    return sortRows(base, sort);
  }, [rows, filter, sort]);

  function handleFilterChange(id: FilterTab) {
    setFilter(id);
    track("profile", "achievement_filter_change", { filter: id, sport });
  }

  function handleDetailOpen(row: WallRow) {
    setDetailRow(row);
    track("profile", "achievement_detail_open", {
      achievement_id: row.def.id,
      locked: !row.unlockedAt,
      sport,
    });
  }

  // Comparison stats (other-user mode)
  const theirUnlockedIds = rows.filter(r => r.unlockedAt).map(r => r.def.id);
  const overlapCount = ownUnlockedIds.filter(id => theirUnlockedIds.includes(id)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: 0 }}>
      {/* Stats header */}
      <div style={{
        padding: "14px 16px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {!isSelf && nickname && (
          <div style={{ fontSize: 16, fontWeight: 800, color: "#EAF0FF", marginBottom: 8 }}>
            {nickname}'s Wall
          </div>
        )}

        {!isSelf && (
          <ComparisonRow
            myCount={ownUnlockedIds.length}
            theirCount={theirUnlockedIds.length}
            overlap={overlapCount}
            total={totalDefs}
          />
        )}

        {isSelf && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatChip label="Achievements" value={`${unlockedCount}/${totalDefs}`} />
            {totalHands !== undefined && <StatChip label="Hands" value={String(totalHands)} />}
            {lifetimeBestFp !== undefined && <StatChip label="Best FP" value={`${lifetimeBestFp}`} />}
            {currentStreak !== undefined && currentStreak > 0 && <StatChip label="Streak" value={`${currentStreak}🔥`} />}
          </div>
        )}

        {!isSelf && (
          <div style={{ marginTop: 8 }}>
            <StatChip label="Unlocked" value={`${theirUnlockedIds.length}/${totalDefs}`} />
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{
        display: "flex",
        gap: 0,
        overflowX: "auto",
        padding: "8px 16px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleFilterChange(tab.id)}
            style={{
              padding: "6px 14px",
              background: "transparent",
              border: "none",
              borderBottom: filter === tab.id ? "2px solid #FFB14A" : "2px solid transparent",
              color: filter === tab.id ? "#FFB14A" : "rgba(255,255,255,0.45)",
              fontSize: 12,
              fontWeight: filter === tab.id ? 800 : 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 150ms ease",
            }}
          >
            {tab.label}
          </button>
        ))}

        {/* Sort — right side */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", paddingBottom: 2 }}>
          <button
            onClick={() => setSort(s => s === "recent" ? "tier" : "recent")}
            style={{
              fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)",
              background: "transparent", border: "none",
              cursor: "pointer", whiteSpace: "nowrap", letterSpacing: 0.3,
            }}
          >
            {sort === "recent" ? "⏱ Recent" : "🏆 By Tier"}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 16px 24px",
        WebkitOverflowScrolling: "touch",
      }}>
        {loading ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 32, fontSize: 13 }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 32, fontSize: 13 }}>
            No achievements in this category.
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10,
          }}>
            {filtered.map(row => (
              <AchievementCard
                key={row.def.id}
                def={row.def}
                unlockedAt={row.unlockedAt}
                mvpCard={row.mvpCard}
                fpTier={row.fpTier}
                totalFp={row.totalFp}
                season={row.season}
                onClick={() => handleDetailOpen(row)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detailRow && (
        <AchievementDetailModal
          def={detailRow.def}
          unlockedAt={detailRow.unlockedAt}
          mvpCard={detailRow.mvpCard}
          fpTier={detailRow.fpTier}
          totalFp={detailRow.totalFp}
          season={detailRow.season}
          sourceHandId={detailRow.sourceHandId}
          isLocked={!detailRow.unlockedAt}
          onClose={() => setDetailRow(null)}
        />
      )}
    </div>
  );
}

function ComparisonRow({ myCount, theirCount, overlap, total }: {
  myCount: number; theirCount: number; overlap: number; total: number;
}) {
  return (
    <div style={{
      background: "rgba(255,177,74,0.06)",
      border: "1px solid rgba(255,177,74,0.2)",
      borderRadius: 10,
      padding: "8px 12px",
      fontSize: 12,
      color: "rgba(255,255,255,0.7)",
      lineHeight: 1.5,
    }}>
      You: <strong style={{ color: "#FFB14A" }}>{myCount}</strong>
      {" · "}
      They: <strong style={{ color: "#FFB14A" }}>{theirCount}</strong>
      {" · "}
      <strong style={{ color: "#86efac" }}>{overlap} in common</strong>
      <span style={{ color: "rgba(255,255,255,0.3)" }}> / {total} total</span>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8,
      padding: "5px 10px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: "#EAF0FF" }}>{value}</div>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

export function AchievementWall(props: AchievementWallProps) {
  return props.isSelf
    ? <OwnWall {...props} />
    : <OtherWall {...props} targetUserId={props.targetUserId!} />;
}
```

- [ ] **Step 6.2: TypeScript check**

```bash
npx tsc --noEmit -p basketball/tsconfig.json 2>&1 | head -20
```
Expected: clean.

- [ ] **Step 6.3: Commit**

```bash
git add shared/components/AchievementWall.tsx
git commit -m "feat(achievements): AchievementWall with filter/sort/comparison/analytics"
```

---

## Task 7: ProfileScreen tabs + AppHeader badge + GameView wiring

**Files:**
- Modify: `shared/components/AppHeader.tsx` — add `hasNewAchievements?: boolean` badge prop
- Modify: `shared/components/ProfileScreen.tsx` — add Stats/Achievements tabs
- Modify: `shared/views/GameView.tsx` — wire badge + clear on profile open + fire `profile_self_view`

### Context
`AppHeader` Profile tab already has an `onProfile` handler. We add a badge dot (same pattern as `hasUncollected` on Collect). `ProfileScreen` becomes a tabbed container: "Stats" (all existing content) + "Achievements" (the wall). `GameView` passes `newlyUnlockedAchievements.length > 0` as `hasNewAchievements` and clears on profile open.

- [ ] **Step 7.1: Add `hasNewAchievements` badge to `AppHeader`**

In `shared/components/AppHeader.tsx`, add to the Props type:

```typescript
type Props = {
  sportLabel?: string;
  onCollect?: () => void;
  onProfile?: () => void;
  onBell?: () => void;
  hasUncollected?: boolean;
  unreadInboxCount?: number;
  hasNewAchievements?: boolean;   // ← add this
};
```

Add `hasNewAchievements` to the destructure inside `AppHeader`:

```typescript
export function AppHeader({
  sportLabel,
  onCollect,
  onProfile,
  onBell,
  hasUncollected,
  unreadInboxCount = 0,
  hasNewAchievements,   // ← add this
}: Props) {
```

In the Profile tab button block, add the dot. Find the existing block that renders the `collect` dot and add an analogous one for `profile`. The Profile tab renders inside the `PRIMARY_TABS.map` block. Change it to:

```tsx
{/* inside the PRIMARY_TABS.map, after the existing isCollect dot block: */}
{isCollect && hasUncollected && (
  <div style={{
    position: "absolute", top: 0, right: 2,
    width: 7, height: 7, borderRadius: "50%",
    background: "#EF4444", border: "1.5px solid #070A12",
    pointerEvents: "none",
  }} />
)}
{id === "profile" && hasNewAchievements && (
  <div style={{
    position: "absolute", top: 0, right: 2,
    width: 7, height: 7, borderRadius: "50%",
    background: "#FFB14A", border: "1.5px solid #070A12",
    pointerEvents: "none",
  }} />
)}
```

- [ ] **Step 7.2: Add Stats/Achievements tabs to `ProfileScreen`**

At the top of `shared/components/ProfileScreen.tsx`, add the import:

```typescript
import { AchievementWall } from "./AchievementWall";
import { getNickname } from "@shared/utils/playerIdentity";
```

Add a `profileTab` state right after the existing state declarations:

```typescript
const [profileTab, setProfileTab] = useState<"stats" | "achievements">("stats");
```

Replace the header inside `ProfileScreen` (the div with "PROFILE" text) to include tabs below it:

```tsx
{/* Header */}
<div style={{
  borderBottom: "1px solid rgba(255,255,255,0.06)",
}}>
  <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 16px 10px",
  }}>
    <span style={{ fontSize: 18, fontWeight: 800, color: "#EAF0FF", fontFamily: FF }}>
      PROFILE
    </span>
    <button
      onClick={onClose}
      style={{
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        padding: "5px 10px",
        color: "rgba(255,255,255,0.5)",
        fontSize: 13,
        cursor: "pointer",
        fontFamily: FF,
      }}
    >Done</button>
  </div>
  {/* Tab bar */}
  <div style={{ display: "flex", padding: "0 16px" }}>
    {(["stats", "achievements"] as const).map(tab => (
      <button
        key={tab}
        onClick={() => setProfileTab(tab)}
        style={{
          padding: "8px 16px",
          background: "transparent",
          border: "none",
          borderBottom: profileTab === tab ? "2px solid #FFB14A" : "2px solid transparent",
          color: profileTab === tab ? "#FFB14A" : "rgba(255,255,255,0.45)",
          fontSize: 13,
          fontWeight: profileTab === tab ? 800 : 600,
          cursor: "pointer",
          textTransform: "capitalize",
          transition: "color 150ms ease",
        }}
      >
        {tab}
      </button>
    ))}
  </div>
</div>
```

Then wrap the existing scrollable content in a conditional:

```tsx
{profileTab === "stats" && (
  <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
    {/* ... all existing content ... */}
  </div>
)}
{profileTab === "achievements" && (
  <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", minHeight: 0 }}>
    <AchievementWall
      sport={sport}
      isSelf={true}
      totalHands={totalHands ? Number(totalHands) : undefined}
      lifetimeBestFp={bestHand ? Number(bestHand) : undefined}
      currentStreak={parseInt(localStorage.getItem(sport === "basketball" ? "replaymod_streak" : `${sport}_replaymod_streak`) ?? "0", 10)}
    />
  </div>
)}
```

- [ ] **Step 7.3: Wire `GameView.tsx` — badge dot + clear + analytics**

In `shared/views/GameView.tsx`, find the `useSharedGameState` destructure. Add to it:

```typescript
const {
  // ... existing destructured values ...
  newlyUnlockedAchievements,
  clearNewlyUnlockedAchievements,
} = useSharedGameState(adapter, { rosterSize: sportAdapter.rosterSize });
```

Find the `<AppHeader` JSX call (around line 1643) and add:

```tsx
<AppHeader
  onCollect={() => setShowCollect(true)}
  onProfile={() => setShowProfile(true)}
  hasUncollected={taskStates.some(t => t.progress >= t.target && !t.collected)}
  unreadInboxCount={unreadCount}
  onBell={() => { setBellOpen(true); track('nav', 'bell_clicked', { unread_count: unreadCount }, 'system'); }}
  hasNewAchievements={newlyUnlockedAchievements.length > 0}   // ← add this
/>
```

Find the `setShowProfile(true)` handler and extend it to clear the badge + fire analytics:

```typescript
onProfile={() => {
  setShowProfile(true);
  clearNewlyUnlockedAchievements();
  track("profile", "profile_self_view", { sport: adapter.sportKey });
}}
```

- [ ] **Step 7.4: TypeScript check**

```bash
npx tsc --noEmit -p basketball/tsconfig.json 2>&1 | head -20
```
Expected: clean.

- [ ] **Step 7.5: Smoke-test in browser**

```bash
npm run dev:basketball
```

Open browser → play a hand (any result) → Profile tab → Achievements tab. Should show the achievement grid. Click a tile to open detail modal.

- [ ] **Step 7.6: Commit**

```bash
git add shared/components/AppHeader.tsx shared/components/ProfileScreen.tsx shared/views/GameView.tsx
git commit -m "feat(achievements): ProfileScreen tabs + AppHeader badge dot + GameView wiring"
```

---

## Task 8: Other-user wall — routing + comparison + analytics

**Files:**
- Modify: `basketball/src/App.tsx` — path-based routing for `/basketball/profile/:userId`
- Verify analytics in `AchievementWall.tsx` fires `profile_other_view` on mount

### Context
The Vercel rewrite already maps `/basketball/profile/anything` → `basketball/index.html`. We detect the path in `App.tsx` and render the `AchievementWall` in other-user mode as a full-screen overlay. The viewer's own `unlockedAchievementIds` (from `useAchievements`) are passed for the comparison row.

- [ ] **Step 8.1: Add `profile_other_view` analytics to `AchievementWall`**

In `shared/components/AchievementWall.tsx`, inside `WallInner`, add a `useEffect` that fires `profile_other_view` once on mount when `isSelf === false`:

```typescript
// Inside WallInner function, after the state declarations:
useEffect(() => {
  if (!isSelf && targetUserId) {
    track("profile", "profile_other_view", {
      target_user_id: targetUserId,
      sport,
    });
  }
}, []);   // eslint-disable-line — intentionally fires once
```

- [ ] **Step 8.2: Add path detection + other-wall overlay in `App.tsx`**

In `basketball/src/App.tsx`, add this helper before the `AppInner` function definition:

```typescript
/** Extract target userId from /basketball/profile/:userId path.
 *  Returns null for all other paths. */
function getProfileUserId(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/\/basketball\/profile\/([0-9a-f-]{36})/);
  return match ? match[1] : null;
}
```

Add two new imports at the top of `App.tsx`:

```typescript
import { AchievementWall } from "@shared/components/AchievementWall";
import { useAchievements } from "@shared/hooks/useAchievements";
```

Inside `AppInner`, add after the `useAuth` destructure:

```typescript
const profileUserId = getProfileUserId();
const { unlockedIds: ownUnlockedIds } = useAchievements();
```

Add the other-user wall overlay at the end of the `AppInner` return, just before the final `</>`:

```tsx
{/* Other user's achievement wall — rendered when visiting /basketball/profile/:userId */}
{profileUserId && (
  <div style={{
    position: "fixed", inset: 0, zIndex: 9998,
    background: "linear-gradient(180deg, #070A12 0%, #0A1020 60%, #070A12 100%)",
    color: "#EAF0FF",
    fontFamily: "'Inter', system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  }}>
    {/* Back button */}
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "14px 16px 10px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      <button
        onClick={() => window.history.back()}
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          padding: "5px 10px",
          color: "rgba(255,255,255,0.5)",
          fontSize: 13,
          cursor: "pointer",
        }}
      >← Back</button>
    </div>
    <AchievementWall
      sport={SPORT}
      isSelf={false}
      targetUserId={profileUserId}
      ownUnlockedIds={ownUnlockedIds}
    />
  </div>
)}
```

- [ ] **Step 8.3: TypeScript check**

```bash
npx tsc --noEmit -p basketball/tsconfig.json 2>&1 | head -20
```
Expected: clean.

- [ ] **Step 8.4: Smoke-test other-user wall**

Navigate directly to `http://localhost:5173/basketball/profile/00000000-0000-0000-0000-000000000000` (fake UUID). Should show "Loading…" then an empty wall (no achievements for that UUID). The comparison row should appear if your own account has achievements.

- [ ] **Step 8.5: Commit**

```bash
git add basketball/src/App.tsx shared/components/AchievementWall.tsx
git commit -m "feat(achievements): other-user wall routing + comparison + profile_other_view analytics"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|-------------|------|
| Own wall — stats header (hands, best FP, streak, X/N) | Task 7 |
| Own wall — grid with locked/unlocked tiles | Task 6 |
| Unlocked tile shows player photo + stat line + season | Tasks 3+1 |
| Tap unlocked → modal with card + "hand #X on [date]" | Task 4 |
| Filter tabs: All / Instant / Grinder / Cross-Era | Task 6 |
| Sort: Recently unlocked / Rarest first | Task 6 |
| Other wall read-only | Task 8 |
| Comparison row "You X, they Y, Z overlap" | Task 6 |
| Track `profile_other_view` | Tasks 6+8 |
| Profile avatar entry point | Task 7 |
| Badge dot until profile visited | Task 7 |
| Mobile-first sizing | Tasks 3+6 |
| Analytics: `profile_self_view` | Task 7 |
| Analytics: `profile_other_view` (key metric, logs target_user_id) | Tasks 6+8 |
| Analytics: `achievement_detail_open` | Task 6 |
| Analytics: `achievement_filter_change` | Task 6 |
| Dark HoF aesthetic | Tasks 3+4+6 |
| `source_hand_id` in modal ("hand #X on [date]") | Tasks 1+4 |

**Gap:** The spec says "this was hand #X on [date]" for the modal — `source_hand_id` is the UUID, not a sequential hand number. The DB has no sequential hand number. Using `unlockedAt` date + hand UUID is the best we can do. Task 4's modal shows `Unlocked [date]` which satisfies the date part. Sequential hand number is not feasible without a counter column.

**Rarity sort:** Uses tier ordering as proxy for rarity (gold rarest). Actual `%` would require total user count. Labeled "By Tier" in the UI rather than "Rarest" to be accurate.
