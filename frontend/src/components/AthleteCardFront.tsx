import React, { useEffect, useMemo, useState } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";

// Optional (safe) types — you can keep them as string unions
export type PerformanceTag = "ICE_COLD" | "COLD" | "OK" | "HOT" | "ON_FIRE" | "CAREER_NIGHT";
export type PulseStyle = "NEG" | "NEUTRAL" | "POS" | "JACKPOT";

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

function safeKeyFor(card: any) {
  const base = String(card?.basePlayerId ?? "").trim();
  const season = String(card?.season ?? "").trim();
  return `${base}|${season}`;
}

function buildHeadshotCandidates(card: any, safeCode?: string | null): string[] {
  const out: string[] = [];

  const addUnique = (url: string | undefined | null) => {
    const u = clampText(url);
    if (!u) return;
    if (!out.includes(u)) out.push(u);
  };

  // ✅ SAFE photo code (only if safe for THIS player)
  const codeRaw = clampText(safeCode);

  // 1) Local first (SAFE ONLY)
  if (codeRaw) {
    addUnique(`/headshots/${codeRaw}.png`);
  }

  // 2) Direct URL next (always allowed)
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

  addUnique(direct);

  // 3) Remote fallbacks last (SAFE ONLY)
  if (codeRaw) {
    const codeNoP = codeRaw.replace(/^p/i, "");
    const pcode = `p${codeNoP}`;

    addUnique(`https://resources.premierleague.com/premierleague/photos/players/250x250/${pcode}.png`);
    addUnique(`https://resources.premierleague.com/premierleague/photos/players/110x140/${pcode}.png`);
    addUnique(`https://resources.premierleague.com/premierleague/photos/players/120x120/${pcode}.png`);
  }

  return out;
}

// ======================== Tier theming (unchanged) ========================

type TierTheme = {
  bg: string;
  frame: string;
  glow: string;
  textOnDark: boolean;
};

function tierTheme(tierRaw: any): TierTheme {
  const t = String(tierRaw ?? "").toUpperCase();

  if (t.includes("ORANGE"))
    return {
      bg: "linear-gradient(160deg, #2A1500 0%, #1A0D00 40%, #0F0800 100%)",
      frame: "rgba(255,160,50,0.90)",
      glow: "rgba(255,140,30,0.28)",
      textOnDark: false,
    };

  if (t.includes("PURPLE"))
    return {
      bg: "linear-gradient(160deg, #1A0D2E 0%, #110920 40%, #080612 100%)",
      frame: "rgba(175,100,255,0.88)",
      glow: "rgba(160,90,255,0.26)",
      textOnDark: false,
    };

  if (t.includes("BLUE"))
    return {
      bg: "linear-gradient(160deg, #071828 0%, #04101C 40%, #020A12 100%)",
      frame: "rgba(70,155,255,0.88)",
      glow: "rgba(60,140,255,0.24)",
      textOnDark: false,
    };

  if (t.includes("GREEN"))
    return {
      bg: "linear-gradient(160deg, #061A0F 0%, #04120A 40%, #020A06 100%)",
      frame: "rgba(60,210,120,0.88)",
      glow: "rgba(50,200,110,0.22)",
      textOnDark: false,
    };

  if (t.includes("WHITE"))
    return {
      bg: "linear-gradient(160deg, #141820 0%, #0D1118 40%, #080A10 100%)",
      frame: "rgba(200,215,240,0.55)",
      glow: "rgba(200,215,240,0.12)",
      textOnDark: false,
    };

  return {
    bg: "linear-gradient(160deg, #071828 0%, #04101C 40%, #020A12 100%)",
    frame: "rgba(100,140,220,0.80)",
    glow: "rgba(100,140,220,0.20)",
    textOnDark: false,
  };
}

/** Always keep year fully visible by truncating team first. */
function teamYearLine(team: string, seasonFmt: string, maxTeamChars = 14) {
  const t = clampText(team).toUpperCase();
  const y = clampText(seasonFmt);
  if (!t) return y;
  if (t.length <= maxTeamChars) return `${t} • ${y}`;
  return `${t.slice(0, Math.max(0, maxTeamChars - 1))}… • ${y}`;
}

