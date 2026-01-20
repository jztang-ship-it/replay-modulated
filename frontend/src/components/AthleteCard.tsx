import React, { useMemo, useState } from "react";
import type { GamePhase, PlayerCard, TierColor } from "../adapters/types";

/** Card layout constants */
const INSET = 10; // consistent corner padding everywhere

// Move heads DOWN a bit more (you can tune later)
const FACE_Y = "26%";
const IMG_SCALE = 1.03;
const IMG_TRANSLATE_Y = "14%"; // pushes image down

function plHeadshotUrl(photoCode: string) {
  return `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photoCode}.png`;
}

function pickHeadshotSrc(card: any) {
  const direct =
    card?.headshotUrl ??
    card?.headshot ??
    card?.photoUrl ??
    card?.imageUrl ??
    card?.imgUrl ??
    card?.photo ??
    card?.image ??
    card?.avatarUrl ??
    card?.portraitUrl;

  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const code =
    card?.photoCode ??
    card?.photo_code ??
    card?.plPhotoId ??
    card?.pl_photo_id ??
    card?.premierLeaguePhotoId ??
    card?.playerPhotoId ??
    card?.photoId;

  if (typeof code === "number" && Number.isFinite(code)) return plHeadshotUrl(String(code));
  if (typeof code === "string" && code.trim()) return plHeadshotUrl(code.trim());

  return null;
}

function getInitials(name: string) {
  const parts = String(name ?? "").trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}

