import React, { useMemo, useState } from "react";
import type { GamePhase, PlayerCard, TierColor } from "../adapters/types";

/**
 * AthleteCard
 * Cornered UI, face-safe.
 */

const SAFE = 8;

// Push heads DOWN a bit more
const FACE_Y = "24%";
const IMG_SCALE = 1.02;
const IMG_TRANSLATE_Y = "12%"; // <— move the whole head down

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

function tierTheme(tier: TierColor | undefined) {
  const t = String(tier ?? "WHITE").toUpperCase();
  switch (t) {
    case "ORANGE":
      return { fill: "#B06B12", border: "rgba(245,158,11,0.55)", shine: 0.22 };
    case "PURPLE":
      return { fill: "#3B2A6C", border: "rgba(139,92,246,0.55)", shine: 0.18 };
    case "BLUE":
      return { fill: "#1D3B70", border: "rgba(59,130,246,0.55)", shine: 0.14 };
    case "GREEN":
      return { fill: "#145B3B", border: "rgba(34,197,94,0.50)", shine: 0.12 };
    default:
      return { fill: "#2A2F3A", border: "rgba(255,255,255,0.18)", shine: 0.06 };
  }
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

export function AthleteCard(props: {
  card: PlayerCard;
  phase: GamePhase;
  isLocked: boolean;
  isMvp: boolean;
  isFlipped: boolean;
  canFlip: boolean;
  onToggleFlip: () => void;
}) {
  const { card, phase, isLocked, isMvp, isFlipped, canFlip, onToggleFlip } = props;

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

  // --- sizing (you asked: roughly 1/2 the bottom text sizes) ---
  const SALARY_FONT = 12; // used by HOLD too
  const TEAM_FONT = 10;   // 1/2-ish
  const FIRST_FONT = 11;  // 1/2-ish
  const LAST_FONT = 16;   // 1/2-ish from the giant text

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
    boxShadow: isLocked ? "0 0 0 2px rgba(255,255,255,0.10), 0 14px 34px rgba(0,0,0,0.55)" : "0 14px 34px rgba(0,0,0,0.50)",
  };

  const shine: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      `radial-gradient(120% 70% at 30% 0%, rgba(255,255,255,${theme.shine}) 0%, rgba(255,255,255,0) 55%),` +
      `linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.30) 65%, rgba(0,0,0,0.52) 100%)`,
    zIndex: 3,
  };

  // tighter corners (closer to the edges)
  const topLeftPill: React.CSSProperties = {
    position: "absolute",
    top: SAFE,
    left: SAFE,
    padding: "4px 9px",
    borderRadius: 10,
    background: isLocked ? "rgba(255,205,65,0.92)" : "rgba(0,0,0,0.18)",
    border: isLocked ? "1px solid rgba(0,0,0,0.20)" : "1px solid rgba(255,255,255,0.14)",
    color: isLocked ? "rgba(0,0,0,0.90)" : "rgba(255,255,255,0.0)",
    fontSize: SALARY_FONT, // same as salary
    fontWeight: 950,
    letterSpacing: 0.8,
    zIndex: 6,
    backdropFilter: "blur(8px)",
    minHeight: 22,
    display: "inline-flex",
    alignItems: "center",
  };

  const topRightPill: React.CSSProperties = {
    position: "absolute",
    top: SAFE,
    right: SAFE,
    padding: "4px 9px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.28)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.92)",
    fontSize: SALARY_FONT,
    fontWeight: 900,
    letterSpacing: 0.4,
    backdropFilter: "blur(8px)",
    zIndex: 6,
    minHeight: 22,
    display: "inline-flex",
    alignItems: "center",
  };

  // hero headshot
  const hero: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    pointerEvents: "none",
  };

  const bottom: React.CSSProperties = {
    position: "absolute",
    left: SAFE,
    right: SAFE,
    bottom: SAFE,
    zIndex: 6,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    columnGap: 10,
    alignItems: "end",
  };

  const leftStack: React.CSSProperties = {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start", // left-aligned
    gap: 4,
  };

  const rightStack: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4, // condensed to match left spacing
    whiteSpace: "nowrap",
  };

  const teamLine: React.CSSProperties = {
    fontSize: TEAM_FONT,
    fontWeight: 900,
    letterSpacing: 1.1,
    opacity: 0.82,
    color: "rgba(255,255,255,0.92)",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
  };

  const firstLine: React.CSSProperties = {
    fontSize: FIRST_FONT,
    fontWeight: 900,
    letterSpacing: 0.7,
    opacity: 0.92,
    color: "rgba(255,255,255,0.96)",
    textTransform: "uppercase",
    lineHeight: "12px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
  };

  const lastLine: React.CSSProperties = {
    fontSize: LAST_FONT,
    fontWeight: 950,
    letterSpacing: 0.9,
    color: "rgba(255,255,255,0.98)",
    textTransform: "uppercase",
    lineHeight: "16px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
  };

  const posText: React.CSSProperties = {
    fontSize: TEAM_FONT,
    fontWeight: 950,
    letterSpacing: 1.0,
    opacity: 0.92,
    textTransform: "uppercase",
  };

  const fpText: React.CSSProperties = {
    fontSize: TEAM_FONT,
    fontWeight: 950,
    letterSpacing: 0.8,
    opacity: 0.92,
  };

  const projOrFp = showResults ? `FP ${round1(actual)}` : `PROJ ${round1(proj)}`;

  return (
    <div style={container} onClick={clickable ? onToggleFlip : undefined}>
      {/* HERO IMAGE */}
      <div style={hero}>
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
              // pop
              filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.40)) contrast(1.06) saturate(1.08) brightness(1.04)",
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

      {/* shine/vignette */}
      <div style={shine} />

      {/* TOP LEFT HOLD */}
      <div style={topLeftPill}>{isLocked ? "HOLD" : ""}</div>

      {/* TOP RIGHT SALARY */}
      <div style={topRightPill}>${salary}</div>

      {/* MVP small tag (keep it out of the face) */}
      {isMvp ? (
        <div
          style={{
            position: "absolute",
            top: SAFE,
            left: SAFE + 62,
            zIndex: 6,
            padding: "4px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 950,
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.14)",
            backdropFilter: "blur(8px)",
            color: "rgba(255,255,255,0.92)",
          }}
        >
          ★ MVP
        </div>
      ) : null}

      {/* BOTTOM TEXT */}
      <div style={bottom}>
        <div style={leftStack}>
          <div style={teamLine}>
            {team} • {year}
          </div>
          <div style={firstLine}>{first}</div>
          <div style={lastLine}>{last}</div>
        </div>

        <div style={rightStack}>
          <div style={posText}>{pos}</div>
          <div style={fpText}>{projOrFp}</div>
        </div>
      </div>
    </div>
  );
}

export default AthleteCard;