// ======================== Emotion visuals (NEW) ========================

const EMO_STYLE_ID = "athlete-card-emotion-styles";
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
    @keyframes headlinePop {
      0%   { transform: translateY(8px) scale(0.96); opacity: 0; }
      55%  { transform: translateY(-2px) scale(1.03); opacity: 1; }
      100% { transform: translateY(0px) scale(1.00); opacity: 1; }
    }
    @keyframes headlineDrop {
      0%   { transform: translateY(-10px) scale(0.98); opacity: 0; }
      55%  { transform: translateY(0px) scale(1.02); opacity: 1; }
      100% { transform: translateY(0px) scale(1.00); opacity: 1; }
    }
  `;
  document.head.appendChild(st);
}

function pulsePalette(pulse?: PulseStyle) {
  switch (pulse) {
    case "JACKPOT":
      return {
        ring: "rgba(255, 215, 80, 0.55)",
        glow: "rgba(255, 205, 70, 0.28)",
        frame: "rgba(255, 215, 80, 0.95)",
      };
    case "POS":
      return {
        ring: "rgba(255, 150, 70, 0.50)",
        glow: "rgba(255, 140, 60, 0.22)",
        frame: "rgba(255, 160, 80, 0.65)",
      };
    case "NEG":
      return {
        ring: "rgba(120, 180, 235, 0.50)",
        glow: "rgba(110, 170, 230, 0.20)",
        frame: "rgba(130, 190, 245, 0.60)",
      };
    default:
      return {
        ring: "rgba(255,255,255,0.10)",
        glow: "rgba(255,255,255,0.06)",
        frame: "rgba(255,255,255,0.10)",
      };
  }
}

function headlineFromTag(tag?: PerformanceTag): { text: string; color: string; anim: "headlinePop" | "headlineDrop" } | null {
  switch (tag) {
    case "CAREER_NIGHT":
      return { text: "🚀 CAREER NIGHT", color: "rgba(255,215,0,0.95)", anim: "headlinePop" };
    case "ON_FIRE":
      return { text: "🔥 ON FIRE", color: "rgba(255,140,50,0.95)", anim: "headlinePop" };
    case "HOT":
      return { text: "🔥 HOT", color: "rgba(255,160,70,0.92)", anim: "headlinePop" };
    case "ICE_COLD":
      return { text: "🥶 ICE COLD", color: "rgba(130,180,220,0.95)", anim: "headlineDrop" };
    case "COLD":
      return { text: "🥶 COLD", color: "rgba(150,195,230,0.90)", anim: "headlineDrop" };
    default:
      return null;
  }
}

export function AthleteCardFront(props: {
  card: PlayerCard;
  phase: GamePhase;
  isLocked: boolean;
  isMvp: boolean;
  isFlipped: boolean;
  canFlip: boolean;
  onToggleFlip: () => void;

  // Reveal
  visibleFp?: number;
  visibleBadgeCount?: number;
  isRevealing?: boolean;

  // NEW: evaluator-driven hooks (optional but recommended)
  performanceTag?: PerformanceTag;
  pulse?: PulseStyle;
  fpCountUpMs?: number;
}) {
  const {
    card,
    phase,
    isLocked,
    visibleFp,
    isRevealing,
    performanceTag,
    pulse,
    fpCountUpMs,
  } = props;

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

  // Rolling FP animation state
  const [displayedFp, setDisplayedFp] = useState(proj);
  const [isRolling, setIsRolling] = useState(false);

  // Latch: only for THIS card
  const [rollComplete, setRollComplete] = useState(false);

  // ================= SAFE HEADSHOT MAP =================
  const [safeMap, setSafeMap] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let alive = true;

    fetch("/headshots/safe-headshot-map.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((json) => {
        if (alive) setSafeMap(json ?? {});
      })
      .catch(() => {
        if (alive) setSafeMap({});
      });

    return () => {
      alive = false;
    };
  }, []);

  // stable identity for the card
  const cardKey = useMemo(() => safeKeyFor(card), [card]);

  // safeCode comes ONLY from safe-headshot-map.json
  const safeCode = useMemo(() => {
    if (!safeMap) return null;
    return safeMap[cardKey] ?? null;
  }, [safeMap, cardKey]);

  const candidates = useMemo(() => {
    return buildHeadshotCandidates(card, safeCode);
  }, [card, safeCode]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [cardKey]);

  const headshotSrc = candidates[idx] ?? "";

  const initials = initialsFromName(name || `${team} ${pos}`);
  const tier = tierTheme((card as any)?.tier);

  // -------------------- FP roll --------------------
  // Uses fpCountUpMs when provided (evaluator-driven pacing),
  // else defaults to 500ms (your old behavior).
  useEffect(() => {
    if (visibleFp === undefined) {
      setDisplayedFp(showResults ? actual : proj);
      return;
    }

    if (visibleFp > 0 && displayedFp !== visibleFp) {
      setIsRolling(true);
      setRollComplete(false);

      const startValue = displayedFp;
      const endValue = visibleFp;

      const duration = Math.max(220, Math.min(2200, Number(fpCountUpMs ?? 500)));
      const startTime = Date.now();

      let raf = 0;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = startValue + (endValue - startValue) * eased;

        setDisplayedFp(current);

        if (progress < 1) {
          raf = requestAnimationFrame(animate);
        } else {
          setDisplayedFp(endValue);
          setIsRolling(false);
          setRollComplete(true);
        }
      };

      raf = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(raf);
    }
  }, [visibleFp, fpCountUpMs]); // intentionally *not* including displayedFp to avoid restart loops

  // Reset latch when card identity changes
  useEffect(() => {
    setRollComplete(false);
    setDisplayedFp(proj);
    setIsRolling(false);
  }, [cardKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Determine what to show
  const fpValue = showResults ? (visibleFp !== undefined ? displayedFp : actual) : proj;
  const label = showResults ? "FP" : "PROJ";
  const valueText = Number.isFinite(fpValue) ? fpValue.toFixed(fpValue % 1 === 0 ? 0 : 1) : "0";

  const first = useMemo(() => {
    const parts = name.split(/\s+/).filter(Boolean);
    return clampText(parts[0] ?? "");
  }, [name]);

  const last = useMemo(() => {
    const parts = name.split(/\s+/).filter(Boolean);
    return clampText(parts.slice(1).join(" ") || parts[0] || "");
  }, [name]);

  // Headline:
  // - Prefer evaluator-driven performanceTag if provided
  // - fallback to old ratio logic
  const hasRevealed = rollComplete || (!!isRevealing && visibleFp !== undefined && visibleFp > 0);

  const fallbackHeadline = useMemo(() => {
    if (!hasRevealed || proj <= 0) return null;
    const ratio = actual / proj;
    if (ratio > 1.40) return { text: "🚀 CAREER NIGHT", color: "rgba(255, 215, 0, 0.95)", anim: "headlinePop" as const };
    if (ratio > 1.15) return { text: "🔥 ON FIRE", color: "rgba(255, 140, 50, 0.95)", anim: "headlinePop" as const };
    if (ratio <= 0.70) return { text: "🥶 ICE COLD", color: "rgba(130, 180, 220, 0.95)", anim: "headlineDrop" as const };
    return null;
  }, [hasRevealed, proj, actual]);

  const tagHeadline = performanceTag ? headlineFromTag(performanceTag) : null;
  const headline = tagHeadline ?? fallbackHeadline;

  // -------------------- TUNING (kept) --------------------
  const CORNER_PAD = 8;
  const DOCK_BORDER_SAFE = 6;
  const HEAD_SHIFT_PX = 18;
  const DOCK_BOTTOM_GAP = 4;
  const DOCK_HEIGHT = "24%";
  const ROW_GAP = 1;

  // -------------------- Emotion ring/glow --------------------
  const pulsePal = pulsePalette(pulse);
  const showPulse = !!pulse && pulse !== "NEUTRAL" && hasRevealed;

  // -------------------- Styles --------------------
  const cardShell: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: 18,
    overflow: "hidden",

    background: tier.bg,

    // base tier frame + extra emotion frame tint
    border: `2px solid ${showPulse ? pulsePal.frame : tier.frame}`,

    boxShadow: `0 18px 40px rgba(0,0,0,0.50),
      0 0 0 1px rgba(255,255,255,0.06) inset,
      0 0 30px ${tier.glow},
      ${showPulse ? `0 0 26px ${pulsePal.glow}` : ""}`,
  };

  // a subtle pulsing ring layer that doesn't affect layout
  const pulseRing: React.CSSProperties = {
    position: "absolute",
    inset: -2,
    borderRadius: 20,
    pointerEvents: "none",
    border: `2px solid ${pulsePal.ring}`,
    opacity: showPulse ? 1 : 0,
    animation: showPulse ? "pulseRing 950ms ease-in-out infinite" : "none",
    filter: "blur(0.2px)",
    zIndex: 5,
  };

  const tierGlow: React.CSSProperties = {
    position: "absolute",
    inset: -40,
    pointerEvents: "none",
    background: `radial-gradient(closest-side at 30% 20%, ${tier.glow} 0%, rgba(0,0,0,0) 70%)`,
    opacity: 0.7,
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

  const dock: React.CSSProperties = {
    position: "absolute",
    left: DOCK_BORDER_SAFE,
    right: DOCK_BORDER_SAFE,
    bottom: DOCK_BOTTOM_GAP,
    height: DOCK_HEIGHT,
    borderRadius: 18,
    padding: "6px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 10,
    background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.62))",
    borderTop: "1px solid rgba(255,255,255,0.10)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
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
    fontSize: 10,
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
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: 0.2,
    textShadow: shadowText,
    opacity: 0.98,
    lineHeight: "1.05",
  };

  const teamSeason = teamYearLine(team, seasonFmt, 14);
  const showHoldIndicator = isLocked || (card as any).wasHeld;

  return (
    <div style={cardShell}>
      <div style={tierGlow} />
      <div style={pulseRing} />

      {showHoldIndicator ? (
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
                if (import.meta.env.DEV) {
                  console.warn("[HEADSHOT] failed", headshotSrc);
                }
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
        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: ROW_GAP }}>
          {/* Line 1: Team • Season */}
          <div style={teamLine}>{teamSeason}</div>

          {/* Line 2: First name + Position */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div style={{ ...firstLine, minWidth: 0, flex: 1 }}>{first}</div>
            <div style={posLine}>{pos}</div>
          </div>

          {/* Line 3: Last name + FP label/value */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div style={{ ...lastLine, minWidth: 0, flex: 1 }}>{last}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
              <div style={labelLine}>{showResults ? "FP" : "PROJ"}</div>
              <div
                style={{
                  ...valueLine,
                  transition: isRolling ? "none" : "transform 150ms ease",
                  transform: isRolling ? "scale(1.05)" : "scale(1)",
                }}
              >
                {valueText}
              </div>
            </div>
          </div>

          {/* Line 4: Performance headline — reserved height so layout never shifts */}
          <div
            style={{
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: 0.8,
              color: headline ? headline.color : "transparent",
              textAlign: "center",
              textShadow: headline ? "0 1px 3px rgba(0,0,0,0.5)" : "none",
              opacity: headline ? 1 : 0,
              transition: "opacity 0.25s ease, color 0.2s ease",
              minHeight: "1.1em",
              lineHeight: "1.1",
              animation: headline ? `${headline.anim} 420ms ease both` : "none",
            }}
          >
            {headline ? headline.text : "\u00A0"}
          </div>
        </div>
      </div>
    </div>
  );
}
