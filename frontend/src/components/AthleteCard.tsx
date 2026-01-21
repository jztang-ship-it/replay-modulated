import React, { useEffect, useMemo, useState } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";

type Props = {
  card: PlayerCard;
  phase: GamePhase;
  isLocked: boolean;
  isMvp: boolean;
  isFlipped: boolean;
  canFlip: boolean;
  onToggleFlip: () => void;
};

function clampText(v: any) {
  return String(v ?? "").trim();
}

function initialsFromName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

function formatSeasonRange(season: any): string {
  const s = clampText(season);

  // 2024-2025 => 24-25
  let m = s.match(/(\d{4})\D+(\d{4})/);
  if (m) return `${m[1].slice(2)}-${m[2].slice(2)}`;

  // 24-25 => 24-25
  m = s.match(/(\d{2})\D+(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;

  // 2024 => 24-25
  m = s.match(/(\d{4})/);
  if (m) {
    const a = m[1].slice(2);
    const b = String((Number(a) + 1) % 100).padStart(2, "0");
    return `${a}-${b}`;
  }

  return s;
}

function buildHeadshotCandidates(card: any): string[] {
  const direct =
    card?.headshotUrl ||
    card?.photoUrl ||
    card?.imageUrl ||
    card?.image ||
    card?.portraitUrl ||
    card?.headshot ||
    card?.img ||
    card?.player?.headshotUrl ||
    card?.player?.photoUrl ||
    card?.player?.imageUrl ||
    card?.player?.portraitUrl ||
    card?.player?.image;

  const picked = clampText(direct);
  const out: string[] = [];
  if (picked) out.push(picked);

  const codeRaw = clampText(card?.photoCode);
  if (!codeRaw) return out;

  const codeNoP = codeRaw.replace(/^p/i, "");
  const pcode = `p${codeNoP}`;

  out.push(`https://resources.premierleague.com/premierleague/photos/players/250x250/${pcode}.png`);
  out.push(`https://resources.premierleague.com/premierleague/photos/players/110x140/${pcode}.png`);
  out.push(`https://resources.premierleague.com/premierleague/photos/players/120x120/${pcode}.png`);
  return out;
}

function tierTheme(tierRaw: any) {
  const t = String(tierRaw ?? "").toUpperCase();

  // slightly stronger than before so border reads clearly
  const base = { frame: "rgba(120,150,255,0.90)", glow: "rgba(120,150,255,0.22)" };

  if (t.includes("PURPLE")) return { frame: "rgba(170,110,255,0.92)", glow: "rgba(170,110,255,0.26)" };
  if (t.includes("GREEN")) return { frame: "rgba(70,210,130,0.92)", glow: "rgba(70,210,130,0.24)" };
  if (t.includes("ORANGE")) return { frame: "rgba(255,170,70,0.94)", glow: "rgba(255,170,70,0.26)" };
  if (t.includes("BLUE")) return { frame: "rgba(80,160,255,0.92)", glow: "rgba(80,160,255,0.24)" };
  if (t.includes("WHITE")) return { frame: "rgba(255,255,255,0.72)", glow: "rgba(255,255,255,0.16)" };

  return base;
}

/** Always keep year fully visible by truncating team first. */
function teamYearLine(team: string, seasonFmt: string, maxTeamChars = 14) {
  const t = clampText(team).toUpperCase();
  const y = clampText(seasonFmt);
  if (!t) return y;
  if (t.length <= maxTeamChars) return `${t} • ${y}`;
  return `${t.slice(0, Math.max(0, maxTeamChars - 1))}… • ${y}`;
}

export function AthleteCard(props: Props) {
  const { card, phase, isLocked } = props;

  const name = clampText((card as any)?.name);
  const team = clampText((card as any)?.team);
  const season = (card as any)?.season ?? (card as any)?.year ?? (card as any)?.seasonLabel;
  const seasonFmt = formatSeasonRange(season);

  const posRaw = clampText((card as any)?.position);
  const pos = posRaw ? posRaw.slice(0, 2).toUpperCase() : "";

  const salary = Number((card as any)?.salary ?? 0);

  const showResults = phase === "RESULTS";
  const proj = Number((card as any)?.projectedFp ?? 0);
  const actual = Number((card as any)?.actualFp ?? 0);
  const value = showResults ? actual : proj;
  const label = showResults ? "FP" : "PROJ";
  const valueText = Number.isFinite(value) ? value.toFixed(value % 1 === 0 ? 0 : 1) : "0";

  const first = useMemo(() => {
    const parts = name.split(/\s+/).filter(Boolean);
    return clampText(parts[0] ?? "");
  }, [name]);

  const last = useMemo(() => {
    const parts = name.split(/\s+/).filter(Boolean);
    return clampText(parts.slice(1).join(" ") || parts[0] || "");
  }, [name]);

  const candidates = useMemo(() => buildHeadshotCandidates(card), [card]);
  const [idx, setIdx] = useState(0);

  useEffect(() => setIdx(0), [String((card as any)?.photoCode ?? "")]);

  const headshotSrc = candidates[idx] ?? "";
  const initials = initialsFromName(name || `${team} ${pos}`);
  const tier = tierTheme((card as any)?.tier);

  // -------------------- TUNING (ONLY WHAT YOU ASKED) --------------------
  const CORNER_PAD = 8;
  const DOCK_BORDER_SAFE = 6;


  // 1) keep heads down; if you want more, change this only.
  const HEAD_SHIFT_PX = 18;

  // 2) Move dock DOWN to kiss bottom border but NOT cover colored tier border.
  // Border is 2px; keep a small safety gap so ring stays visible.
  
  const DOCK_BOTTOM_GAP = 4;   // <-- this is the key: smaller = closer to border

  // Keep the “good” dock height and content density (no added spacing)
  const DOCK_HEIGHT = "24%";

  // Tight row spacing (what you had)
  const ROW_GAP = 1;

  // -------------------- STYLES --------------------
  const cardShell: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: 18,
    overflow: "hidden",
    background: "linear-gradient(180deg, #0B1220 0%, #070B14 100%)",
    border: `2px solid ${tier.frame}`,
    boxShadow: "0 18px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08) inset",
  };

  const tierGlow: React.CSSProperties = {
    position: "absolute",
    inset: -40,
    pointerEvents: "none",
    background: `radial-gradient(closest-side at 20% 15%, ${tier.glow} 0%, rgba(0,0,0,0) 70%)`,
    opacity: 0.55,
  };

  const topStrip: React.CSSProperties = {
    position: "absolute",
    top: CORNER_PAD,
    left: CORNER_PAD,
    right: CORNER_PAD,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 6,
    pointerEvents: "none",
  };

  const salaryTag: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 12,
    background: "rgba(15,18,24,0.55)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.95)",
    fontWeight: 950,
    fontSize: 12,
    letterSpacing: 0.6,
    backdropFilter: "blur(10px)",
  };

  // HOLD triangle (yellow) with centered H
  const holdTri: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    borderTop: "42px solid rgba(245,200,80,0.95)",
    borderRight: "42px solid transparent",
    zIndex: 7,
    pointerEvents: "none",
  };

  const holdText: React.CSSProperties = {
    position: "absolute",
    top: 14,
    left: 14,
    transform: "translate(-50%, -50%)",
    zIndex: 8,
    pointerEvents: "none",
    fontSize: 12,
    fontWeight: 950,
    color: "rgba(0,0,0,0.92)",
  };

  const heroWrap: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 1,
  };

  const heroMask: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: 18,
    overflow: "hidden",
    transform: "translateZ(0)",
  };

  const heroImage: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "50% 0%",
    transform: `translateY(${HEAD_SHIFT_PX}px) scale(1.03)`,
  };

  const heroShade: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(110% 85% at 50% 20%, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.10) 60%, rgba(0,0,0,0.30) 100%)",
  };

  const placeholder: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    fontSize: 68,
    fontWeight: 950,
    letterSpacing: 2,
    color: "rgba(255,255,255,0.70)",
    textShadow: "0 10px 30px rgba(0,0,0,0.60)",
    userSelect: "none",
  };

  // ✅ This is the SAME “nice pill” look you liked. Only moved down.
  const dock: React.CSSProperties = {
    position: "absolute",
    left: DOCK_BORDER_SAFE,     // full width look, but keep border visible
    right: DOCK_BORDER_SAFE,    // full width look, but keep border visible
    bottom: DOCK_BOTTOM_GAP,
    height: DOCK_HEIGHT,
  
    // Make it feel like it “belongs” to the bottom edge
    borderRadius: 18,
    padding: "6px 12px",        // tighter padding = less blocking
  
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 10,
  
    // KEEP your nice glass gradient look
    background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.62))",
  
    // REMOVE the left/right “lines” entirely
    borderTop: "1px solid rgba(255,255,255,0.10)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    borderLeft: "0px solid transparent",
    borderRight: "0px solid transparent",
  
    boxShadow: "0 10px 22px rgba(0,0,0,0.28)",
    backdropFilter: "blur(12px)",
    zIndex: 6,
  };
  

  const shadowText = "0 2px 8px rgba(0,0,0,0.55)";

  const teamLine: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 1.0,
    textTransform: "uppercase",
    opacity: 0.9,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textShadow: shadowText,
    textAlign: "center",
    lineHeight: "1.05",
  };
  
  const firstLine: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textShadow: shadowText,
    textAlign: "left",
    lineHeight: "1.05",
  };
  
  const lastLine: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textShadow: shadowText,
    textAlign: "left",
    lineHeight: "1.05",
  };
  
  const posLine: React.CSSProperties = {
    fontSize: 10,              // same size as first name
    fontWeight: 900,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textShadow: shadowText,
    opacity: 0.95,
    lineHeight: "1.05",
  };
  
  const labelLine: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 1.0,
    textShadow: shadowText,
    opacity: 0.75,
    lineHeight: "1.05",
  };
  
  const valueLine: React.CSSProperties = {
    fontSize: 12,              // keep like salary
    fontWeight: 950,
    letterSpacing: 0.2,
    textShadow: shadowText,
    opacity: 0.98,
    lineHeight: "1.05",
  };
  

  const teamSeason = teamYearLine(team, seasonFmt, 14);

  return (
    <div style={cardShell}>
      <div style={tierGlow} />

      {phase === "HOLD" && isLocked ? (
        <>
          <div style={holdTri} />
          <div style={holdText}>H</div>
        </>
      ) : null}

      <div style={topStrip}>
        <div />
        <div style={salaryTag}>${salary}</div>
      </div>

      <div style={heroWrap}>
        <div style={heroMask}>
          {headshotSrc ? (
            <img
              key={headshotSrc}
              src={headshotSrc}
              alt={name}
              style={heroImage}
              draggable={false}
              referrerPolicy="no-referrer"
              onError={() => {
                if (idx < candidates.length - 1) setIdx((v) => v + 1);
                else setIdx(candidates.length);
              }}
            />
          ) : (
            <div style={placeholder}>{initials}</div>
          )}
          <div style={heroShade} />
        </div>
      </div>

      <div style={dock}>
  {/* LEFT block is still the main text, but row2/row3 have right-aligned fields */}
  <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: ROW_GAP }}>
    {/* 1) centered team-year (year always shown by your teamSeason formatter) */}
    <div style={teamLine}>{teamSeason}</div>

    {/* 2) first name left, position right (same size text) */}
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
      <div style={{ ...firstLine, minWidth: 0, flex: 1 }}>{first}</div>
      <div style={posLine}>{pos}</div>
    </div>

    {/* 3) last name left, PROJ/FP + number right (compact, right aligned) */}
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
      <div style={{ ...lastLine, minWidth: 0, flex: 1 }}>{last}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
        <div style={labelLine}>{label}</div>
        <div style={valueLine}>{valueText}</div>
      </div>
    </div>
  </div>
</div>

    </div>
  );
}