function fmtYearShort(season: string) {
  const s = String(season ?? "").trim();
  const m = s.match(/(\d{2})\s*-\s*(\d{2})$/);
  if (m) return m[2];
  const n = Number(s);
  if (Number.isFinite(n)) return String(n + 1).slice(-2);
  const m2 = s.match(/(\d{4})/);
  if (m2) return String(Number(m2[1]) + 1).slice(-2);
  return s.slice(-2);
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

function tierTheme(tier: TierColor | undefined) {
  const t = String(tier ?? "WHITE").toUpperCase();
  switch (t) {
    case "ORANGE":
      return {
        fill: "#9A5B10",
        border: "rgba(245,158,11,0.65)",
        medalA: "rgba(255,210,120,0.40)",
        medalB: "rgba(255,255,255,0.10)",
        pop: 1.12,
      };
    case "PURPLE":
      return {
        fill: "#34205F",
        border: "rgba(139,92,246,0.62)",
        medalA: "rgba(210,195,255,0.28)",
        medalB: "rgba(255,255,255,0.08)",
        pop: 1.10,
      };
    case "BLUE":
      return {
        fill: "#15345F",
        border: "rgba(59,130,246,0.62)",
        medalA: "rgba(175,215,255,0.24)",
        medalB: "rgba(255,255,255,0.07)",
        pop: 1.08,
      };
    case "GREEN":
      return {
        fill: "#0F5034",
        border: "rgba(34,197,94,0.58)",
        medalA: "rgba(170,255,220,0.18)",
        medalB: "rgba(255,255,255,0.06)",
        pop: 1.06,
      };
    default:
      return {
        fill: "#232836",
        border: "rgba(255,255,255,0.20)",
        medalA: "rgba(255,255,255,0.10)",
        medalB: "rgba(255,255,255,0.04)",
        pop: 1.03,
      };
  }
}

export function AthleteCard(props: {
  card: PlayerCard;
  phase: GamePhase;
  isLocked: boolean;
  isMvp: boolean; // kept for compatibility, but NOT rendered
  isFlipped: boolean;
  canFlip: boolean;
  onToggleFlip: () => void;
}) {
  const { card, phase, isLocked, canFlip, onToggleFlip } = props;

  const showResults = phase === "RESULTS";
  const clickable = canFlip && showResults;

  const nameFull = String((card as any).name ?? "Unknown");
  const parts = nameFull.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : first;

  const pos = String((card as any).position ?? "");
  const team = String((card as any).team ?? "Unknown");
  const year = useMemo(() => fmtYearShort(String((card as any).season ?? "")), [card]);

  const salary = Number((card as any).salary ?? 0);
  const proj = Number((card as any).projectedFp ?? (card as any).avgFP ?? 0);
  const actual = Number((card as any).actualFp ?? 0);

  const theme = tierTheme((card as any).tier);

  const [imgBroken, setImgBroken] = useState(false);
  const headshotSrc = useMemo(() => (!imgBroken ? pickHeadshotSrc(card as any) : null), [card, imgBroken]);

  // Bottom text scaled down ~30%
  const TEAM_FONT = 8;   // was ~10
  const FIRST_FONT = 8;  // was ~11
  const LAST_FONT = 11;  // was ~16
  const RIGHT_FONT = 8;

  const salaryPill: React.CSSProperties = {
    position: "absolute",
    top: INSET,
    right: INSET,
    padding: "4px 9px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.26)",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.4,
    backdropFilter: "blur(8px)",
    zIndex: 6,
  };

  const holdPill: React.CSSProperties = {
    position: "absolute",
    top: INSET,
    left: INSET,
    padding: "4px 9px",
    borderRadius: 10,
    background: isLocked ? "rgba(255,205,65,0.92)" : "rgba(0,0,0,0.18)",
    border: isLocked ? "1px solid rgba(0,0,0,0.20)" : "1px solid rgba(255,255,255,0.14)",
    color: isLocked ? "rgba(0,0,0,0.90)" : "rgba(255,255,255,0.0)",
    fontSize: 11, // match salary
    fontWeight: 950,
    letterSpacing: 0.8,
    zIndex: 6,
    backdropFilter: "blur(8px)",
  };

  const container: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: 18,
    position: "relative",
    overflow: "hidden",
    userSelect: "none",
    cursor: clickable ? "pointer" : "default",
    background: theme.fill,
    border: `2px solid ${theme.border}`,
    boxSizing: "border-box", // ensures border is included in size calculations
    boxShadow: "0 14px 34px rgba(0,0,0,0.55)",
    transform: "translateZ(0)", // helps border rendering on some GPUs
  };

  // Medal-like shine that depends on tier, but doesn’t wash the face
  const medalShine: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 3,
    background:
      `radial-gradient(120% 70% at 30% 0%, ${theme.medalA} 0%, rgba(255,255,255,0) 55%),` +
      `radial-gradient(80% 60% at 85% 20%, ${theme.medalB} 0%, rgba(255,255,255,0) 60%),` +
      `linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.22) 68%, rgba(0,0,0,0.50) 100%)`,
  };

  // Slight pop effect for player over background: shadow + contrast
  const playerFilter = `drop-shadow(0 18px 30px rgba(0,0,0,0.42)) contrast(${theme.pop}) saturate(1.12) brightness(1.06)`;

  const bottom: React.CSSProperties = {
    position: "absolute",
    left: INSET,
    right: INSET,
    bottom: INSET,
    zIndex: 6,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    columnGap: 10,
    alignItems: "end",
  };

  // tighter spacing between the “3 rows” stack
  const leftStack: React.CSSProperties = {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2, // was 4
  };

  const rightStack: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2, // was 4
    whiteSpace: "nowrap",
  };

  const projOrFp = showResults ? `FP ${round1(actual)}` : `PROJ ${round1(proj)}`;

  return (
    <div style={container} onClick={clickable ? onToggleFlip : undefined}>
      {/* HERO IMAGE */}
      <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
        {headshotSrc ? (
          <img
            src={headshotSrc}
            alt={nameFull}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onError={() => setImgBroken(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: `50% ${FACE_Y}`,
              transform: `scale(${IMG_SCALE}) translateY(${IMG_TRANSLATE_Y})`,
              transformOrigin: "50% 15%",
              filter: playerFilter, // sharper / clearer / more pop
              imageRendering: "auto",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 950,
              color: "rgba(255,255,255,0.85)",
              background: "rgba(0,0,0,0.20)",
            }}
          >
            {getInitials(nameFull)}
          </div>
        )}
      </div>

      {/* Shine + vignette */}
      <div style={medalShine} />

      {/* TOP PILLS */}
      <div style={holdPill}>{isLocked ? "HOLD" : ""}</div>
      <div style={salaryPill}>${salary}</div>

      {/* BOTTOM TEXT */}
      <div style={bottom}>
        <div style={leftStack}>
          <div
            style={{
              fontSize: TEAM_FONT,
              fontWeight: 900,
              letterSpacing: 1.0,
              opacity: 0.85,
              color: "rgba(255,255,255,0.92)",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {team} • {year}
          </div>

          <div
            style={{
              fontSize: FIRST_FONT,
              fontWeight: 900,
              letterSpacing: 0.6,
              opacity: 0.95,
              color: "rgba(255,255,255,0.96)",
              textTransform: "uppercase",
              lineHeight: "10px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {first}
          </div>

          <div
            style={{
              fontSize: LAST_FONT,
              fontWeight: 950,
              letterSpacing: 0.8,
              color: "rgba(255,255,255,0.98)",
              textTransform: "uppercase",
              lineHeight: "12px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {last}
          </div>
        </div>

        <div style={rightStack}>
          <div style={{ fontSize: RIGHT_FONT, fontWeight: 950, letterSpacing: 0.9, opacity: 0.95 }}>
            {pos}
          </div>
          <div style={{ fontSize: RIGHT_FONT, fontWeight: 950, letterSpacing: 0.7, opacity: 0.95 }}>
            {projOrFp}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AthleteCard;
