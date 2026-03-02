import React, { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { GamePhase, PlayerCard, Position } from "../adapters/types";
import { AthleteCardFront } from "./AthleteCardFront";
import { CardBackGeneric } from "./CardBackGeneric";
import type { ShakeType } from "../hooks/useEmotionalReveal";
import { sportAdapter } from "../adapters/SportAdapter";

// ── CSS ────────────────────────────────────────────────────────────────────

const STYLE_ID = "athlete-card-styles-v5";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .card-inner {
      position: relative; width: 100%; height: 100%;
      transform-style: preserve-3d;
      transition: transform var(--flip-ms, 450ms) cubic-bezier(0.4, 0.0, 0.2, 1);
      will-change: transform;
      background: #0a0c10;
      border-radius: 18px;
    }
    .card-inner.no-transition { transition: none !important; }
    .card-inner.is-flipped { transform: rotateY(180deg); }
    .card-face {
      position: absolute; inset: 0; border-radius: 18px;
      backface-visibility: hidden; -webkit-backface-visibility: hidden;
      overflow: hidden;
    }
    .card-face-back { transform: rotateY(180deg); }

    @keyframes shakeHype {
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
    @keyframes shakeBig {
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
    @keyframes shakeCold {
      0%   { transform: translate(0,0) rotate(0deg); }
      15%  { transform: translate(-6px,0) rotate(-1deg); }
      30%  { transform: translate(5px,0) rotate(1deg); }
      45%  { transform: translate(-4px,0) rotate(-0.7deg); }
      60%  { transform: translate(3px,0) rotate(0.5deg); }
      75%  { transform: translate(-2px,0) rotate(-0.3deg); }
      88%  { transform: translate(1px,0) rotate(0.2deg); }
      100% { transform: translate(0,0) rotate(0deg); }
    }
    .shake-hype { animation: shakeHype 0.6s cubic-bezier(0.36,0.07,0.19,0.97) both; }
    .shake-big  { animation: shakeBig  0.6s cubic-bezier(0.36,0.07,0.19,0.97) both; }
    .shake-cold { animation: shakeCold 0.65s ease-in-out both; }

    @keyframes stampIn {
      0%   { transform: translate(-50%,-50%) scale(2.5) rotate(-8deg); opacity: 0; }
      40%  { transform: translate(-50%,-50%) scale(0.92) rotate(2deg); opacity: 1; }
      60%  { transform: translate(-50%,-50%) scale(1.05) rotate(-1deg); }
      80%  { transform: translate(-50%,-50%) scale(0.98) rotate(0.5deg); }
      100% { transform: translate(-50%,-50%) scale(1) rotate(-3deg); opacity: 1; }
    }
    .card-stamp {
      position: absolute; top: 38%; left: 50%;
      transform: translate(-50%,-50%) scale(1) rotate(-3deg);
      pointer-events: none; z-index: 40;
      animation: stampIn 0.25s cubic-bezier(0.175,0.885,0.32,1.275) forwards;
      white-space: nowrap;
    }
    .card-stamp-persist {
      position: absolute; top: 38%; left: 50%;
      transform: translate(-50%,-50%) scale(1) rotate(-3deg);
      pointer-events: none; z-index: 40;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

// ── Types ──────────────────────────────────────────────────────────────────

type Props = {
  onRollComplete?: () => void;
  badges?: Array<{id:string;icon:string;label:string;fp:number}>;
  isSpotlight?: boolean;
  spotlightLevel?: number;
  isDimmed?: boolean;
  card: PlayerCard;
  phase: GamePhase;
  locked?: boolean;
  onToggleLock?: () => void;
  isLocked?: boolean;
  isMvp?: boolean;
  flipped?: boolean;
  onToggleFlip?: () => void;
  isFlipped?: boolean;
  isRevealing?: boolean;
  canFlip?: boolean;
  visibleFp?: number;
  visibleBadgeCount?: number;
  noTransition?: boolean;
  flipDurationMs?: number;
  fpCountUpMs?: number;
  performanceTag?: any;
  pulse?: any;
  shakeType?: ShakeType | null;
  cardShakeType?: ShakeType | null;
};

type OverlayState = {
  stamp: "CAREER NIGHT" | "ICE COLD" | null;
  stamping: boolean;
};

const overlayMap = new Map<string, OverlayState>();
export function resetAllOverlays() { overlayMap.clear(); }

// ── Stat helpers ───────────────────────────────────────────────────────────

function safeNumber(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function prettifyKey(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim();
}
function getStatValue(sl: Record<string,any>, key: string, variants: string[]) {
  for (const k of [key,...variants]) {
    const v = sl?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
    const camel = k.replace(/_([a-z])/g, (_,c) => c.toUpperCase());
    const vc = sl?.[camel];
    if (vc !== undefined && vc !== null && vc !== "") return vc;
  }
  return undefined;
}
function getPositionStats(pos: string, sl: Record<string,any>) {
  const display = (sportAdapter.config as any).statDisplay ?? {};
  const defs: Array<{key:string;variants:string[];label:string}> =
    display[pos] ?? display['default'] ?? [];
  const result: Array<{key:string;label:string;value:any}> = [];
  for (const def of defs) {
    const v = getStatValue(sl, def.key, def.variants);
    if (v !== undefined) result.push({ key: def.key, label: def.label, value: v });
  }
  return result;
}
function getFallbackStats(sl: Record<string,any>) {
  const SKIP = new Set(["selected","transfers_in","transfers_out","transfers_balance","value","id","element","fixture","round","gameweek","gw","season","season_id","team_h_score","team_a_score","team_h","team_a","was_home","kickoff_time","opponent_team","total_points","in_dreamteam"]);
  const out: Array<{key:string;label:string;value:any}> = [];
  for (const [k,v] of Object.entries(sl||{})) {
    if (SKIP.has(k)) continue;
    const n = safeNumber(v);
    if (n === undefined || n === 0) continue;
    out.push({ key: k, label: prettifyKey(k), value: v });
    if (out.length >= 9) break;
  }
  return out;
}
function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"2-digit" });
}
function round1(n: number) { return Math.round(n * 10) / 10; }

// ── Back face ──────────────────────────────────────────────────────────────

function BackBStats({ card }: { card: PlayerCard }) {
  const gi = (card as any).gameInfo || {};
  const sl = (card as any).statLine || {};
  const posStats      = useMemo(() => getPositionStats(card.position as Position, sl), [card.position, sl]);
  const fallbackStats = useMemo(() => getFallbackStats(sl), [sl]);

  const BASKETBALL_ORDER = ["PTS","REB","AST","BLK","STL","TO"];

// Normalize stat keys to match BASKETBALL_ORDER
const KEY_ALIASES: Record<string, string> = {
  "TURNOVERS": "TO",
  "TOV": "TO",
  "TURNOVER": "TO",
};

const raw = (posStats.length > 0 ? posStats : fallbackStats).map(t => ({
  ...t,
  key: KEY_ALIASES[t.key.toUpperCase()] ?? t.key.toUpperCase(),
}));

const tiles = (() => {
  const byKey = new Map(raw.map(t => [t.key, t]));
  return BASKETBALL_ORDER.map(k => byKey.get(k) ?? { key: k, label: k, value: 0 });
})();
  

  const actual   = safeNumber((card as any).actualFp) ?? 0;
  const rawDate  = gi.date || gi.kickoff_time || sl.kickoff_time || sl.date || "";
  const dateStr  = fmtDate(String(rawDate));
  const rawOpp   = gi.opponent || gi.opponent_team || sl.opponent || sl.opponent_team || "";
  const opponent = String(rawOpp).trim();
  const ha       = gi.homeAway || (sl.was_home === true ? "H" : sl.was_home === false ? "A" : "");
  const oppStr   = opponent ? `${ha === "A" ? "@" : "vs"} ${opponent.toUpperCase()}` : "";
  const badgesData: Array<{icon:string;label:string;fp:number}> = Array.isArray((card as any).achievements) ? (card as any).achievements.filter(Boolean) : [];
  const badgeFpBonus = badgesData.reduce((s, b) => s + (b.fp ?? 0), 0);
  const hasStats = Object.keys(sl).length > 0;

  return (
    <div style={S.backWrap}>
      <div style={S.backTopRow}>
        <div style={S.backDate}>{dateStr||"—"}</div>
        <div style={S.backOpp}>{oppStr||"—"}</div>
      </div>

      {/* FP row — fixed height, badges never push stats down */}
      <div style={{ height: 28, display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap", minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0 }}>
          <span style={S.fpLabel}>FP</span>
          <span style={{ ...S.fpValue, fontSize: 18 }}>{round1(actual)}</span>
          {badgeFpBonus > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#FFD700", alignSelf: "flex-end", marginBottom: 2 }}>
              (+{badgeFpBonus})
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "nowrap", flex: 1, overflow: "hidden" }}>
          {badgesData.slice(0, 6).map((b: any, i: number) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 2, flexShrink: 0,
              background: "rgba(0,0,0,0.55)", borderRadius: 6, padding: "2px 5px",
              border: "1px solid rgba(255,255,255,0.18)",
            }}>
              <span style={{ fontSize: 13, lineHeight: 1 }}>{b.icon}</span>
              <span style={{ fontSize: 7, fontWeight: 700, color: "#FFD700", letterSpacing: 0.3 }}>+{b.fp}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={S.divider}/>
      {!hasStats ? (
        <div style={S.noStatsWrap}><div style={S.noStatsText}>No stats loaded</div></div>
      ) : tiles.length > 0 ? (
        <div style={S.tilesGrid}>
          {tiles.slice(0, 9).map(s => (
            <div key={s.key} style={S.tile}>
              <div style={S.tileLabel}>{s.label}</div>
              <div style={S.tileValue}>{String(s.value)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={S.noStatsWrap}><div style={S.noStatsText}>Stats available</div></div>
      )}
      <div style={S.tapHint}>TAP TO FLIP BACK</div>
    </div>
  );
}

// ── AthleteCard ────────────────────────────────────────────────────────────

export function AthleteCard(props: Props) {
  const locked  = props.locked ?? props.isLocked ?? false;
  const flipped = props.flipped ?? props.isFlipped ?? false;
  const canFlip = props.canFlip ?? false;

  const {
    card, phase, isMvp=false, onToggleFlip,
    isRevealing, visibleFp, visibleBadgeCount,
    noTransition, flipDurationMs, fpCountUpMs,
    performanceTag, pulse, shakeType, cardShakeType, badges,
    isSpotlight, spotlightLevel, isDimmed,
  } = props;

  const id = String((card as any).cardId ?? "");

  // Economy freeze
  const economyRef = useRef<Map<string,{tier:any;salary:any;projectedFp:any;headshotUrl:any}>>(new Map());
  useEffect(() => {
    if (!id) return;
    const m = economyRef.current;
    if (!m.has(id)) {
      m.set(id, { tier:(card as any).tier, salary:(card as any).salary, projectedFp:(card as any).projectedFp, headshotUrl:(card as any).headshotUrl });
    }
  }, [id, card]);

  const stableCard = useMemo(() => {
    if (!id) return card;
    const snap = economyRef.current.get(id);
    if (!snap) return card;
    return {
      ...(card as any),
      tier: snap.tier,
      salary: snap.salary,
      projectedFp: snap.projectedFp,
      headshotUrl: (card as any).headshotUrl,
    } as PlayerCard;
  }, [card, id]);

  // ── Overlay state ──────────────────────────────────────────────────────
  const [overlay, setOverlay] = useState<OverlayState>({ stamp: null, stamping: false });
  const prevFlippedRef = useRef(false);
  const latchedShakeType = useRef<ShakeType>(null);
  const rollCompleteFiredRef = useRef(false);

  // Reset overlay and refs when card identity changes (new hand)
  useEffect(() => {
    setOverlay({ stamp: null, stamping: false });
    latchedShakeType.current = null;
    prevFlippedRef.current = false;
    rollCompleteFiredRef.current = false;
  }, [id]);

  // Latch cardShakeType as soon as it's known during reveal — no spotlight dependency
  useEffect(() => {
    if (!isRevealing) return;
    if (!cardShakeType) return;
    if (!latchedShakeType.current) {
      latchedShakeType.current = cardShakeType;
    }
  }, [cardShakeType, isRevealing]);

  // Clear latch when card unflips (between hands)
  useEffect(() => {
    if (!flipped) {
      prevFlippedRef.current = false;
      if (!cardShakeType && !latchedShakeType.current) {
        overlayMap.delete(id);
        setOverlay({ stamp: null, stamping: false });
      }
    }
  }, [flipped, id, cardShakeType]);

  // Called by AthleteCardFront when FP roll completes
  const handleRollComplete = useCallback(() => {
    const shake = latchedShakeType.current ?? cardShakeType ?? null;

    if (!shake) {
      if (!rollCompleteFiredRef.current) {
        rollCompleteFiredRef.current = true;
        props.onRollComplete?.();
      }
      return;
    }

    const stamp: OverlayState["stamp"] =
      shake === "big" || shake === "hype" ? "CAREER NIGHT" : "ICE COLD";
    const next: OverlayState = { stamp, stamping: true };
    overlayMap.set(id, next);
    setOverlay(next);
  }, [id, cardShakeType]);

  // When stamp animation finishes → fire completion once
  useEffect(() => {
    if (overlay.stamping) {
      const t = window.setTimeout(() => {
        setOverlay(prev => {
          const next = { ...prev, stamping: false };
          overlayMap.set(id, next);
          return next;
        });
      }, 300);
      return () => clearTimeout(t);
    }
    if (overlay.stamp && !overlay.stamping && !rollCompleteFiredRef.current) {
      rollCompleteFiredRef.current = true;
      props.onRollComplete?.();
    }
  }, [overlay.stamping, overlay.stamp, id]);

  // ── Classes ────────────────────────────────────────────────────────────
  const shakeClass =
    shakeType === "big"  ? "shake-big"  :
    shakeType === "hype" ? "shake-hype" :
    shakeType === "cold" ? "shake-cold" : "";

  const innerClass = [
    "card-inner",
    flipped ? "is-flipped" : "",
    noTransition ? "no-transition" : "",
  ].filter(Boolean).join(" ");

  const innerStyle = {
    ["--flip-ms" as any]: `${Math.max(0, flipDurationMs ?? 450)}ms`,
  } as React.CSSProperties;

  const isCareerNight = overlay.stamp === "CAREER NIGHT";
  const stampStyle = {
    fontSize: 13, fontWeight: 900, letterSpacing: 2.5,
    textTransform: "uppercase" as const,
    color:      isCareerNight ? "#FFD700" : "#7DD3FC",
    textShadow: isCareerNight
      ? "0 0 20px rgba(255,215,0,0.8), 0 2px 4px rgba(0,0,0,0.8)"
      : "0 0 20px rgba(125,211,252,0.8), 0 2px 4px rgba(0,0,0,0.8)",
    border:     `2px solid ${isCareerNight ? "#FFD700" : "#7DD3FC"}`,
    borderRadius: 4, padding: "4px 12px",
    background: "rgba(0,0,0,0.60)", backdropFilter: "blur(4px)",
  };

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
        <div className="card-face">
          <AthleteCardFront
            card={{ ...(stableCard as any), headshotUrl: (card as any).headshotUrl }}
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
            performanceTag={performanceTag}
            pulse={pulse}
            fpCountUpMs={fpCountUpMs}
            onRollComplete={handleRollComplete}
            badges={badges}
            stamp={overlay.stamp}
          />
        </div>
        <div className="card-face card-face-back">
          {canFlip ? <BackBStats card={stableCard}/> : <CardBackGeneric/>}
        </div>
      </div>
    </div>
  );
}

export function AthleteCardLegacy(props: Props) {
  return <AthleteCard {...props}/>;
}

// ── Styles ─────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  backWrap:     { height:"100%", padding:"10px 10px 8px", display:"flex", flexDirection:"column", gap:8, background:"linear-gradient(180deg,rgba(11,15,20,0.97),rgba(11,15,20,1.0))", borderRadius:18, overflow:"hidden", boxSizing:"border-box" },
  backTopRow:   { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 },
  backDate:     { fontSize:12, fontWeight:900, color:"rgba(255,255,255,0.90)" },
  backOpp:      { fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.65)", textAlign:"right" },
  backMidRow: { display:"flex", alignItems:"center", gap:8, flexWrap:"nowrap", minWidth:0, height:36, overflow:"hidden" },
  fpLine:       { display:"flex", alignItems:"baseline", gap:8 },
  fpLabel:      { fontSize:11, fontWeight:900, color:"rgba(255,255,255,0.65)" },
  fpValue:      { fontSize:22, fontWeight:900, color:"rgba(255,255,255,0.95)" },
  fpSpacer:     { width:10 },
  fpSubLabel:   { fontSize:10, fontWeight:900, color:"rgba(255,255,255,0.45)" },
  fpSubValue:   { fontSize:14, fontWeight:900, color:"rgba(255,255,255,0.75)" },
  badgesInline: { display:"flex", alignItems:"center", gap:6 },
  badgeIcon:    { fontSize:16, opacity:0.95 },
  divider:      { height:1, background:"rgba(255,255,255,0.08)" },
  tilesGrid: { flex:1, display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:4, alignContent:"start", minWidth:0 },
tile:      { borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", padding:"3px 6px", display:"flex", flexDirection:"column", gap:1, minWidth:0 },
tileLabel: { fontSize:8, fontWeight:900, color:"rgba(255,255,255,0.55)", lineHeight:"10px" },
tileValue: { fontSize:13, fontWeight:900, color:"rgba(255,255,255,0.92)" },
  tapHint:      { fontSize:10, fontWeight:900, color:"rgba(255,255,255,0.30)", letterSpacing:0.4, textAlign:"center" },
  noStatsWrap:  { flex:1, display:"flex", flexDirection:"column", gap:10 },
  noStatsText:  { fontSize:12, fontWeight:900, color:"rgba(255,255,255,0.70)" },
};