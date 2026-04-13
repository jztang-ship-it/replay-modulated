/**
 * shared/components/CardFront.tsx
 * LAYER 1: Universal notched card front face.
 *
 * Layout (per 3/18 designer spec — 329×478px):
 *   - Notched SVG clip-path shape
 *   - Tier gradient background
 *   - Salary (top-left, italic bold)
 *   - Position only (top-right, e.g. PG / SG / C)
 *   - Season + team in the notch (e.g. "LAL 24-25")
 *   - Hero area (headshot)
 *   - Black strip (~72%–86%): name on top 2 lines, FP row below
 *     - Pre-reveal: shows "AVG" label + average FP value (greyed)
 *     - Post-reveal: fades to actual FP number
 *   - Accent strip (~86%–99%): badges only
 *   - Stamp overlay, pulse ring, hold indicator
 */

import { useEffect, useMemo, useState, useRef } from "react";
import type { GamePhase, PlayerCard } from "@shared/types";
import { getTier, type TierKey, TIER_POSITION_TEXT } from "@shared/theme";
import { soundManager } from "@shared/utils/soundManager";
import type { OverlayStamp } from "@shared/components/PlayerCardShell";
import { CARD_CLIP_PATH_OBJECT_BOX } from "@shared/components/cardClipShape";

// ── CSS injected once ──────────────────────────────────────────────────────

