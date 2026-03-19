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
 *     - Pre-reveal: shows "FP" label + projected value (greyed)
 *     - Post-reveal: fades to actual FP number
 *   - Accent strip (~86%–99%): badges only
 *   - Stamp overlay, pulse ring, hold indicator
 */

import { useEffect, useMemo, useState, useRef } from "react";
import type { GamePhase, PlayerCard } from "@shared/types";
import { getTier } from "@shared/theme";
import type { OverlayStamp } from "@shared/components/PlayerCardShell";

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
  `;
  document.head.appendChild(st);
}

// ── Helpers ────────────────────────────────────────────────────────────────

export type PulseStyle = "NEG" | "NEUTRAL" | "POS" | "JACKPOT";

function clampText(v: any) { return String(v ?? "").trim(); }

function initialsFromName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

function formatSeasonRange(season: any): string {
  const s = clampText(season);
  if (/^\d{4}$/.test(s)) return `${s.slice(0,2)}-${s.slice(2,4)}`;
  let m = s.match(/(\d{4})\D+(\d{4})/);
  if (m) return `${m[1].slice(2)}-${m[2].slice(2)}`;
  m = s.match(/(\d{2})\D+(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/(\d{4})/);
  if (m) { const a = m[1].slice(2); return `${a}-${String((Number(a)+1)%100).padStart(2,"0")}`; }
  return s;
}

function safeKeyFor(card: any) {
  const base = String(card?.basePlayerId ?? "").trim();
  const season = String(card?.season ?? "").trim();
  return season ? `${base}|${season}` : base;
}

/** Split a player name into two display lines */
function splitNameLines(name: string): [string, string] {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return [parts[0], ""];
  if (parts.length === 2) return [parts[0], parts[1]];
  // 3+ parts: first name on line 1, rest on line 2
  return [parts[0], parts.slice(1).join(" ")];
}

function pulsePalette(pulse?: PulseStyle) {
  switch (pulse) {
    case "JACKPOT": return { ring: "rgba(255,215,80,0.60)",  glow: "rgba(255,205,70,0.30)"  };
    case "POS":     return { ring: "rgba(255,150,70,0.55)",  glow: "rgba(255,140,60,0.25)"  };
    case "NEG":     return { ring: "rgba(120,180,235,0.55)", glow: "rgba(110,170,230,0.22)" };
    default:        return { ring: "rgba(255,255,255,0.10)", glow: "rgba(255,255,255,0.06)" };
  }
}

// Card shape paths — objectBoundingBox normalized (0→1)
const CARD_PATH =
  "M 0.0678 0 L 0.2486 0 L 0.3190 0.0338 Q 0.3190 0.0497 0.3418 0.0497 " +
  "L 0.6356 0.0497 Q 0.6582 0.0497 0.6582 0.0338 L 0.6949 0 L 0.9322 0 " +
  "Q 1 0 1 0.0677 L 1 0.9323 Q 1 1 0.9322 1 L 0.0678 1 " +
  "Q 0 1 0 0.9323 L 0 0.0677 Q 0 0 0.0678 0 Z";

// ── Public types ───────────────────────────────────────────────────────────

export interface CardFrontHeroProps {
  card: PlayerCard;
  initials: string;
  isActiveReveal: boolean;
}

export interface CardFrontProps {
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
  pulse?: PulseStyle;
  fpCountUpMs?: number;
  stamp: OverlayStamp;
  onRollComplete?: () => void;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
  renderHero: (props: CardFrontHeroProps) => React.ReactNode;
  heldFpVisible?: boolean;
  isTapTarget?: boolean;
}

// ── CardFront ──────────────────────────────────────────────────────────────

export function CardFront(props: CardFrontProps) {
  const {
    card, phase, isLocked, visibleFp, isRevealing, revealActive,
    heldFpVisible, isTapTarget,
    pulse, fpCountUpMs, stamp, onRollComplete, badges, renderHero,
  } = props;

  const name      = clampText((card as any)?.name);
  const team      = clampText((card as any)?.team).toUpperCase();
  const season    = (card as any)?.season ?? (card as any)?.year ?? (card as any)?.seasonLabel;
  const seasonFmt = formatSeasonRange(season);
  const posRaw    = clampText((card as any)?.position);
  const posMap: Record<string, string> = {
    "PG":"PG","SG":"SG","G":"PG","SF":"SF","PF":"PF","F":"SF",
    "G/F":"SG","F/G":"SG","F/C":"PF","C":"C",
  };
  const pos       = posRaw ? (posMap[posRaw.toUpperCase()] ?? posRaw) : "";
  const salary    = Number((card as any)?.salary ?? 0);
  const proj      = Number((card as any)?.projectedFp ?? 0);
  const isHeldCard  = !!(card as any).wasHeld;
  const isPreReveal = !!(isRevealing && !isHeldCard && visibleFp === undefined);
  // showResults: whether actual FP is visible (post-reveal or held after all revealed)
  const showResults = !isPreReveal && (phase === "RESULTS" || isHeldCard);

  const [displayedFp,  setDisplayedFp]  = useState(0);
  const [isRolling,    setIsRolling]    = useState(false);
  const [rollComplete, setRollComplete] = useState(false);
  // fpRevealed: true once we've shown the actual FP (drives the fade swap)
  const [fpRevealed,   setFpRevealed]   = useState(false);
  const cardKey     = useMemo(() => safeKeyFor(card), [card]);
  const targetFpRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRevealing || !revealActive) return;
    const finalTarget = Number((card as any)?.actualFp ?? 0);
    if (!Number.isFinite(finalTarget) || finalTarget <= 0) return;
    if (targetFpRef.current === null) targetFpRef.current = finalTarget;
  }, [card, isRevealing, revealActive]);

  useEffect(() => { targetFpRef.current = null; }, [cardKey]);

  useEffect(() => {
    if (visibleFp === undefined) {
      // visibleFp not in map at all — held card waiting for reveal sequence
      if (isHeldCard) { setDisplayedFp(0); return; }
      setDisplayedFp(showResults ? Number((card as any)?.actualFp ?? proj) : proj);
      return;
    }
    // visibleFp is set (either 0 during skip rollup or actual value)
    // Don't short-circuit for held cards here — let the countup run
    if (isRevealing && !revealActive && !isHeldCard && visibleFp === undefined) return;
    const target = targetFpRef.current ?? visibleFp;
    if (visibleFp > 0 && displayedFp !== target) {
      if (target === 0) { setDisplayedFp(0); setIsRolling(false); setRollComplete(true); onRollComplete?.(); return; }
      setFpRevealed(true);
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

  useEffect(() => {
    setRollComplete(false); setDisplayedFp(0); setIsRolling(false); setFpRevealed(false);
  }, [cardKey]);

  // Determine what to show in the FP slot
  // Pre-reveal (isTapTarget or phase != RESULTS): show projected FP greyed out
  // Post-reveal: show actual FP with count-up
  const isShowingActualFp = fpRevealed || (showResults && !isPreReveal);
  const fpValue = isShowingActualFp
    ? (visibleFp !== undefined ? displayedFp : Number((card as any)?.actualFp ?? 0))
    : proj;
  const fpText = Number.isFinite(fpValue) && fpValue > 0 ? fpValue.toFixed(1) : proj.toFixed(1);

  const badgeBonusFp = useMemo(() => badges?.reduce((s, b) => s + (b.fp ?? 0), 0) ?? 0, [badges]);
  const hasBadges    = (badges?.length ?? 0) > 0;
  const hasRevealed  = rollComplete || (!!isRevealing && !!revealActive && visibleFp !== undefined && visibleFp > 0);
  const pulsePal     = pulsePalette(pulse);
  const showPulse    = !!pulse && pulse !== "NEUTRAL" && hasRevealed;

  const cardSalary = Number((card as any)?.salary ?? 0);
  const derivedTier = cardSalary >= 52 ? "ORANGE" : cardSalary >= 40 ? "PURPLE" : cardSalary >= 28 ? "BLUE" : cardSalary >= 16 ? "GREEN" : "WHITE";
  const tier         = getTier(derivedTier);
  const isWhiteTier  = derivedTier === "WHITE";
  const onCardText   = isWhiteTier ? "#FFFFFF" : "#000000";
  const initials     = initialsFromName(name || `${team} ${pos}`);
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

        {/* Tier gradient */}
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to bottom, ${tier.bg} 0%, ${tier.bgEnd} 70%, ${tier.bgEnd} 100%)`,
        }} />

        {/* HERO — sport-specific content, covers top 72% */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: "27.8%" }}>
          {renderHero({ card, initials, isActiveReveal })}
        </div>

        {/* SALARY — top-left */}
        <div style={{ position: "absolute", top: "6.5%", left: "6%", zIndex: 8, pointerEvents: "none", lineHeight: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 900, fontStyle: "italic", color: onCardText, letterSpacing: -0.5, lineHeight: 1 }}>
            ${salary}
          </span>
        </div>

        {/* POSITION — top-right, matches salary weight/size/style */}
        <div style={{ position: "absolute", top: "6%", right: "6%", zIndex: 8, pointerEvents: "none" }}>
          <span style={{ fontSize: 16, fontWeight: 900, fontStyle: "italic", color: onCardText, letterSpacing: -0.5, lineHeight: 1, textTransform: "uppercase" }}>
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
            gap: 2, minWidth: 0,
          }}>
            {nameLine1 && (
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", color: "#FFFFFF", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: "100%" }}>
                {nameLine1}
              </span>
            )}
            {nameLine2 && (
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", color: "#FFFFFF", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: "100%" }}>
                {nameLine2}
              </span>
            )}
          </div>

          {/* RIGHT — FP column */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", flexShrink: 0, minWidth: 52, maxWidth: 68 }}>

            {/* PRE-REVEAL layer: "PROJ" label + projected number */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "flex-end", justifyContent: "center",
              gap: 2,
              opacity: isShowingActualFp ? 0 : 1,
              transition: "opacity 350ms ease",
              pointerEvents: "none",
            }}>
              <span style={{ fontSize: 7, fontWeight: 700, color: "rgba(255,255,255,0.38)", letterSpacing: 1, textTransform: "uppercase", lineHeight: 1 }}>PROJ</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.40)", letterSpacing: -0.3, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
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
                  {isShowingActualFp ? displayedFp.toFixed(1) : fpText}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* ── ACCENT STRIP (86.2% → 99%) — badges + total bonus ── */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: "86.2%", bottom: 0,
          background: tier.accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          paddingLeft: 4, paddingRight: 4,
          zIndex: 4, overflow: "hidden",
          gap: 3,
        }}>
          {hasBadges ? (
            <>
              {badges!.slice(0, 5).map((badge, i) => (
                <div
                  key={badge.id ?? badge.label ?? i}
                  style={{
                    animation: `cfBadgePop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) ${i * 90}ms both`,
                    display: "flex", alignItems: "center", gap: 1,
                    background: "rgba(0,0,0,0.60)", borderRadius: 5,
                    padding: "2px 3px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 9, lineHeight: 1 }}>{badge.icon}</span>
                </div>
              ))}
              {/* Total badge bonus — shown as +X after all badge icons */}
              {badgeBonusFp > 0 && (
                <div style={{
                  animation: `cfBadgePop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) ${(Math.min(badges!.length, 5)) * 90}ms both`,
                  display: "flex", alignItems: "center",
                  background: "rgba(0,0,0,0.70)", borderRadius: 5,
                  padding: "2px 4px",
                  border: "1px solid rgba(255,234,134,0.35)",
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 7, fontWeight: 800, color: "#FFEA86", letterSpacing: 0.3 }}>+{badgeBonusFp}</span>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* STAMP */}
        {stamp && (
          <div style={{
            position: "absolute",
            bottom: "calc(28% + 6px)",
            left: "50%", transform: "translateX(-50%) rotate(-3deg)",
            zIndex: 40, pointerEvents: "none", whiteSpace: "nowrap",
            fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase",
            color: stamp === "SMOKING HOT" ? "#EF4444" : stamp === "ON FIRE" ? "#FB923C" : stamp === "ICE COLD" ? "#9CA3AF" : stamp === "FREEZING" ? "#1E40AF" : "#EF4444",
            textShadow: stamp === "SMOKING HOT" ? "0 0 14px rgba(239,68,68,0.9), 0 2px 4px rgba(0,0,0,0.8)" : stamp === "ON FIRE" ? "0 0 14px rgba(251,146,60,0.8), 0 2px 4px rgba(0,0,0,0.8)" : stamp === "ICE COLD" ? "0 0 6px rgba(156,163,175,0.5), 0 2px 4px rgba(0,0,0,0.8)" : "0 0 8px rgba(30,64,175,0.6), 0 2px 4px rgba(0,0,0,0.8)",
            border: `2px solid ${stamp === "SMOKING HOT" ? "#EF4444" : stamp === "ON FIRE" ? "#FB923C" : stamp === "ICE COLD" ? "#6B7280" : "#1E40AF"}`,
            borderRadius: 4, padding: "2px 7px", background: "rgba(0,0,0,0.72)",
          }}>{stamp}</div>
        )}

      </div>{/* end clipped content */}

      {/* SEASON + TEAM — centered inside notch inner flat (34.2%→63.6%) */}
      {/* Using the inner-flat bounds guarantees text never touches the slanted walls */}
      <div style={{ position: "absolute", top: 0, height: "5.8%", left: "34.2%", right: "36.4%", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 35, pointerEvents: "none", overflow: "hidden" }}>
        <span style={{ fontSize: 6.5, fontWeight: 900, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap", lineHeight: 1 }}>
          {team ? `${team} ${seasonFmt}` : seasonFmt}
        </span>
      </div>

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

      {/* BORDER TRIM */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 50, overflow: "visible" }} viewBox="0 0 1 1" preserveAspectRatio="none">
        <defs>
          <clipPath id={`border-clip-${cardKey.replace(/[^a-z0-9]/gi, "_")}`} clipPathUnits="objectBoundingBox">
            <path d={CARD_PATH} />
          </clipPath>
        </defs>
        <path d={CARD_PATH} fill="none" stroke={tier.bg} strokeWidth="2" strokeOpacity="1.0" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath={`url(#border-clip-${cardKey.replace(/[^a-z0-9]/gi, "_")})`} />
      </svg>

    </div>
  );
}