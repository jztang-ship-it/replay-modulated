/**
 * serverGameAdapter.ts — Server-backed game adapter
 *
 * Drop-in replacement for gameAdapter.ts functions.
 * Same interface: dealInitialRoster(), redrawRoster(), resolveRoster()
 * But calls /api/hand/deal and /api/hand/draw instead of running locally.
 *
 * GameView.tsx doesn't need to change — just swap which adapter it imports.
 */

import type { PlayerCard, Achievement, GameInfo } from "./types";
import { supabase } from "@shared/lib/supabase";

const API_BASE = "/api/hand";

// ── Auth helpers ────────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  // Try to get existing session first
  let { data } = await supabase.auth.getSession();
  let token = data?.session?.access_token;

  // If no session, try anonymous sign-in (auto-creates user)
  if (!token) {
    const { data: anonData, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error("[serverGameAdapter] Anonymous sign-in failed:", error.message);
      throw new Error("Not authenticated");
    }
    token = anonData?.session?.access_token;
  }

  if (!token) throw new Error("Not authenticated");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ── State: tracks handId between deal and draw ──────────────────────────────

let _currentHandId: string | null = null;
let _currentBetAmount: number = 10;
let _serverBalance: number | null = null;

export function getCurrentHandId(): string | null { return _currentHandId; }
export function getServerBalance(): number | null { return _serverBalance; }

// ── Map server card → PlayerCard ────────────────────────────────────────────

function toPlayerCard(serverCard: any, slot: number): PlayerCard {
  return {
    cardId: serverCard.player?.playerId ?? serverCard.playerId ?? `card-${slot}`,
    basePlayerId: serverCard.player?.playerId ?? serverCard.playerId ?? "",
    name: serverCard.player?.name ?? serverCard.name ?? "",
    team: serverCard.player?.team ?? serverCard.team ?? "",
    season: "2024-25",
    position: serverCard.position ?? "",
    tier: (serverCard.player?.tier ?? serverCard.tier ?? "WHITE") as any,
    salary: serverCard.player?.salary ?? serverCard.salary ?? 0,
    projectedFp: 0, // server doesn't send projections for deal
    actualFp: 0,     // not resolved yet at deal time
    fpDelta: 0,
    gameInfo: { date: "", opponent: "", homeAway: undefined },
    statLine: {},
    achievements: [],
    slotIndex: slot,
    wasHeld: false,
  };
}

function toResolvedPlayerCard(serverCard: any): PlayerCard {
  const stats = serverCard.stats ?? {};
  const badges: Achievement[] = (serverCard.badges ?? []).map((b: any) => ({
    id: b.id,
    label: b.label,
    icon: b.icon,
    fp: b.fp,
  }));

  return {
    cardId: serverCard.player?.playerId ?? `card-${serverCard.slot}`,
    basePlayerId: serverCard.player?.playerId ?? "",
    name: serverCard.player?.name ?? "",
    team: serverCard.player?.team ?? "",
    season: "2024-25",
    position: serverCard.position ?? "",
    tier: (serverCard.player?.tier ?? "WHITE") as any,
    salary: serverCard.player?.salary ?? 0,
    projectedFp: 0,
    actualFp: serverCard.fp ?? 0,
    fpDelta: serverCard.fp ?? 0,
    gameInfo: {
      date: stats.gameDate ?? "",
      opponent: stats.matchup ?? "",
      homeAway: undefined,
    },
    statLine: {
      pts: stats.pts ?? 0,
      reb: stats.reb ?? 0,
      ast: stats.ast ?? 0,
      stl: stats.stl ?? 0,
      blk: stats.blk ?? 0,
      turnovers: stats.turnovers ?? 0,
      min: stats.min ?? 0,
    },
    achievements: badges,
    slotIndex: serverCard.slot ?? 0,
    wasHeld: serverCard.wasHeld ?? false,
    dailyBonus: serverCard.dailyBonus ?? 0,
  };
}

// ── dealInitialRoster ───────────────────────────────────────────────────────

export async function dealInitialRoster(betMultiplier: number = 1): Promise<{ roster: PlayerCard[] }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/deal`, {
    method: "POST",
    headers,
    body: JSON.stringify({ betMultiplier }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Deal failed");

  _currentHandId = data.handId;
  _currentBetAmount = data.betAmount;
  _serverBalance = data.balance;

  const roster = data.cards.map((card: any, i: number) => toPlayerCard(card, i));
  return { roster };
}

// ── redrawRoster + resolveRoster combined ───────────────────────────────────
// The server's /draw endpoint does both redraw and resolve in one call.
// We split the result back into the two-phase interface GameView expects.

let _pendingDrawResponse: any = null;

export async function redrawRoster({
  currentCards,
  lockedCardIds,
}: {
  currentCards: PlayerCard[];
  lockedCardIds: Set<string>;
}): Promise<{ roster: PlayerCard[] }> {
  if (!_currentHandId) throw new Error("No active hand — deal first");

  const heldIndices: number[] = [];
  currentCards.forEach((c, i) => {
    const id = String((c as any).cardId ?? (c as any).basePlayerId ?? "");
    if (lockedCardIds.has(id)) heldIndices.push(i);
  });

  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/draw`, {
    method: "POST",
    headers,
    body: JSON.stringify({ handId: _currentHandId, heldIndices }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Draw failed");

  // Cache the full response for resolveRoster to consume
  _pendingDrawResponse = data;
  _currentHandId = null; // hand is consumed

  // Return cards WITHOUT stats/FP yet — GameView expects redraw to return
  // unresolved cards. resolveRoster fills in actualFp/statLine/achievements.
  const roster = data.cards.map((card: any) => {
    const pc = toPlayerCard(card, card.slot);
    pc.wasHeld = card.wasHeld;
    return pc;
  });

  return { roster };
}

export async function resolveRoster({
  finalCards,
}: {
  finalCards: PlayerCard[];
}): Promise<{ roster: PlayerCard[]; mvpCardId?: string }> {
  // Use the cached draw response — server already resolved everything
  const data = _pendingDrawResponse;
  if (!data) throw new Error("No pending draw response — redraw first");
  _pendingDrawResponse = null;

  // Update balance from server
  _serverBalance = data.summary?.newBalance ?? _serverBalance;

  // Build fully resolved cards with stats, badges, FP
  const roster = data.cards.map((card: any) => toResolvedPlayerCard(card));

  // Find MVP (highest actualFp)
  let mvpCardId: string | undefined;
  let maxFp = -1;
  for (const c of roster) {
    const baseFp = c.actualFp - (c.dailyBonus ?? 0); // MVP excludes daily bonus
    if (baseFp > maxFp) {
      maxFp = baseFp;
      mvpCardId = c.cardId;
    }
  }

  return { roster, mvpCardId };
}

// ── Utility: get last draw result for payout display ────────────────────────

export function getLastDrawSummary(): any | null {
  return _pendingDrawResponse?.summary ?? null;
}
