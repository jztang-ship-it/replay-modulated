/**
 * PlayerCard.tsx — World Cup
 * Ported from basketball AthleteCard.tsx + AthleteCardFront.tsx
 *
 * Football adaptations:
 * - Flag emoji instead of NBA headshot photo
 * - Football positions: GK, DEF, MID, FWD
 * - BackStats shows football stat lines
 *
 * Card flip architecture matches basketball exactly:
 * - Default face (not flipped) = CardFront (player card)
 * - Flipped face = CardBackGeneric (during game) or BackStats (in results)
 * - flipped=true means showing back face
 */

import React, { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { GamePhase, PlayerCard as PlayerCardType } from "../adapters/types";
import { CardBackGeneric } from "./CardBackGeneric";
import type { ShakeType } from "../hooks/useEmotionalReveal";

// ── CSS injected once ────────────────────────────────────────────────────────

const STYLE_ID = "player-card-styles-wc-v1";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .wc-card-inner {
      position: relative; width: 100%; height: 100%;
      transform-style: preserve-3d;
      transition: transform var(--flip-ms, 450ms) cubic-bezier(0.4, 0.0, 0.2, 1);
      will-change: transform;
      background: #0a0c10;
      border-radius: 18px;
    }
    .wc-card-inner.no-transition { transition: none !important; }
    .wc-card-inner.is-flipped { transform: rotateY(180deg); }
    .wc-card-face {
      position: absolute; inset: 0; border-radius: 18px;
      backface-visibility: hidden; -webkit-backface-visibility: hidden;
      overflow: hidden;
    }
    .wc-card-face-back { transform: rotateY(180deg); }

    @keyframes wcShakeHype {
      0%   { transform: translate(0,0) rotate(0deg); }
      10%  { transform: translate(-3px,-2px) rotate(-1.5deg); }
      20%  { transform: translate(3px,2px) rotate(1.5deg); }
      30%  { transform: translate(-4px,1px) rotate(-2deg); }
      40%  { transform: translate(4px,-1px) rotate(2deg); }
      50%  { transform: translate(-3px,2px) rotate(-1deg); }
      60%  { transform: translate(3px,-2px) rotate(1deg); }
      70%  { transform: translate(-2px,1px) rotate(-1.5deg); }
      80%  { transform: translate(2px,-1px) rotate(1.5deg); }
      90%  { transform: translate(-1px,1px) rotate(-0.5deg); }
      100% { transform: translate(0,0) rotate(0deg); }
    }
    @keyframes wcShakeBig {
      0%   { transform: translate(0,0) rotate(0deg) scale(1); }
      8%   { transform: translate(-5px,-3px) rotate(-2.5deg) scale(1.02); }
      16%  { transform: translate(6px,3px) rotate(2.5deg) scale(1.04); }
      24%  { transform: translate(-7px,2px) rotate(-3deg) scale(1.06); }
      32%  { transform: translate(7px,-2px) rotate(3deg) scale(1.08); }
      40%  { transform: translate(-6px,3px) rotate(-2deg) scale(1.06); }
      48%  { transform: translate(6px,-3px) rotate(2deg) scale(1.04); }
      58%  { transform: translate(-4px,2px) rotate(-2.5deg) scale(1.10); }
      68%  { transform: translate(4px,-2px) rotate(2.5deg) scale(1.12); }
      80%  { transform: translate(-2px,1px) rotate(-1deg) scale(1.08); }
      90%  { transform: translate(1px,-1px) rotate(0.5deg) scale(1.04); }
      100% { transform: translate(0,0) rotate(0deg) scale(1); }
    }
    @keyframes wcShakeCold {
      0%   { transform: translate(0,0) rotate(0deg); }
      15%  { transform: translate(-6px,0) rotate(-1deg); }
      30%  { transform: translate(5px,0) rotate(1deg); }
      45%  { transform: translate(-4px,0) rotate(-0.7deg); }
      60%  { transform: translate(3px,0) rotate(0.5deg); }
      75%  { transform: translate(-2px,0) rotate(-0.3deg); }
      88%  { transform: translate(1px,0) rotate(0.2deg); }
      100% { transform: translate(0,0) rotate(0deg); }
    }
    .wc-shake-hype { animation: wcShakeHype 0.6s cubic-bezier(0.36,0.07,0.19,0.97) both; }
    .wc-shake-big  { animation: wcShakeBig  0.6s cubic-bezier(0.36,0.07,0.19,0.97) both; }
    .wc-shake-cold { animation: wcShakeCold 0.65s ease-in-out both; }

    @keyframes wcStampIn {
      0%   { transform: translate(-50%,-50%) scale(2.5) rotate(-8deg); opacity: 0; }
      40%  { transform: translate(-50%,-50%) scale(0.92) rotate(2deg); opacity: 1; }
      60%  { transform: translate(-50%,-50%) scale(1.05) rotate(-1deg); }
      80%  { transform: translate(-50%,-50%) scale(0.98) rotate(0.5deg); }
      100% { transform: translate(-50%,-50%) scale(1) rotate(-3deg); opacity: 1; }
    }
    @keyframes wcPulseRing {
      0%   { transform: scale(1.00); opacity: 0.35; }
      35%  { transform: scale(1.02); opacity: 0.70; }
      70%  { transform: scale(1.01); opacity: 0.45; }
      100% { transform: scale(1.00); opacity: 0.35; }
    }
    @keyframes wcBadgePop {
      0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
      60%  { transform: scale(1.3) rotate(5deg);  opacity: 1; }
      80%  { transform: scale(0.9) rotate(-2deg); }
      100% { transform: scale(1)   rotate(0deg);  opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// ── Country flags ────────────────────────────────────────────────────────────

const TEAM_FLAGS: Record<string, string> = {
  "France":"🇫🇷","Brazil":"🇧🇷","Argentina":"🇦🇷","Germany":"🇩🇪","Spain":"🇪🇸",
  "England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Portugal":"🇵🇹","Netherlands":"🇳🇱","Belgium":"🇧🇪","Croatia":"🇭🇷",
  "Morocco":"🇲🇦","Uruguay":"🇺🇾","Japan":"🇯🇵","South Korea":"🇰🇷","Senegal":"🇸🇳",
  "Australia":"🇦🇺","Mexico":"🇲🇽","USA":"🇺🇸","Canada":"🇨🇦","Ecuador":"🇪🇨",
  "Qatar":"🇶🇦","Saudi Arabia":"🇸🇦","Iran":"🇮🇷","Poland":"🇵🇱","Denmark":"🇩🇰",
  "Switzerland":"🇨🇭","Serbia":"🇷🇸","Cameroon":"🇨🇲","Ghana":"🇬🇭","Tunisia":"🇹🇳",
  "Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Costa Rica":"🇨🇷",
};
function getFlag(team: string): string { return TEAM_FLAGS[team] ?? "🏳️"; }

// ── Tier theming ─────────────────────────────────────────────────────────────

type TierTheme = { bg: string; frame: string; glow: string };

function tierTheme(tierRaw: any): TierTheme {
  const t = String(tierRaw ?? "").toUpperCase();
  if (t.includes("ORANGE")) return { bg: "linear-gradient(160deg, #2A1500 0%, #1A0D00 40%, #0F0800 100%)", frame: "rgba(255,160,50,0.90)", glow: "rgba(255,140,30,0.28)" };
  if (t.includes("PURPLE")) return { bg: "linear-gradient(160deg, #1A0D2E 0%, #110920 40%, #080612 100%)", frame: "rgba(175,100,255,0.88)", glow: "rgba(160,90,255,0.26)" };
  if (t.includes("BLUE"))   return { bg: "linear-gradient(160deg, #071828 0%, #04101C 40%, #020A12 100%)", frame: "rgba(70,155,255,0.88)",  glow: "rgba(60,140,255,0.24)"  };
  if (t.includes("GREEN"))  return { bg: "linear-gradient(160deg, #061A0F 0%, #04120A 40%, #020A06 100%)", frame: "rgba(60,210,120,0.88)",  glow: "rgba(50,200,110,0.22)"  };
  return { bg: "linear-gradient(160deg, #141820 0%, #0D1118 40%, #080A10 100%)", frame: "rgba(200,215,240,0.55)", glow: "rgba(200,215,240,0.12)" };
}

function pulsePalette(pulse?: number) {
  if (!pulse || pulse < 0.12) return { ring: "rgba(255,255,255,0.10)", glow: "rgba(255,255,255,0.06)" };
  if (pulse > 0.35) return { ring: "rgba(255,150,70,0.50)", glow: "rgba(255,140,60,0.22)" };
  return { ring: "rgba(120,180,235,0.50)", glow: "rgba(110,170,230,0.20)" };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function initialsFromName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

function truncateLast(s: string, max = 11) {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function round1(n: number) { return Math.round(n * 10) / 10; }

// ── Overlay state ─────────────────────────────────────────────────────────────

type OverlayState = { stamp: "CAREER NIGHT" | "ICE COLD" | null; stamping: boolean };
const overlayMap = new Map<string, OverlayState>();
export function resetAllOverlays() { overlayMap.clear(); }

// ── BackStats ─────────────────────────────────────────────────────────────────

const POSITION_STAT_ORDER: Record<string, string[]> = {
  GK:      ["saves", "goals_conceded", "clearances", "blocked_shots", "pressures"],
  DEF:     ["tackles", "interceptions", "clearances", "blocked_shots", "dribbles_completed"],
  MID:     ["key_passes", "tackles", "interceptions", "dribbles_completed", "pressures"],
  FWD:     ["goals", "assists", "shots_on_target", "key_passes", "dribbles_completed"],
  default: ["goals", "assists", "key_passes", "tackles", "saves"],
};

const STAT_LABELS: Record<string, string> = {
  goals: "GOALS", assists: "ASSISTS", shots_on_target: "SOT", key_passes: "KEY PASS",
  tackles: "TACKLES", interceptions: "INT", clearances: "CLEAR", blocked_shots: "BLOCKS",
  pressures: "PRESS", saves: "SAVES", goals_conceded: "GA", yellow_cards: "YC",
  red_cards: "RC", dribbles_completed: "DRIB",
};

function getFootballStats(pos: string, statLine: Record<string, any>) {
  const order = POSITION_STAT_ORDER[pos] ?? POSITION_STAT_ORDER.default;
  const result: Array<{ key: string; label: string; value: any }> = [];
  for (const key of order) {
    const v = statLine?.[key];
    if (v !== undefined && v !== null) {
      result.push({ key, label: STAT_LABELS[key] ?? key.toUpperCase(), value: v });
    }
  }
  if (result.length < 5) {
    for (const [k, v] of Object.entries(statLine ?? {})) {
      if (result.length >= 6) break;
      if (result.find(r => r.key === k)) continue;
      if (Number(v) === 0) continue;
      result.push({ key: k, label: STAT_LABELS[k] ?? k.toUpperCase(), value: v });
    }
  }
  return result.slice(0, 6);
}

function BackStats({ card }: { card: PlayerCardType }) {
  const gi = (card as any).gameInfo || {};
  const sl = (card as any).statLine || {};
  const actual = Number((card as any).actualFp ?? 0);
  const rawDate = gi.date || gi.kickoff_time || sl.kickoff_time || sl.date || "";
  const dateStr = fmtDate(String(rawDate));
  const rawOpp  = gi.opponent || gi.opponent_team || "";
  const opponent = String(rawOpp).trim();
  const ha = gi.homeAway || (sl.was_home === true ? "H" : sl.was_home === false ? "A" : "");
  const oppStr = opponent ? `${ha === "A" ? "@" : "vs"} ${opponent.toUpperCase()}` : "";
  const badgesData: Array<{icon:string;label:string;fp:number}> = Array.isArray((card as any).achievements) ? (card as any).achievements.filter(Boolean) : [];
  const badgeFpBonus = badgesData.reduce((s, b) => s + (b.fp ?? 0), 0);
  const tiles = useMemo(() => getFootballStats(card.position as string, sl), [card.position, sl]);
  const hasStats = Object.keys(sl).length > 0;

  return (
    <div style={{ height: "100%", padding: "10px 10px 8px", display: "flex", flexDirection: "column", gap: 8, background: "linear-gradient(180deg,rgba(11,15,20,0.97),rgba(11,15,20,1.0))", borderRadius: 18, overflow: "hidden", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.90)" }}>{dateStr || "—"}</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.65)", textAlign: "right" }}>{oppStr || "—"}</div>
      </div>
      <div style={{ height: 28, display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap", minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.65)" }}>FP</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: "rgba(255,255,255,0.95)" }}>{round1(actual)}</span>
          {badgeFpBonus > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#FFD700", alignSelf: "flex-end", marginBottom: 2 }}>(+{badgeFpBonus})</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "nowrap", flex: 1, overflow: "hidden" }}>
          {badgesData.slice(0, 5).map((b: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0, background: "rgba(0,0,0,0.55)", borderRadius: 6, padding: "2px 5px", border: "1px solid rgba(255,255,255,0.18)" }}>
              <span style={{ fontSize: 13, lineHeight: 1 }}>{b.icon}</span>
              <span style={{ fontSize: 7, fontWeight: 700, color: "#FFD700", letterSpacing: 0.3 }}>+{b.fp}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
      {!hasStats ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.70)" }}>No stats loaded</div>
        </div>
      ) : tiles.length > 0 ? (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 4, alignContent: "start", minWidth: 0 }}>
          {tiles.map(s => (
            <div key={s.key} style={{ borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", padding: "3px 6px", display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <div style={{ fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,0.55)", lineHeight: "10px" }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>{String(s.value)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.70)" }}>Stats available</div>
        </div>
      )}
      <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.30)", letterSpacing: 0.4, textAlign: "center" }}>TAP TO FLIP BACK</div>
    </div>
  );
}

// ── CardFront ─────────────────────────────────────────────────────────────────

const DOCK_H   = "20%";
const BADGE_H  = 26;
const DOCK_GAP = 4;
const DOCK_PAD = 6;

function CardFront({
  card, phase, isLocked, isMvp, isFlipped, canFlip, onToggleFlip,
  visibleFp, visibleBadgeCount, isRevealing, revealActive,
  pulse, fpCountUpMs, stamp, onRollComplete, badges,
}: {
  card: PlayerCardType;
  phase: GamePhase;
  isLocked: boolean;
  isMvp: boolean;
  isFlipped: boolean;
  canFlip: boolean;
  onToggleFlip: () => void;
  visibleFp?: number;
  visibleBadgeCount?: number;
  isRevealing?: boolean;
  revealActive?: boolean;
  pulse?: number;
  fpCountUpMs?: number;
  stamp?: "CAREER NIGHT" | "ICE COLD" | null;
  onRollComplete?: () => void;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
}) {
  const name        = String((card as any).name ?? "");
  const team        = String((card as any).team ?? "");
  const pos         = String((card as any).position ?? "");
  const salary      = Number((card as any).salary ?? 0);
  const proj        = Number((card as any).projectedFp ?? 0);
  const tier        = tierTheme((card as any).tier);
  const flag        = getFlag(team);
  const showResults = phase === "RESULTS";
  const fadeOpacity = (isRevealing && revealActive && visibleFp !== undefined && visibleFp > 0) ? 0.15 : 1;
  const pulsePal    = pulsePalette(pulse);
  const showPulse   = !!pulse && pulse > 0.12;

  const [displayedFp, setDisplayedFp]     = useState(0);
  const [isRolling, setIsRolling]         = useState(false);
  const [rollComplete, setRollComplete]   = useState(false);
  const targetFpRef                       = useRef<number | null>(null);
  const cardKey = String((card as any).cardId ?? (card as any).basePlayerId ?? "");

  useEffect(() => {
    if (!isRevealing || !revealActive) return;
    const finalTarget = Number((card as any).actualFp ?? 0);
    if (!Number.isFinite(finalTarget) || finalTarget <= 0) return;
    if (targetFpRef.current === null) targetFpRef.current = finalTarget;
  }, [card, isRevealing, revealActive]);

  useEffect(() => { targetFpRef.current = null; }, [cardKey]);

  useEffect(() => {
    if (visibleFp === undefined) { setDisplayedFp(showResults ? 0 : proj); return; }
    if (isRevealing && !revealActive) return;
    const target = targetFpRef.current ?? visibleFp;
    if (visibleFp > 0 && displayedFp !== target) {
      if (target === 0) { setDisplayedFp(0); setIsRolling(false); setRollComplete(true); onRollComplete?.(); return; }
      setIsRolling(true); setRollComplete(false);
      const duration = Math.max(220, Math.min(2200, Number(fpCountUpMs ?? 500)));
      const startTime = Date.now();
      let raf = 0;
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayedFp(target * eased);
        if (progress < 1) { raf = requestAnimationFrame(animate); }
        else { setDisplayedFp(target); setIsRolling(false); setRollComplete(true); onRollComplete?.(); }
      };
      raf = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(raf);
    }
  }, [visibleFp, fpCountUpMs, revealActive, isRevealing]);

  useEffect(() => { setRollComplete(false); setDisplayedFp(0); setIsRolling(false); }, [cardKey]);

  const fpValue      = showResults ? (visibleFp !== undefined ? displayedFp : 0) : proj;
  const valueText    = Number.isFinite(fpValue) ? fpValue.toFixed(1) : "0.0";
  const badgeBonusFp = useMemo(() => badges?.reduce((s, b) => s + (b.fp ?? 0), 0) ?? 0, [badges]);
  const hasBadges    = badges && badges.length > 0;
  const hasRevealed  = rollComplete || (!!isRevealing && !!revealActive && visibleFp !== undefined && visibleFp > 0);
  const showHold     = isLocked || (card as any).wasHeld;
  const shadowText   = "0 2px 8px rgba(0,0,0,0.55)";
  const initials     = initialsFromName(name || team);
  const nameParts    = name.split(/\s+/).filter(Boolean);
  const first        = nameParts[0] ?? "";
  const last         = truncateLast(nameParts.slice(1).join(" ") || nameParts[0] || "", 11);

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%", borderRadius: 18, overflow: "hidden",
      background: tier.bg, border: `2px solid ${tier.frame}`,
      boxShadow: `0 18px 40px rgba(0,0,0,0.50), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 0 30px ${tier.glow}`,
    }}>
      {/* Tier glow */}
      <div style={{ position: "absolute", inset: -40, pointerEvents: "none", background: `radial-gradient(closest-side at 30% 20%, ${tier.glow} 0%, rgba(0,0,0,0) 70%)`, opacity: 0.7 }} />

      {/* Pulse ring */}
      {showPulse && hasRevealed && (
        <div style={{ position: "absolute", inset: -2, borderRadius: 20, pointerEvents: "none", border: `2px solid ${pulsePal.ring}`, animation: "wcPulseRing 950ms ease-in-out infinite", filter: "blur(0.2px)", zIndex: 5 }} />
      )}

      {/* Hold indicator */}
      {showHold && <>
        <div style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0, borderTop: "42px solid rgba(245,200,80,0.95)", borderRight: "42px solid transparent", zIndex: 7, pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 14, left: 14, transform: "translate(-50%,-50%)", zIndex: 8, pointerEvents: "none", fontSize: 12, fontWeight: 950, color: "rgba(0,0,0,0.92)" }}>H</div>
      </>}

      {/* Salary tag */}
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 6, pointerEvents: "none", padding: "5px 9px", borderRadius: 12, background: "rgba(15,18,24,0.55)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.95)", fontWeight: 950, fontSize: 12, letterSpacing: 0.6, backdropFilter: "blur(10px)", opacity: fadeOpacity, transition: "opacity 0.3s ease" }}>${salary}</div>

      {/* Hero — big faded flag background */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <div style={{ fontSize: 72, lineHeight: 1, opacity: 0.22, transform: "scale(1.4) translateY(-8px)", filter: "blur(1px)", userSelect: "none" }}>{flag}</div>
        </div>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.65) 100%)" }} />
        {/* Flag + initials */}
        <div style={{ position: "absolute", top: "28%", left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: fadeOpacity, transition: "opacity 0.3s ease" }}>
          <span style={{ fontSize: 38, lineHeight: 1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.6))" }}>{flag}</span>
          <span style={{ fontSize: 28, fontWeight: 950, letterSpacing: 2, color: "rgba(255,255,255,0.80)", textShadow: "0 4px 16px rgba(0,0,0,0.8)", userSelect: "none" }}>{initials}</span>
        </div>
      </div>

      {/* Dock */}
      <div style={{ position: "absolute", left: DOCK_PAD, right: DOCK_PAD, bottom: DOCK_GAP, height: DOCK_H, borderRadius: 12, padding: "4px 10px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 1, background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.72))", borderTop: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 8px 20px rgba(0,0,0,0.35)", backdropFilter: "blur(14px)", zIndex: 6 }}>
        <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: shadowText, textAlign: "center", lineHeight: "1.1", color: "rgba(255,255,255,0.55)", opacity: fadeOpacity, transition: "opacity 0.3s ease" }}>
          {team.toUpperCase()} • {pos}
        </div>
        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: shadowText, lineHeight: "1.1", opacity: fadeOpacity, transition: "opacity 0.3s ease" }}>{first}</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: shadowText, lineHeight: "1.1", minWidth: 0, flex: 1, opacity: fadeOpacity, transition: "opacity 0.3s ease" }}>{last}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
            <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: 0.8, textShadow: shadowText, opacity: 0.60, lineHeight: "1.1" }}>{showResults ? "FP" : "PROJ"}</div>
            <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: 0.2, textShadow: shadowText, lineHeight: "1.1", transition: isRolling ? "none" : "transform 150ms ease", transform: isRolling ? "scale(1.05)" : "scale(1)" }}>
              {valueText}
              {showResults && badgeBonusFp > 0 && (
                <span style={{ fontSize: 8, fontWeight: 700, color: "#FFD700", marginLeft: 2, opacity: 0.90 }}>(+{badgeBonusFp})</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Badges strip */}
      {hasBadges && (
        <div style={{ position: "absolute", left: DOCK_PAD, right: DOCK_PAD, bottom: `calc(${DOCK_H} + ${DOCK_GAP}px + 3px)`, height: BADGE_H, display: "flex", gap: 3, justifyContent: "center", alignItems: "center", zIndex: 7, pointerEvents: "none", flexWrap: "nowrap", overflow: "hidden" }}>
          {badges!.slice(0, 5).map((badge, i) => (
            <div key={badge.id} style={{ animation: `wcBadgePop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) ${i * 90}ms both`, display: "flex", flexDirection: "row", alignItems: "center", gap: 2, background: "rgba(0,0,0,0.70)", backdropFilter: "blur(6px)", borderRadius: 6, padding: "2px 5px", border: "1px solid rgba(255,255,255,0.18)", flexShrink: 0 }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{badge.icon}</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: "#FFD700", letterSpacing: 0.3 }}>+{badge.fp}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stamp */}
      {stamp && (
        <div style={{ position: "absolute", bottom: hasBadges ? `calc(${DOCK_H} + ${DOCK_GAP}px + ${BADGE_H + 6}px)` : `calc(${DOCK_H} + ${DOCK_GAP}px + 6px)`, left: "50%", transform: "translateX(-50%) rotate(-3deg)", zIndex: 40, pointerEvents: "none", whiteSpace: "nowrap", fontSize: 13, fontWeight: 900, letterSpacing: 2.5, textTransform: "uppercase", color: stamp === "CAREER NIGHT" ? "#FFD700" : "#7DD3FC", textShadow: stamp === "CAREER NIGHT" ? "0 0 20px rgba(255,215,0,0.8), 0 2px 4px rgba(0,0,0,0.8)" : "0 0 20px rgba(125,211,252,0.8), 0 2px 4px rgba(0,0,0,0.8)", border: `2px solid ${stamp === "CAREER NIGHT" ? "#FFD700" : "#7DD3FC"}`, borderRadius: 4, padding: "4px 12px", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", animation: "wcStampIn 0.25s cubic-bezier(0.175,0.885,0.32,1.275) forwards" }}>{stamp}</div>
      )}
    </div>
  );
}

// ── PlayerCard (main export) ──────────────────────────────────────────────────

export type Props = {
  card: PlayerCardType;
  phase: GamePhase;
  locked?: boolean;
  isLocked?: boolean;
  isMvp?: boolean;
  flipped?: boolean;
  isFlipped?: boolean;
  canFlip?: boolean;
  onToggleLock?: () => void;
  onToggleFlip?: () => void;
  isRevealing?: boolean;
  visibleFp?: number;
  visibleBadgeCount?: number;
  noTransition?: boolean;
  flipDurationMs?: number;
  fpCountUpMs?: number;
  performanceTag?: any;
  pulse?: number;
  shakeType?: ShakeType | null;
  cardShakeType?: ShakeType | null;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
  isSpotlight?: boolean;
  spotlightLevel?: number;
  isDimmed?: boolean;
  onRollComplete?: () => void;
};

export function PlayerCard(props: Props) {
  const locked  = props.locked ?? props.isLocked ?? false;
  const flipped = props.flipped ?? props.isFlipped ?? false;
  const canFlip = props.canFlip ?? false;

  const {
    card, phase, isMvp = false, onToggleFlip,
    isRevealing, visibleFp, visibleBadgeCount,
    noTransition, flipDurationMs, fpCountUpMs,
    pulse, shakeType, cardShakeType, badges,
    isSpotlight, spotlightLevel, isDimmed,
  } = props;

  const id = String((card as any).cardId ?? "");

  // Economy freeze
  const economyRef = useRef<Map<string, {tier:any;salary:any;projectedFp:any}>>(new Map());
  useEffect(() => {
    if (!id) return;
    const m = economyRef.current;
    if (!m.has(id)) {
      m.set(id, { tier: (card as any).tier, salary: (card as any).salary, projectedFp: (card as any).projectedFp });
    }
  }, [id, card]);

  const stableCard = useMemo(() => {
    if (!id) return card;
    const snap = economyRef.current.get(id);
    if (!snap) return card;
    return { ...(card as any), tier: snap.tier, salary: snap.salary, projectedFp: snap.projectedFp } as PlayerCardType;
  }, [card, id]);

  // Overlay (stamp) state
  const [overlay, setOverlay]             = useState<OverlayState>({ stamp: null, stamping: false });
  const latchedShakeType                  = useRef<ShakeType>(null);
  const rollCompleteFiredRef              = useRef(false);

  useEffect(() => {
    setOverlay({ stamp: null, stamping: false });
    latchedShakeType.current = null;
    rollCompleteFiredRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!isRevealing) return;
    if (!cardShakeType) return;
    if (!latchedShakeType.current) latchedShakeType.current = cardShakeType;
  }, [cardShakeType, isRevealing]);

  useEffect(() => {
    if (!flipped) {
      if (!cardShakeType && !latchedShakeType.current) {
        overlayMap.delete(id);
        setOverlay({ stamp: null, stamping: false });
      }
    }
  }, [flipped, id, cardShakeType]);

  const handleRollComplete = useCallback(() => {
    const shake = latchedShakeType.current ?? cardShakeType ?? null;
    if (!shake) {
      if (!rollCompleteFiredRef.current) {
        rollCompleteFiredRef.current = true;
        props.onRollComplete?.();
      }
      return;
    }
    const stamp: OverlayState["stamp"] = shake === "big" || shake === "hype" ? "CAREER NIGHT" : "ICE COLD";
    const next: OverlayState = { stamp, stamping: true };
    overlayMap.set(id, next);
    setOverlay(next);
  }, [id, cardShakeType]);

  useEffect(() => {
    if (overlay.stamping) {
      const t = window.setTimeout(() => {
        setOverlay(prev => { const next = { ...prev, stamping: false }; overlayMap.set(id, next); return next; });
      }, 300);
      return () => clearTimeout(t);
    }
    if (overlay.stamp && !overlay.stamping && !rollCompleteFiredRef.current) {
      rollCompleteFiredRef.current = true;
      props.onRollComplete?.();
    }
  }, [overlay.stamping, overlay.stamp, id]);

  const shakeClass =
    shakeType === "big"  ? "wc-shake-big"  :
    shakeType === "hype" ? "wc-shake-hype" :
    shakeType === "cold" ? "wc-shake-cold" : "";

  const innerClass = [
    "wc-card-inner",
    flipped ? "is-flipped" : "",
    noTransition ? "no-transition" : "",
  ].filter(Boolean).join(" ");

  const innerStyle = {
    ["--flip-ms" as any]: `${Math.max(0, flipDurationMs ?? 450)}ms`,
  } as React.CSSProperties;

  return (
    <div
      className={shakeClass}
      style={{
        width: "100%", height: "100%", perspective: "1000px", position: "relative",
        transform: isSpotlight
          ? `scale(${spotlightLevel === 3 ? 1.08 : spotlightLevel === 2 ? 1.06 : 1.04})`
          : isDimmed ? "scale(0.97)" : "scale(1)",
        opacity: isDimmed ? 0.35 : 1,
        transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease",
        zIndex: isSpotlight ? 100 : 1,
        background: "#0a0c10",
      }}
    >
      <div className={innerClass} style={innerStyle}>
        {/* Default face (not flipped) = player front — matches basketball */}
        <div className="wc-card-face">
          <CardFront
            card={stableCard}
            phase={phase}
            isLocked={locked}
            isMvp={isMvp}
            isFlipped={flipped}
            canFlip={canFlip}
            onToggleFlip={onToggleFlip ?? (() => {})}
            visibleFp={visibleFp}
            visibleBadgeCount={visibleBadgeCount}
            isRevealing={isRevealing}
            revealActive={!!isRevealing && !!isSpotlight}
            pulse={pulse}
            fpCountUpMs={fpCountUpMs}
            onRollComplete={handleRollComplete}
            badges={badges}
            stamp={overlay.stamp}
          />
        </div>
        {/* Flipped face = generic back (during game) or stats back (results) — matches basketball */}
        <div className="wc-card-face wc-card-face-back">
          {canFlip ? <BackStats card={stableCard} /> : <CardBackGeneric />}
        </div>
      </div>
    </div>
  );
}
