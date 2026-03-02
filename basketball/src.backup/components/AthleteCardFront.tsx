import React, { useEffect, useMemo, useState, useRef } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";

export type PerformanceTag = "ICE_COLD" | "COLD" | "OK" | "HOT" | "ON_FIRE" | "CAREER_NIGHT";
export type PulseStyle = "NEG" | "NEUTRAL" | "POS" | "JACKPOT";

function clampText(v: any) { return String(v ?? "").trim(); }

function initialsFromName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

function formatSeasonRange(season: any): string {
  const s = clampText(season);
  // New format: "2324" → "23-24", "2425" → "24-25"
  if (/^\d{4}$/.test(s)) {
    return `${s.slice(0,2)}-${s.slice(2,4)}`;
  }
  // Legacy formats
  let m = s.match(/(\d{4})\D+(\d{4})/);
  if (m) return `${m[1].slice(2)}-${m[2].slice(2)}`;
  m = s.match(/(\d{2})\D+(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/(\d{4})/);
  if (m) {
    const a = m[1].slice(2);
    const b = String((Number(a) + 1) % 100).padStart(2, "0");
    return `${a}-${b}`;
  }
  return s;
}

function safeKeyFor(card: any) {
  const base = String(card?.basePlayerId ?? "").trim();
  const season = String(card?.season ?? "").trim();
  return `${base}|${season}`;
}

function truncateLast(last: string, max = 11): string {
  if (last.length <= max) return last;
  return last.slice(0, max - 1) + "…";
}

type TierTheme = { bg: string; frame: string; glow: string; textOnDark: boolean };

function tierTheme(tierRaw: any): TierTheme {
  const t = String(tierRaw ?? "").toUpperCase();
  if (t.includes("ORANGE")) return { bg: "linear-gradient(160deg, #2A1500 0%, #1A0D00 40%, #0F0800 100%)", frame: "rgba(255,160,50,0.90)", glow: "rgba(255,140,30,0.28)", textOnDark: false };
  if (t.includes("PURPLE")) return { bg: "linear-gradient(160deg, #1A0D2E 0%, #110920 40%, #080612 100%)", frame: "rgba(175,100,255,0.88)", glow: "rgba(160,90,255,0.26)", textOnDark: false };
  if (t.includes("BLUE"))   return { bg: "linear-gradient(160deg, #071828 0%, #04101C 40%, #020A12 100%)", frame: "rgba(70,155,255,0.88)",  glow: "rgba(60,140,255,0.24)",  textOnDark: false };
  if (t.includes("GREEN"))  return { bg: "linear-gradient(160deg, #061A0F 0%, #04120A 40%, #020A06 100%)", frame: "rgba(60,210,120,0.88)",  glow: "rgba(50,200,110,0.22)",  textOnDark: false };
  if (t.includes("WHITE"))  return { bg: "linear-gradient(160deg, #141820 0%, #0D1118 40%, #080A10 100%)", frame: "rgba(200,215,240,0.55)", glow: "rgba(200,215,240,0.12)", textOnDark: false };
  return { bg: "linear-gradient(160deg, #071828 0%, #04101C 40%, #020A12 100%)", frame: "rgba(100,140,220,0.80)", glow: "rgba(100,140,220,0.20)", textOnDark: false };
}

function teamYearLine(team: string, seasonFmt: string, maxTeamChars = 12) {
  const t = clampText(team).toUpperCase();
  const y = clampText(seasonFmt);
  if (!t) return y;
  if (t.length <= maxTeamChars) return `${t} • ${y}`;
  return `${t.slice(0, Math.max(0, maxTeamChars - 1))}… • ${y}`;
}

const EMO_STYLE_ID = "athlete-card-emotion-styles-v3";
if (typeof document !== "undefined" && !document.getElementById(EMO_STYLE_ID)) {
  const st = document.createElement("style");
  st.id = EMO_STYLE_ID;
  st.textContent = `
    @keyframes pulseRing {
      0%   { transform: scale(1.00); opacity: 0.35; }
      35%  { transform: scale(1.02); opacity: 0.70; }
      70%  { transform: scale(1.01); opacity: 0.45; }
      100% { transform: scale(1.00); opacity: 0.35; }
    }
    @keyframes badgePop {
      0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
      60%  { transform: scale(1.3) rotate(5deg);  opacity: 1; }
      80%  { transform: scale(0.9) rotate(-2deg); }
      100% { transform: scale(1)   rotate(0deg);  opacity: 1; }
    }
  `;
  document.head.appendChild(st);
}

function pulsePalette(pulse?: PulseStyle) {
  switch (pulse) {
    case "JACKPOT": return { ring: "rgba(255,215,80,0.55)",  glow: "rgba(255,205,70,0.28)"  };
    case "POS":     return { ring: "rgba(255,150,70,0.50)",  glow: "rgba(255,140,60,0.22)"  };
    case "NEG":     return { ring: "rgba(120,180,235,0.50)", glow: "rgba(110,170,230,0.20)" };
    default:        return { ring: "rgba(255,255,255,0.10)", glow: "rgba(255,255,255,0.06)" };
  }
}

// ── Layout constants ───────────────────────────────────────────────────────
// Dock = name pill only (team • season, first+pos, last+FP)
// DOCK_H: height of just the name pill
// BADGE_H: height of the badge row that floats above the dock
// Together they form the bottom zone of the card
const DOCK_H    = "18%";   // name pill only — tighter than before
const BADGE_H   = 26;      // px — badge strip height, floats just above dock
const DOCK_GAP  = 4;       // gap from card bottom edge
const DOCK_PAD  = 6;       // horizontal inset

export function AthleteCardFront(props: {
  card: PlayerCard;
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
  performanceTag?: PerformanceTag;
  pulse?: PulseStyle;
  fpCountUpMs?: number;
  stamp?: "CAREER NIGHT" | "ICE COLD" | null;
  onRollComplete?: () => void;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
}) {
  const {
    card, phase, isLocked, visibleFp, isRevealing, revealActive,
    pulse, fpCountUpMs, stamp, onRollComplete, badges,
  } = props;

  const fadeOpacity = (isRevealing && revealActive && visibleFp !== undefined && visibleFp > 0) ? 0.15 : 1;
  const fadeTransition = "opacity 0.3s ease";

  const name      = clampText((card as any)?.name);
  const team      = clampText((card as any)?.team);
  const season    = (card as any)?.season ?? (card as any)?.year ?? (card as any)?.seasonLabel;
  const seasonFmt = formatSeasonRange(season);
  const posRaw    = clampText((card as any)?.position);
  const posMap: Record<string, string> = {
    "PG": "G", "SG": "G", "G": "G",
    "SF": "F", "PF": "F", "F": "F",
    "G/F": "G/F", "F/G": "G/F", "F/C": "F/C",
    "C": "C",
  };
  const pos = posRaw ? (posMap[posRaw.toUpperCase()] ?? "") : "";
  const salary      = Number((card as any)?.salary ?? 0);
  const showResults = phase === "RESULTS";
  const proj        = Number((card as any)?.projectedFp ?? 0);

  const [displayedFp,  setDisplayedFp]  = useState(0);
  const [isRolling,    setIsRolling]    = useState(false);
  const [rollComplete, setRollComplete] = useState(false);

  const [safeMap, setSafeMap] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/headshots/safe-headshot-map.json")
      .then(r => r.ok ? r.json() : {})
      .then(json => { if (alive) setSafeMap(json ?? {}); })
      .catch(() => { if (alive) setSafeMap({}); });
    return () => { alive = false; };
  }, []);

  const cardKey     = useMemo(() => safeKeyFor(card), [card]);
  const targetFpRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRevealing || !revealActive) return;
    const finalTarget = Number((card as any)?.actualFp ?? 0);
    if (!Number.isFinite(finalTarget) || finalTarget <= 0) return;
    if (targetFpRef.current === null) targetFpRef.current = finalTarget;
  }, [card, isRevealing, revealActive]);

  useEffect(() => { targetFpRef.current = null; }, [cardKey]);

  const safeCode = useMemo(() => safeMap ? (safeMap[cardKey] ?? null) : null, [safeMap, cardKey]);

  const candidates = useMemo(() => {
    const out: string[] = [];
    const directUrl = (card as any)?.headshotUrl;
    if (directUrl) out.push(directUrl);
    if (safeCode) out.push(`/headshots/${safeCode}.png`);
    return out;
  }, [card, safeCode]);

  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [candidates]);

  const headshotSrc = candidates[idx] ?? "";
  const initials    = initialsFromName(name || `${team} ${pos}`);
  const tier        = tierTheme((card as any)?.tier);

  // FP roll
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

  const hasRevealed       = rollComplete || (!!isRevealing && !!revealActive && visibleFp !== undefined && visibleFp > 0);
  const showHoldIndicator = isLocked || (card as any).wasHeld;
  const pulsePal          = pulsePalette(pulse);
  const showPulse         = !!pulse && pulse !== "NEUTRAL" && hasRevealed;
  const teamSeason        = teamYearLine(team, seasonFmt, 12);
  const shadowText        = "0 2px 8px rgba(0,0,0,0.55)";

  const first = useMemo(() => name.split(/\s+/).filter(Boolean)[0] ?? "", [name]);
  const last  = useMemo(() => {
    const parts = name.split(/\s+/).filter(Boolean);
    return truncateLast(parts.slice(1).join(" ") || parts[0] || "", 11);
  }, [name]);

  // Badge strip sits just above dock; stamp sits just above badge strip
  // bottomZoneHeight = DOCK_GAP + DOCK_H (%) + BADGE_H px (if badges present)
  // We position everything using `bottom` from card edge.

  // dock bottom edge = DOCK_GAP from card bottom
  // badge strip bottom edge = DOCK_GAP + DOCK_H% + 4px gap
  // stamp bottom edge = badge strip top + 4px gap

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%", borderRadius: 18, overflow: "hidden",
      background: tier.bg,
      border: `2px solid ${tier.frame}`,
      boxShadow: `0 18px 40px rgba(0,0,0,0.50), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 0 30px ${tier.glow}${showPulse ? `, 0 0 26px ${pulsePal.glow}` : ""}`,
    }}>

      {/* Tier corner glow */}
      <div style={{ position: "absolute", inset: -40, pointerEvents: "none",
        background: `radial-gradient(closest-side at 30% 20%, ${tier.glow} 0%, rgba(0,0,0,0) 70%)`, opacity: 0.7 }} />

      {/* Pulse ring */}
      {showPulse && (
        <div style={{ position: "absolute", inset: -2, borderRadius: 20, pointerEvents: "none",
          border: `2px solid ${pulsePal.ring}`,
          animation: "pulseRing 950ms ease-in-out infinite",
          filter: "blur(0.2px)", zIndex: 5 }} />
      )}

      {/* Hold indicator */}
      {showHoldIndicator && <>
        <div style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0,
          borderTop: "42px solid rgba(245,200,80,0.95)", borderRight: "42px solid transparent",
          zIndex: 7, pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 14, left: 14, transform: "translate(-50%,-50%)",
          zIndex: 8, pointerEvents: "none", fontSize: 12, fontWeight: 950, color: "rgba(0,0,0,0.92)" }}>H</div>
      </>}

      {/* Salary tag */}
      <div style={{
        position: "absolute", top: 8, right: 8, zIndex: 6, pointerEvents: "none",
        padding: "5px 9px", borderRadius: 12,
        background: "rgba(15,18,24,0.55)", border: "1px solid rgba(255,255,255,0.14)",
        color: "rgba(255,255,255,0.95)", fontWeight: 950, fontSize: 12, letterSpacing: 0.6,
        backdropFilter: "blur(10px)", opacity: fadeOpacity, transition: fadeTransition,
      }}>${salary}</div>

      {/* Hero — full card, dock + badges float on top */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden", transform: "translateZ(0)" }}>
          {headshotSrc ? (
            <img
              key={headshotSrc}
              src={headshotSrc}
              alt={name}
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", objectPosition: "50% 0%",
                transform: "translateY(8px) scale(0.94)",
              }}
              draggable={false}
              referrerPolicy="no-referrer"
              onError={() => {
                if (idx < candidates.length - 1) setIdx(v => v + 1);
                else setIdx(candidates.length);
              }}
            />
          ) : (
            <div style={{
              position: "absolute", inset: 0, display: "grid", placeItems: "center",
              fontSize: 58, fontWeight: 950, letterSpacing: 2,
              color: "rgba(255,255,255,0.70)", textShadow: "0 10px 30px rgba(0,0,0,0.60)", userSelect: "none",
            }}>{initials}</div>
          )}
          {/* Bottom fade into dock */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,0.55) 100%)",
          }} />
        </div>
      </div>

      {/* ── DOCK: name pill only, tight to bottom ─────────────────────── */}
      <div style={{
        position: "absolute", left: DOCK_PAD, right: DOCK_PAD,
        bottom: DOCK_GAP, height: DOCK_H,
        borderRadius: 12,
        padding: "4px 10px",
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 1,
        background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.72))",
        borderTop: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 8px 20px rgba(0,0,0,0.35)", backdropFilter: "blur(14px)", zIndex: 6,
      }}>
        {/* Team • Season */}
        <div style={{
          fontSize: 8, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          textShadow: shadowText, textAlign: "center", lineHeight: "1.1",
          color: "rgba(255,255,255,0.55)", opacity: fadeOpacity, transition: fadeTransition,
        }}>{teamSeason}</div>

        {/* First + pos */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 4 }}>
          <div style={{
            fontSize: 9, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            textShadow: shadowText, lineHeight: "1.1", minWidth: 0, flex: 1,
            opacity: fadeOpacity, transition: fadeTransition,
          }}>{first}</div>
          <div style={{
            fontSize: 9, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase",
            textShadow: shadowText, lineHeight: "1.1", flexShrink: 0,
            color: "rgba(255,255,255,0.60)", opacity: fadeOpacity, transition: fadeTransition,
          }}>{pos}</div>
        </div>

        {/* Last + FP */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 4 }}>
          <div style={{
            fontSize: 13, fontWeight: 950, letterSpacing: 0.5, textTransform: "uppercase",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            textShadow: shadowText, lineHeight: "1.1", minWidth: 0, flex: 1,
            opacity: fadeOpacity, transition: fadeTransition,
          }}>{last}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
            <div style={{
              fontSize: 8, fontWeight: 900, letterSpacing: 0.8,
              textShadow: shadowText, opacity: 0.60, lineHeight: "1.1",
            }}>{showResults ? "FP" : "PROJ"}</div>
            <div style={{
              fontSize: 12, fontWeight: 950, letterSpacing: 0.2,
              textShadow: shadowText, lineHeight: "1.1",
              transition: isRolling ? "none" : "transform 150ms ease",
              transform: isRolling ? "scale(1.05)" : "scale(1)",
            }}>
              {valueText}
              {showResults && badgeBonusFp > 0 && (
                <span style={{ fontSize: 8, fontWeight: 700, color: "#FFD700", marginLeft: 2, opacity: 0.90 }}>
                  (+{badgeBonusFp})
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── BADGES: float just above the dock ─────────────────────────── */}
      {hasBadges && (
        <div style={{
          position: "absolute",
          left: DOCK_PAD, right: DOCK_PAD,
          // sits directly above the dock with a 3px gap
          bottom: `calc(${DOCK_H} + ${DOCK_GAP}px + 3px)`,
          height: BADGE_H,
          display: "flex", gap: 3, justifyContent: "center", alignItems: "center",
          zIndex: 7, pointerEvents: "none",
          flexWrap: "nowrap", overflow: "hidden",
        }}>
          {badges!.slice(0, 6).map((badge, i) => (
            <div key={badge.id} style={{
              animation: `badgePop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) ${i * 90}ms both`,
              display: "flex", flexDirection: "row", alignItems: "center", gap: 2,
              background: "rgba(0,0,0,0.70)", backdropFilter: "blur(6px)",
              borderRadius: 6, padding: "2px 5px",
              border: "1px solid rgba(255,255,255,0.18)", flexShrink: 0,
            }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{badge.icon}</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: "#FFD700", letterSpacing: 0.3 }}>+{badge.fp}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── STAMP: sits just above badge area (or above dock if no badges) ── */}
      {stamp && (
        <div style={{
          position: "absolute",
          // if badges present, sit above them; otherwise just above dock
          bottom: hasBadges
            ? `calc(${DOCK_H} + ${DOCK_GAP}px + ${BADGE_H + 6}px)`
            : `calc(${DOCK_H} + ${DOCK_GAP}px + 6px)`,
          left: "50%",
          transform: "translateX(-50%) rotate(-3deg)",
          zIndex: 40, pointerEvents: "none", whiteSpace: "nowrap",
          fontSize: 13, fontWeight: 900, letterSpacing: 2.5,
          textTransform: "uppercase" as const,
          color: stamp === "CAREER NIGHT" ? "#FFD700" : "#7DD3FC",
          textShadow: stamp === "CAREER NIGHT"
            ? "0 0 20px rgba(255,215,0,0.8), 0 2px 4px rgba(0,0,0,0.8)"
            : "0 0 20px rgba(125,211,252,0.8), 0 2px 4px rgba(0,0,0,0.8)",
          border: `2px solid ${stamp === "CAREER NIGHT" ? "#FFD700" : "#7DD3FC"}`,
          borderRadius: 4, padding: "4px 12px",
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
        }}>{stamp}</div>
      )}

    </div>
  );
}