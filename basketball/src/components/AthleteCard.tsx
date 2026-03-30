/**
 * basketball/src/components/AthleteCard.tsx
 * Thin wrapper around PlayerCardShell + shared CardFront.
 *
 * renderFront → shared CardFront with BasketballHero (headshot photo)
 * renderBack  → BackBStats (basketball stat tiles)
 */

import React, { useMemo } from "react";
import type { GamePhase, PlayerCard, Position } from "../adapters/types";
import { PlayerCardShell, resetAllOverlays } from "@shared/components/PlayerCardShell";
import type { CardFrontProps as ShellFrontProps, CardBackProps } from "@shared/components/PlayerCardShell";
import { CardFront, type CardFrontHeroProps } from "@shared/components/CardFront";
import type { ShakeType } from "../hooks/useEmotionalReveal";
import { sportAdapter } from "../adapters/SportAdapter";


export { resetAllOverlays };

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
    display[pos] ?? display["default"] ?? [];
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

const BASKETBALL_ORDER = ["PTS","REB","AST","BLK","STL","TO"];
const KEY_ALIASES: Record<string, string> = { "TURNOVERS":"TO","TOV":"TO","TURNOVER":"TO" };

// ── BasketballHero ────────────────────────────────────────────────────────

function BasketballHero({ card, initials, isActiveReveal }: CardFrontHeroProps) {
  const [imgReady, setImgReady] = React.useState(false);
  const headshotSrc = (() => {
    const base = String((card as any)?.basePlayerId ?? "").trim();
    return base ? `/headshots/${base}.png` : "";
  })();
  return (
    <>
      {/* Initials always rendered as fallback — visible when image hasn't loaded yet */}
      <div style={{ position:"absolute", inset:0, display:"grid", placeItems:"center", fontSize:32, fontWeight:950, color:"rgba(255,255,255,0.50)", userSelect:"none" }}>
        {initials}
      </div>
      {headshotSrc && (
        <img
          key={headshotSrc}
          src={headshotSrc}
          alt={String((card as any)?.name ?? "")}
          style={{ position:"absolute", top:"12%", left:"-5%", width:"110%", height:"100%", objectFit:"cover", objectPosition:"50% 10%", opacity:imgReady?1:0, transition:"opacity 0.3s ease" }}
          draggable={false}
          onLoad={() => setImgReady(true)}
          onError={() => setImgReady(false)}
        />
      )}
    </>
  );
}

// ── BackBStats ─────────────────────────────────────────────────────────────