const STYLE_ID = "card-front-styles-v2";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    @keyframes cfPulseRing {
      0%,100% { transform: scale(1.00); opacity: 0.35; }
      35%     { transform: scale(1.02); opacity: 0.70; }
      70%     { transform: scale(1.01); opacity: 0.45; }
    }
    @keyframes cfBadgePop {
      0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
      60%  { transform: scale(1.3) rotate(5deg);  opacity: 1; }
      80%  { transform: scale(0.9) rotate(-2deg); }
      100% { transform: scale(1)   rotate(0deg);  opacity: 1; }
    }
    @keyframes cfFpFadeIn {
      0%   { opacity: 0; transform: translateY(3px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes cfFpFadeOut {
      0%   { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-3px); }
    }
    @keyframes cfGlowFlash {
      0%   { opacity: 0; }
      12%  { opacity: 1; }
      48%  { opacity: 0.98; }
      100% { opacity: 0; }
    }
    @keyframes cfFireA {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.15; }
    }
    @keyframes cfFireB {
      0%, 100% { opacity: 0.15; }
      50% { opacity: 1; }
    }
    @keyframes cfSmokingA {
      0%   { opacity: 1; }
      15%  { opacity: 0.55; }
      35%  { opacity: 0.90; }
      50%  { opacity: 0.20; }
      65%  { opacity: 0.80; }
      85%  { opacity: 0.40; }
      100% { opacity: 1; }
    }
    @keyframes cfSmokingB {
      0%   { opacity: 0.20; }
      20%  { opacity: 0.85; }
      40%  { opacity: 0.35; }
      50%  { opacity: 1; }
      60%  { opacity: 0.50; }
      80%  { opacity: 0.90; }
      100% { opacity: 0.20; }
    }
    @keyframes cfSmokingC {
      0%   { opacity: 0.50; }
      25%  { opacity: 1; }
      50%  { opacity: 0.30; }
      75%  { opacity: 0.75; }
      100% { opacity: 0.50; }
    }
    @keyframes cfIceA {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.1; }
    }
    @keyframes cfIceB {
      0%, 100% { opacity: 0.1; }
      50% { opacity: 1; }
    }
    @keyframes cfFreezeSheetA {
      0%, 100% { opacity: 0.85; }
      50% { opacity: 0.65; }
    }
    @keyframes cfFreezeSheetB {
      0%, 100% { opacity: 0.55; }
      50% { opacity: 0.80; }
    }
  `;
  document.head.appendChild(st);
}

// ── Helpers ────────────────────────────────────────────────────────────────

export type PulseStyle = "NEG" | "NEUTRAL" | "POS" | "GOAT";

function clampText(v: any) { return String(v ?? "").trim(); }

function initialsFromName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

// MLB team name → 3-letter abbrev. Non-MLB / minor league teams fall through
// to the generic "first 3 letters of last word" rule below. Short codes
// (basketball "MEM", "GSW" etc.) pass through untouched.
const MLB_TEAM_ABBREV: Record<string, string> = {
  "ARIZONA DIAMONDBACKS": "ARI",
  "ATLANTA BRAVES":       "ATL",
  "BALTIMORE ORIOLES":    "BAL",
  "BOSTON RED SOX":       "BOS",
  "CHICAGO CUBS":         "CHC",
  "CHICAGO WHITE SOX":    "CHW",
  "CINCINNATI REDS":      "CIN",
  "CLEVELAND GUARDIANS":  "CLE",
  "COLORADO ROCKIES":     "COL",
  "DETROIT TIGERS":       "DET",
  "HOUSTON ASTROS":       "HOU",
  "KANSAS CITY ROYALS":   "KC",
  "LOS ANGELES ANGELS":   "LAA",
  "LOS ANGELES DODGERS":  "LAD",
  "MIAMI MARLINS":        "MIA",
  "MILWAUKEE BREWERS":    "MIL",
  "MINNESOTA TWINS":      "MIN",
  "NEW YORK METS":        "NYM",
  "NEW YORK YANKEES":     "NYY",
  "ATHLETICS":            "OAK",
  "PHILADELPHIA PHILLIES":"PHI",
  "PITTSBURGH PIRATES":   "PIT",
  "SAN DIEGO PADRES":     "SD",
  "SAN FRANCISCO GIANTS": "SF",
  "SEATTLE MARINERS":     "SEA",
  "ST. LOUIS CARDINALS":  "STL",
  "TAMPA BAY RAYS":       "TB",
  "TEXAS RANGERS":        "TEX",
  "TORONTO BLUE JAYS":    "TOR",
  "WASHINGTON NATIONALS": "WSH",
};

function teamAbbrev(raw: string): string {
  const up = clampText(raw).toUpperCase();
  if (!up) return "";
  // Already short (≤ 4 chars) — assume it's an abbrev (basketball MEM/GSW etc.)
  if (up.length <= 4) return up;
  // MLB table hit
  const hit = MLB_TEAM_ABBREV[up];
  if (hit) return hit;
  // Fallback: first 3 letters of the last word (handles minor league +
  // international teams without cluttering the MLB table).
  const words = up.split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] ?? up;
  return last.slice(0, 3);
}

function formatSeasonRange(season: any): string {
  const s = clampText(season);
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}-${s.slice(2, 4)}`;
  let m = s.match(/(\d{4})\D+(\d{4})/);
  if (m) return `${m[1].slice(2)}-${m[2].slice(2)}`;
  m = s.match(/(\d{2})\D+(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/(\d{4})/);
  if (m) { const a = m[1].slice(2); return `${a}-${String((Number(a) + 1) % 100).padStart(2, "0")}`; }
  return s;
}

function safeKeyFor(card: any) {
  const base = String(card?.basePlayerId ?? "").trim();
  const season = String(card?.season ?? "").trim();
  return season ? `${base}|${season}` : base;
}

function splitNameLines(name: string): [string, string] {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    const n = parts[0];
    return [n.length > 10 ? n.slice(0, 10) + "." : n, ""];
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  const line1 = firstName.length > 10 ? firstName.slice(0, 10) + "." : firstName;
  const line2 = lastName.length > 10 ? lastName.slice(0, 10) + "." : lastName;
  return [line1, line2];
}

function pulsePalette(pulse?: PulseStyle) {
  switch (pulse) {
    case "GOAT": return { ring: "rgba(255,215,80,0.60)", glow: "rgba(255,205,70,0.30)" };
    case "POS": return { ring: "rgba(255,150,70,0.55)", glow: "rgba(255,140,60,0.25)" };
    case "NEG": return { ring: "rgba(120,180,235,0.55)", glow: "rgba(110,170,230,0.22)" };
    default: return { ring: "rgba(255,255,255,0.10)", glow: "rgba(255,255,255,0.06)" };
  }
}

const CARD_PATH = CARD_CLIP_PATH_OBJECT_BOX;

// ── Public types ───────────────────────────────────────────────────────────