function BackBStats({ card }: { card: PlayerCard }) {
  const gi = (card as any).gameInfo || {};
  const sl = (card as any).statLine || {};
  const posStats      = useMemo(() => getPositionStats(card.position as Position, sl), [card.position, sl]);
  const fallbackStats = useMemo(() => getFallbackStats(sl), [sl]);

  const raw = (posStats.length > 0 ? posStats : fallbackStats).map(t => ({
    ...t,
    key: KEY_ALIASES[t.key.toUpperCase()] ?? t.key.toUpperCase(),
  }));
  const tiles = (() => {
    const byKey = new Map(raw.map(t => [t.key, t]));
    return BASKETBALL_ORDER.map(k => byKey.get(k) ?? { key: k, label: k, value: 0 });
  })();

  const actual       = safeNumber((card as any).actualFp) ?? 0;
  const rawDate      = gi.date || gi.kickoff_time || sl.kickoff_time || sl.date || "";
  const dateStr      = fmtDate(String(rawDate));
  const rawOpp       = gi.opponent || gi.opponent_team || sl.opponent || sl.opponent_team || "";
  const opponent     = String(rawOpp).trim();
  const ha           = gi.homeAway || (sl.was_home === true ? "H" : sl.was_home === false ? "A" : "");
  const oppStr       = opponent ? `${ha === "A" ? "@" : "vs"} ${opponent.toUpperCase()}` : "";
  const badgesData: Array<{icon:string;label:string;fp:number}> = Array.isArray((card as any).achievements) ? (card as any).achievements.filter(Boolean) : [];
  const badgeFpBonus = badgesData.reduce((s, b) => s + (b.fp ?? 0), 0);
  const hasStats     = Object.keys(sl).length > 0;
  const allZero      = tiles.every(t => Number(t.value) === 0);

  return (
    <div style={S.backWrap}>
      <div style={S.backTopRow}>
        <div style={S.backDate}>{dateStr||"—"}</div>
        <div style={S.backOpp}>{oppStr||"—"}</div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap", minWidth:0, minHeight:24 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:4, flexShrink:0 }}>
          <span style={S.fpLabel}>FP</span>
          <span style={{ ...S.fpValue, fontSize:18 }}>{round1(actual)}</span>
          {badgeFpBonus > 0 && (
            <span style={{ fontSize:10, fontWeight:700, color:"#FFD700", alignSelf:"flex-end", marginBottom:2 }}>(+{badgeFpBonus})</span>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:2, flex:1, flexWrap:"wrap" }}>
          {badgesData.slice(0,6).map((b:any, i:number) => (
            <span key={b.id ?? b.label ?? i} style={{ fontSize:11, lineHeight:1, flexShrink:0 }}>{b.icon}</span>
          ))}
        </div>
      </div>
      <div style={S.divider}/>
      {!hasStats || allZero ? (
        <div style={S.noStatsWrap}><div style={S.noStatsText}>No game log</div></div>
      ) : tiles.length > 0 ? (
        <div style={S.tilesGrid}>
          {tiles.slice(0,9).map(s => (
            <div key={s.key} style={S.tile}>
              <div style={S.tileLabel}>{s.label}</div>
              <div style={S.tileValue}>{String(s.value)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={S.noStatsWrap}><div style={S.noStatsText}>No game log</div></div>
      )}
      <div style={S.tapHint}>TAP TO FLIP BACK</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backWrap:    { height:"100%", padding:"10px 10px 8px", display:"flex", flexDirection:"column", gap:8, background:"linear-gradient(180deg,rgba(11,15,20,0.97),rgba(11,15,20,1.0))", borderRadius:18, overflow:"hidden", boxSizing:"border-box" },
  backTopRow:  { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 },
  backDate:    { fontSize:12, fontWeight:900, color:"rgba(255,255,255,0.90)" },
  backOpp:     { fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.65)", textAlign:"right" },
  fpLabel:     { fontSize:11, fontWeight:900, color:"rgba(255,255,255,0.65)" },
  fpValue:     { fontSize:22, fontWeight:900, color:"rgba(255,255,255,0.95)" },
  divider:     { height:1, background:"rgba(255,255,255,0.08)" },
  tilesGrid:   { flex:1, display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:4, alignContent:"start", minWidth:0 },
  tile:        { borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", padding:"3px 6px", display:"flex", flexDirection:"column", gap:1, minWidth:0 },
  tileLabel:   { fontSize:8, fontWeight:900, color:"rgba(255,255,255,0.55)", lineHeight:"10px" },
  tileValue:   { fontSize:13, fontWeight:900, color:"rgba(255,255,255,0.92)" },
  tapHint:     { fontSize:10, fontWeight:900, color:"rgba(255,255,255,0.30)", letterSpacing:0.4, textAlign:"center" },
  noStatsWrap: { flex:1, display:"flex", flexDirection:"column", gap:10 },
  noStatsText: { fontSize:12, fontWeight:900, color:"rgba(255,255,255,0.70)" },
};

// ── Public component ───────────────────────────────────────────────────────

type Props = {
  card: PlayerCard;
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
  pulse?: any;
  shakeType?: ShakeType | null;
  cardShakeType?: ShakeType | null;
  badges?: Array<{id:string;icon:string;label:string;fp:number}>;
  isSpotlight?: boolean;
  spotlightLevel?: number;
  isDimmed?: boolean;
  onRollComplete?: () => void;
  heldFpVisible?: boolean;
  isTapTarget?: boolean;
  glowActive?: boolean;
  glowTier?: string;
  glowDurationMs?: number;
};

export function AthleteCard(props: Props) {
  const {
    glowActive,
    glowTier,
    glowDurationMs,
    ...rest
  } = props;
  return (
    <PlayerCardShell
      {...rest}
      glowActive={glowActive}
      glowTier={glowTier}
      glowDurationMs={glowDurationMs}
      renderFront={(p: ShellFrontProps) => (
        <CardFront
          {...p}
          renderHero={(heroProps: CardFrontHeroProps) => (
            <BasketballHero {...heroProps} />
          )}
        />
      )}
      renderBack={(p: CardBackProps) => <BackBStats card={p.card} />}
    />
  );
}

export function AthleteCardLegacy(props: Props) {
  return <AthleteCard {...props} />;
}