export interface CardFrontHeroProps {
  card: PlayerCard;
  initials: string;
  isActiveReveal: boolean;
}

export interface CardFrontProps {
  card: PlayerCard;
  stableCard?: PlayerCard;
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
  pulse?: PulseStyle;
  fpCountUpMs?: number;
  stamp: OverlayStamp;
  onRollComplete?: () => void;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
  renderHero: (props: CardFrontHeroProps) => React.ReactNode;
  heldFpVisible?: boolean;
  isTapTarget?: boolean;
  /**
   * Performance percentile (0–100) derived from actualFp / projectedFp ratio.
   * Shown in accent strip after FP roll completes. Null = don't show.
   */
  perfPct?: number | null;
  /** Tier PNG glow — rendered inside the notched clip (full card), not in the shell. */
  glowActive?: boolean;
  glowSrc?: string;
  glowDurationMs?: number;
  glowTier?: string;
}

// ── CardFront ──────────────────────────────────────────────────────────────

export function CardFront(props: CardFrontProps) {
  const {
    card, stableCard, phase, isLocked, visibleFp, isRevealing, revealActive,
    isFlipped, heldFpVisible, isTapTarget,
    pulse, fpCountUpMs, stamp, onRollComplete, badges, renderHero,
    glowActive, glowSrc, glowDurationMs, glowTier, perfPct,
  } = props;

  const name = clampText((card as any)?.name);
  const team = teamAbbrev(clampText((card as any)?.team));
  const season = (card as any)?.season ?? (card as any)?.year ?? (card as any)?.seasonLabel;
  const seasonFmt = formatSeasonRange(season);
  const posRaw = clampText((card as any)?.position);
  const posMap: Record<string, string> = {
    // Basketball
    "PG": "PG", "SG": "SG", "G": "PG", "SF": "SF", "PF": "PF", "F": "SF",
    "G/F": "SG", "F/G": "SG", "F/C": "PF", "C": "C",
    // Baseball — BAT displays as "B"; real baseball positions pass through
    "BAT": "B", "P": "P", "SP": "P", "RP": "P",
    "1B": "1B", "2B": "2B", "3B": "3B", "SS": "SS",
    "OF": "OF", "LF": "LF", "CF": "CF", "RF": "RF", "DH": "DH",
  };
  const pos = posRaw ? (posMap[posRaw.toUpperCase()] ?? posRaw) : "";
  const salary = Number((card as any)?.salary ?? 0);
  const proj = Number((card as any)?.projectedFp ?? 0);
  // Daily bonus (+5/+10/+20) — 0 if this player isn't in today's hot list.
  // Star count next to name: 1/2/3 for +5/+10/+20.
  const dailyBonus = Number((card as any)?.dailyBonus ?? (stableCard as any)?.dailyBonus ?? 0);
  const bonusStarCount = dailyBonus === 20 ? 3 : dailyBonus === 10 ? 2 : dailyBonus === 5 ? 1 : 0;
  const isHeldCard = !!(card as any).wasHeld;
  const isDrawing = phase === ("DRAWING" as any);
  const isPreReveal = !!(isRevealing && !isHeldCard && visibleFp === undefined);
  const showResults = !isPreReveal && (phase === "RESULTS" || isHeldCard);
  const showTierColors = (!isFlipped && !isPreReveal) || revealActive || isLocked || isRevealing || isDrawing;

  const [displayedFp, setDisplayedFp] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [rollComplete, setRollComplete] = useState(false);
  const [fpRevealed, setFpRevealed] = useState(false);
  const cardKey = useMemo(() => safeKeyFor(card), [card]);
  const animRafRef = useRef<number>(0);
  const animStartRef = useRef<number | null>(null);
  const animatingRef = useRef(false);

  // Triggered once when visibleFp first goes above 0 — runs its own RAF loop
  // to completion. Never cancelled by other cards tapping (no revealActive in deps).
  useEffect(() => {
    if (visibleFp === undefined) {
      // visibleFpMap was cleared (skip triggered) — reset so animation can restart
      cancelAnimationFrame(animRafRef.current);
      animatingRef.current = false;
      animStartRef.current = null;
      return;
    }
    if (visibleFp <= 0) return;
    if (animatingRef.current) return;
    if (rollComplete) return; // already done — ignore any late visibleFp updates

    const actual = Math.max(0, Number((card as any)?.actualFp ?? 0));
    setFpRevealed(true);

    if (actual <= 0) {
      setDisplayedFp(0); setIsRolling(false); setRollComplete(true); onRollComplete?.(); return;
    }

    animatingRef.current = true;
    animStartRef.current = null;
    setIsRolling(true); setRollComplete(false);

    const duration = Math.max(300, Math.min(2200, Number(fpCountUpMs ?? 500)));

    const animate = (timestamp: number) => {
      if (animStartRef.current === null) animStartRef.current = timestamp;
      const elapsed = timestamp - animStartRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayedFp(Math.round(actual * eased * 10) / 10);
      if (progress < 1) {
        // Tick sound every ~50ms (not every frame) for slot machine feel
        if (elapsed % 50 < 17) soundManager.playFpTick(progress);
        animRafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayedFp(actual);
        setIsRolling(false); setRollComplete(true);
        onRollComplete?.();
        // animatingRef intentionally stays true — blocks any re-trigger from late visibleFp updates
      }
    };
    animRafRef.current = requestAnimationFrame(animate);
    // No cleanup cancellation — intentional. Cancelling on dep change would kill
    // this card's animation when other cards are tapped. Reset only on cardKey change.
  }, [visibleFp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cancelAnimationFrame(animRafRef.current);
    animatingRef.current = false;
    animStartRef.current = null;
    setRollComplete(false); setDisplayedFp(0); setIsRolling(false); setFpRevealed(false);
  }, [cardKey]);

  // Sound 5 — fire/ice reveal sound, fires once when stamp first appears
  const heatSoundFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!stamp || heatSoundFiredRef.current === stamp) return;
    const isHot = stamp === "SMOKING HOT" || stamp === "ON FIRE";
    const isCold = stamp === "ICE COLD" || stamp === "FREEZING";
    if (isHot || isCold) {
      heatSoundFiredRef.current = stamp;
      soundManager.playHeatReveal(isHot);
    }
  }, [stamp]);

  // Determine what to show in the FP slot
  // Pre-reveal (isTapTarget or phase != RESULTS): show projected FP greyed out
  // Post-reveal: show actual FP with count-up
  const isShowingActualFp = fpRevealed || (showResults && !isPreReveal);
  const fpValue = isShowingActualFp
    ? (visibleFp !== undefined ? displayedFp : Number((card as any)?.actualFp ?? 0))
    : 0;
  const fpText = Number.isFinite(fpValue) && fpValue > 0 ? fpValue.toFixed(1) : "0.0";

  const badgeBonusFp = useMemo(() => badges?.reduce((s, b) => s + (b.fp ?? 0), 0) ?? 0, [badges]);
  const hasBadges = (badges?.length ?? 0) > 0;
  const hasRevealed = rollComplete || (!!isRevealing && !!revealActive && visibleFp !== undefined && visibleFp > 0);
  const pulsePal = pulsePalette(pulse);
  const showPulse = !!pulse && pulse !== "NEUTRAL" && hasRevealed;

  const cardSalary = Number((stableCard as any)?.salary ?? (card as any)?.salary ?? 0);
  const derivedTier = cardSalary >= 73 ? "RED" : cardSalary >= 58 ? "ORANGE" : cardSalary >= 44 ? "PURPLE" : cardSalary >= 30 ? "BLUE" : cardSalary >= 23 ? "GREEN" : "WHITE";
  const tier = getTier(derivedTier);
  const isWhiteTier = derivedTier === "WHITE";
  const onCardText = isWhiteTier ? "#FFFFFF" : "#000000";
  const positionTextColor = TIER_POSITION_TEXT[(derivedTier as TierKey)] ?? TIER_POSITION_TEXT.WHITE;
  const initials = initialsFromName(name || `${team} ${pos}`);
  const [nameLine1, nameLine2] = splitNameLines(name);
  const isActiveReveal = !!(isRevealing && revealActive && visibleFp !== undefined && visibleFp > 0);
  const clipId = useMemo(() => `card-clip-${cardKey.replace(/[^a-z0-9]/gi, "_")}`, [cardKey]);



  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "transparent" }}>
      {/* Clip-path definition */}
      <svg width="0" height="0" style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <path d={CARD_PATH} />
          </clipPath>
        </defs>
      </svg>

      {/* ── CLIPPED CARD CONTENT ── */}
      <div style={{ position: "absolute", inset: 0, clipPath: `url(#${clipId})` }}>

        {/* Tier gradient — hidden until card face is visible */}
        {showTierColors && <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to bottom, ${tier.bg} 0%, ${tier.bgEnd} 70%, ${tier.bgEnd} 100%)`,
        }} />}

        {/* HERO — sport-specific content, covers top 72% */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: "27.8%" }}>
          {renderHero({ card, initials, isActiveReveal })}
        </div>

        {/* SALARY — top-left */}
        <div style={{ position: "absolute", top: "6.5%", left: "6%", zIndex: 8, pointerEvents: "none", lineHeight: 1 }}>
          <span data-ftue-label="salary" style={{ fontSize: 16, fontWeight: 900, fontStyle: "italic", color: onCardText, letterSpacing: -0.5, lineHeight: 1 }}>
            ${salary}
          </span>
        </div>

        {/* POSITION — top-right; tier-colored per designer (salary left still uses onCardText) */}
        <div style={{ position: "absolute", top: "6%", right: "6%", zIndex: 8, pointerEvents: "none" }}>
          <span style={{ fontSize: 16, fontWeight: 900, fontStyle: "italic", color: positionTextColor, letterSpacing: -0.5, lineHeight: 1, textTransform: "uppercase" }}>
            {pos}
          </span>
        </div>

        {/* ── BLACK STRIP (72% → 86.2%) — left: name 2 lines | right: FP ── */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: "72%", height: "14.2%",
          background: "#000000",
          display: "flex", flexDirection: "row",
          alignItems: "stretch",
          paddingLeft: 7, paddingRight: 7,
          gap: 6,           // minimum guaranteed gap between name and FP
          zIndex: 4, overflow: "hidden",
        }}>
          {/* LEFT — player name, two lines, vertically centered */}
          <div style={{
            flex: 1,
            display: "flex", flexDirection: "column",
            alignItems: "flex-start", justifyContent: "center",
            gap: 2, minWidth: 0, maxWidth: "55%",
          }}>
            {nameLine1 && (
              <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", color: "#FFFFFF", lineHeight: 1, whiteSpace: "nowrap", display: "block", maxWidth: "100%" }}>
                {nameLine1}
                {bonusStarCount > 0 && !nameLine2 && (
                  <span style={{ marginLeft: 3, color: "#FFD700", fontSize: 7, letterSpacing: 0 }}>
                    {"★".repeat(bonusStarCount)}
                  </span>
                )}
              </span>
            )}
            {nameLine2 && (
              <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", color: "#FFFFFF", lineHeight: 1, whiteSpace: "nowrap", display: "block", maxWidth: "100%" }}>
                {nameLine2}
                {bonusStarCount > 0 && (
                  <span style={{ marginLeft: 3, color: "#FFD700", fontSize: 7, letterSpacing: 0 }}>
                    {"★".repeat(bonusStarCount)}
                  </span>
                )}
              </span>
            )}
          </div>

          {/* RIGHT — FP column */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", flexShrink: 0, minWidth: 52, maxWidth: 68 }}>

            {/* PRE-REVEAL layer: "AVG" label + average FP number */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "flex-end", justifyContent: "center",
              gap: 2,
              opacity: isShowingActualFp ? 0 : 1,
              transition: "opacity 350ms ease",
              pointerEvents: "none",
            }}>
              <span data-ftue-label="avg" style={{ fontSize: 7, fontWeight: 700, color: "rgba(255,255,255,0.38)", letterSpacing: 1, textTransform: "uppercase", lineHeight: 1 }}>AVG</span>
              <span data-ftue-label="avg" style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.40)", letterSpacing: -0.3, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {proj.toFixed(1)}
              </span>
            </div>

            {/* POST-REVEAL layer: big actual FP — no label, fills both line heights */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "flex-end", justifyContent: "center",
              opacity: isShowingActualFp ? (isHeldCard ? ((heldFpVisible || fpRevealed) ? 1 : 0) : 1) : 0,
              transition: isHeldCard ? "opacity 800ms ease" : "opacity 350ms ease",
              pointerEvents: "none",
            }}>
              {/* FP number — no badge bonus here, that lives in accent strip */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
                <span style={{
                  fontSize: 22, fontWeight: 950, color: "#FFFFFF", letterSpacing: -0.5,
                  lineHeight: 1, fontVariantNumeric: "tabular-nums", display: "inline-block",
                  transform: isRolling ? "scale(1.06)" : "scale(1)",
                  transition: isRolling ? "none" : "transform 100ms ease",
                }}>
                  {isShowingActualFp
                    ? (displayedFp > 0 ? displayedFp.toFixed(1) : (Number((card as any)?.actualFp ?? 0) > 0 ? Number((card as any).actualFp).toFixed(1) : fpText))
                    : fpText}
                </span>
              </div>
              {/* Daily bonus suffix — shown only after reveal, in gold to match the stars */}
              {isShowingActualFp && dailyBonus > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 900, color: "#FFD700",
                  lineHeight: 1, marginTop: 2, letterSpacing: -0.2,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  +{dailyBonus}
                </span>
              )}
            </div>

          </div>
        </div>

        {/* ── ACCENT STRIP (86.2% → 99%) — badges + total bonus + perf percentile ── */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: "86.2%", bottom: 0,
          background: tier.accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          paddingLeft: 4, paddingRight: 4,
          zIndex: 4, overflow: "hidden",
          gap: 3,
        }}>
          {hasBadges ? (() => {
            const isLightAccent = derivedTier === "GREEN" || derivedTier === "BLUE" || derivedTier === "WHITE";
            const textColor = isLightAccent ? "#1A1A1A" : "#FFEA86";
            const MAX_VISIBLE = 4;
            const visibleBadges = badges!.slice(0, MAX_VISIBLE);
            const overflowCount = (badges?.length ?? 0) - MAX_VISIBLE;
            return (
              <>
                {visibleBadges.map((badge, i) => (
                  <span
                    key={badge.id ?? badge.label ?? i}
                    style={{
                      animation: `cfBadgePop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) ${i * 70}ms both`,
                      fontSize: 12, lineHeight: 1, flexShrink: 0,
                    }}
                  >{badge.icon}</span>
                ))}
                {overflowCount > 0 && (
                  <span style={{
                    animation: `cfBadgePop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) ${MAX_VISIBLE * 70}ms both`,
                    fontSize: 9, fontWeight: 900, color: textColor,
                    letterSpacing: 0.2, flexShrink: 0, opacity: 0.8,
                  }}>+{overflowCount}</span>
                )}
                {badgeBonusFp > 0 && (
                  <span style={{
                    animation: `cfBadgePop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) ${Math.min(badges!.length, MAX_VISIBLE) * 70 + (overflowCount > 0 ? 70 : 0)}ms both`,
                    fontSize: 11, fontWeight: 900, color: textColor,
                    letterSpacing: 0.3, flexShrink: 0,
                    background: isLightAccent ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)",
                    borderRadius: 4, padding: "1px 4px",
                  }}>+{badgeBonusFp}</span>
                )}
              </>
            );
          })() : null}

          {/* PERF PERCENTILE text removed — ratio expressed via fire/ice overlay instead */}
        </div>

        {/* FIRE/ICE EFFECT — continuous sliding scale based on actualFp/projectedFp ratio.
         *
         * SCALE:
         *   ratio ≤ 0.30 → max ice (full coverage, 3 layers, bright frost)
         *   ratio   0.80 → min ice (light frost, top portion, 2 layers)
         *   ratio   0.80–1.20 → no effect (neutral zone)
         *   ratio   1.40 → min fire (yellow/orange, gentle, 2 layers)
         *   ratio ≥ 2.00 → max fire (red, fast turbulent, 3 layers)
         *
         * Within each zone, all parameters lerp continuously:
         *   ICE:  coverage 50%→72%, opacity 0.18→0.60, speed 4.0s→3.0s, brightness 1.2→1.6
         *   FIRE: hue +25°→-15°, speed 2.4s→0.9s, opacity 0.35→0.65, spread 7→24px
         */}
        {(stamp === "SMOKING HOT" || stamp === "ON FIRE" || stamp === "ICE COLD" || stamp === "FREEZING") && (() => {
          const actual = Number((card as any)?.actualFp ?? 0);
          const projected = proj > 0 ? proj : 1;
          const ratio = actual / projected;
          const isFire = stamp === "SMOKING HOT" || stamp === "ON FIRE";

          if (isFire) {
            // ── FIRE ZONE: continuous from ratio 1.40 (mild yellow) to 2.00+ (max red) ──
            const t = Math.min(1, Math.max(0, (ratio - 1.40) / (2.00 - 1.40))); // 0=mild, 1=max
            const src = `${import.meta.env.BASE_URL}火焰.png`;
            const hue = 25 - t * 40;           // +25° yellow → -15° red
            const sat = 1.3 + t * 0.7;         // 1.3 → 2.0
            const bright = 1.1 - t * 0.28;     // 1.1 → 0.82
            const speed = 3.2 - t * 0.6;       // 3.2s gentle → 2.6s fast
            const spread = 7 + t * 17;         // 7px → 24px overhang
            const spreadTop = 10 + t * 14;     // 10px → 24px top
            const op1 = 0.35 + t * 0.30;       // 0.35 → 0.65
            const op2 = 0.22 + t * 0.33;       // 0.22 → 0.55
            const useThirdLayer = t > 0.5;
            const animA = t > 0.5 ? "cfSmokingA" : "cfFireA";
            const animB = t > 0.5 ? "cfSmokingB" : "cfFireB";
            const tintFilter = `hue-rotate(${hue}deg) saturate(${sat}) brightness(${bright})`;
            const clipStyle: React.CSSProperties = {
              position: "absolute", top: -spreadTop, left: -spread, right: -spread, bottom: "28%",
              borderRadius: "20px 20px 0 0", overflow: "hidden", pointerEvents: "none", zIndex: 39,
            };
            const imgBase: React.CSSProperties = {
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", mixBlendMode: "screen", filter: tintFilter,
            };
            return (
              <div style={clipStyle}>
                <img src={src} style={{ ...imgBase, opacity: op1, animation: `${animA} ${speed}s ease-in-out infinite` }} />
                <div style={{ position: "absolute", inset: 0, transform: "scaleX(-1)" }}>
                  <img src={src} style={{ ...imgBase, opacity: op2, animation: `${animB} ${speed}s ease-in-out infinite` }} />
                </div>
                {useThirdLayer && (
                  <div style={{ position: "absolute", inset: 0, transform: "scaleY(-1)" }}>
                    <img src={src} style={{ ...imgBase, opacity: op2 * 0.55, animation: `cfSmokingC ${speed * 1.2}s ease-in-out infinite 0.3s` }} />
                  </div>
                )}
              </div>
            );
          }

          // ── ICE ZONE: continuous from ratio 0.80 (mild frost) to 0.30 (max ice sheet) ──
          // Ice stops at name strip (~28% from bottom), same boundary as fire.
          // Coverage lerps within that zone: mild=top 40%, max=top 72% (bottom always 28%).
          const t = Math.min(1, Math.max(0, (0.80 - ratio) / (0.80 - 0.30))); // 0=mild, 1=max
          const src = `${import.meta.env.BASE_URL}冰雪.png`;
          const bottomPct = 28;                 // always 28% — ice covers top 72% at all levels
          const hue = -8 - t * 17;             // -8° → -25°
          const sat = 0.80 - t * 0.30;         // 0.80 → 0.50
          const bright = 1.1 + t * 0.5;        // 1.1 → 1.6
          const speed = 4.5 - t * 1.5;         // 4.5s → 3.0s
          const tCurve = t * t;                  // quadratic — mild end much fainter, extreme ramps up fast
          const op1 = 0.08 + tCurve * 0.52;    // 0.08 → 0.60
          const op2 = 0.04 + tCurve * 0.41;    // 0.04 → 0.45
          // Layer count scales with severity: 1 (light dusting) → 2 (mid) → 3 (full ice)
          const layers = t > 0.7 ? 3 : t > 0.45 ? 2 : 1;
          const tintFilter = `hue-rotate(${hue}deg) saturate(${sat}) brightness(${bright})`;
          const clipStyle: React.CSSProperties = {
            position: "absolute", top: 0, left: 0, right: 0, bottom: `${bottomPct}%`,
            borderRadius: "20px 20px 0 0", overflow: "hidden", pointerEvents: "none", zIndex: 39,
          };
          const imgBase: React.CSSProperties = {
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", mixBlendMode: "screen", filter: tintFilter,
          };
          return (
            <div style={clipStyle}>
              <img src={src} style={{ ...imgBase, opacity: op1, animation: `cfFreezeSheetA ${speed}s ease-in-out infinite` }} />
              {layers >= 2 && (
                <div style={{ position: "absolute", inset: 0, transform: "scaleX(-1)" }}>
                  <img src={src} style={{ ...imgBase, opacity: op2, animation: `cfFreezeSheetB ${speed}s ease-in-out infinite` }} />
                </div>
              )}
              {layers >= 3 && (
                <div style={{ position: "absolute", inset: 0, transform: "scaleY(-1)" }}>
                  <img src={src} style={{ ...imgBase, opacity: op2 * 0.75, animation: `cfFreezeSheetA ${speed * 1.2}s ease-in-out infinite 1s` }} />
                </div>
              )}
            </div>
          );
        })()}

        {/* Glow burst is now rendered in PlayerCardShell as a sibling of pcs-inner,
            outside pcs-face overflow:hidden, so it can bloom beyond card boundaries. */}

      </div>{/* end clipped content */}

      {/* SEASON + TEAM — hidden when card is face-down to prevent mirror bleed */}
      {showTierColors && (
        <div style={{ position: "absolute", top: 0, height: "5.8%", left: "34.2%", right: "36.4%", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 35, pointerEvents: "none", overflow: "hidden" }}>
          <span style={{ fontSize: 5.5, fontWeight: 900, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap", lineHeight: 1 }}>
            {team ? `${team} ${seasonFmt}` : seasonFmt}
          </span>
        </div>
      )}

      {/* HOLD INDICATOR */}
      {isLocked && (() => {
        const frontClipId = `card-clip-${cardKey.replace(/[^a-z0-9]/gi, "_")}`;
        return (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 60, clipPath: `url(#${frontClipId})` }}>
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }} viewBox="0 0 1 1" preserveAspectRatio="none">
              <polygon points="0,0 0.18,0 0,0.13" fill="#F5C850" />
            </svg>
            <span style={{ position: "absolute", top: "2.5%", left: "3%", fontSize: 8, fontWeight: 950, color: "rgba(0,0,0,0.85)", lineHeight: 1, userSelect: "none" }}>H</span>
          </div>
        );
      })()}

      {/* PULSE RING */}
      {showPulse && (
        <div style={{ position: "absolute", inset: 0, clipPath: `url(#${clipId})`, pointerEvents: "none", zIndex: 25 }}>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} viewBox="0 0 1 1" preserveAspectRatio="none">
            <path d={CARD_PATH} fill="none" stroke={pulsePal.ring} strokeWidth="6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ animation: "cfPulseRing 950ms ease-in-out infinite" }} />
          </svg>
        </div>
      )}

      {/* BORDER TRIM — hidden until card face is visible */}
      {showTierColors && (
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 50, overflow: "hidden" }} viewBox="0 0 1 1" preserveAspectRatio="none">
          <defs>
            <clipPath id={`border-clip-${cardKey.replace(/[^a-z0-9]/gi, "_")}`} clipPathUnits="objectBoundingBox">
              <path d={CARD_PATH} />
            </clipPath>
          </defs>
          <path d={CARD_PATH} fill="none" stroke={tier.bg} strokeWidth="2" strokeOpacity="1.0" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath={`url(#border-clip-${cardKey.replace(/[^a-z0-9]/gi, "_")})`} />
        </svg>
      )}

    </div>
  );
}