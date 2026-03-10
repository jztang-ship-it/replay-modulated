/**
 * worldcup/src/components/PlayerCard.tsx
 * Thin wrapper around PlayerCardShell + shared CardFront.
 *
 * renderFront → shared CardFront with WorldcupHero (flag emoji + initials)
 * renderBack  → BackStats (football position stats)
 */

import React, { useMemo } from "react";
import type { GamePhase, PlayerCard as PlayerCardType } from "../adapters/types";
import { PlayerCardShell, resetAllOverlays } from "@shared/components/PlayerCardShell";
import type { CardFrontProps as ShellFrontProps, CardBackProps } from "@shared/components/PlayerCardShell";
import { CardFront, type CardFrontHeroProps } from "@shared/components/CardFront";
import type { ShakeType } from "../hooks/useEmotionalReveal";

export { resetAllOverlays };

// ── Country flags ──────────────────────────────────────────────────────────

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

// ── Worldcup hero: flag + initials ─────────────────────────────────────────

function WorldcupHero({ card, initials, isActiveReveal }: CardFrontHeroProps) {
  const team = String((card as any).team ?? "");
  const flag = getFlag(team);
  const opacity = isActiveReveal ? 0.15 : 1;

  return (
    <>
      {/* Faded flag background */}
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div style={{ fontSize: 72, lineHeight: 1, opacity: 0.22, transform: "scale(1.4) translateY(-8px)", filter: "blur(1px)", userSelect: "none" }}>
          {flag}
        </div>
      </div>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.65) 100%)" }} />
      {/* Flag + initials centered */}
      <div style={{ position: "absolute", top: "28%", left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity, transition: "opacity 0.3s ease" }}>
        <span style={{ fontSize: 38, lineHeight: 1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.6))" }}>{flag}</span>
        <span style={{ fontSize: 28, fontWeight: 950, letterSpacing: 2, color: "rgba(255,255,255,0.80)", textShadow: "0 4px 16px rgba(0,0,0,0.8)", userSelect: "none" }}>{initials}</span>
      </div>
    </>
  );
}

// ── BackStats ──────────────────────────────────────────────────────────────

const POSITION_STAT_ORDER: Record<string, string[]> = {
  GK:      ["saves","goals_conceded","clearances","blocked_shots","pressures"],
  DEF:     ["tackles","interceptions","clearances","blocked_shots","dribbles_completed"],
  MID:     ["key_passes","tackles","interceptions","dribbles_completed","pressures"],
  FWD:     ["goals","assists","shots_on_target","key_passes","dribbles_completed"],
  default: ["goals","assists","key_passes","tackles","saves"],
};
const STAT_LABELS: Record<string, string> = {
  goals:"GOALS",assists:"ASSISTS",shots_on_target:"SOT",key_passes:"KEY PASS",
  tackles:"TACKLES",interceptions:"INT",clearances:"CLEAR",blocked_shots:"BLOCKS",
  pressures:"PRESS",saves:"SAVES",goals_conceded:"GA",yellow_cards:"YC",
  red_cards:"RC",dribbles_completed:"DRIB",
};
function getFootballStats(pos: string, statLine: Record<string,any>) {
  const order = POSITION_STAT_ORDER[pos] ?? POSITION_STAT_ORDER.default;
  const result: Array<{key:string;label:string;value:any}> = [];
  for (const key of order) {
    const v = statLine?.[key];
    if (v !== undefined && v !== null) result.push({ key, label: STAT_LABELS[key] ?? key.toUpperCase(), value: v });
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

function round1(n: number) { return Math.round(n * 10) / 10; }

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"2-digit" });
}

function BackStats({ card }: CardBackProps) {
  const gi = (card as any).gameInfo || {};
  const sl = (card as any).statLine || {};
  const actual      = Number((card as any).actualFp ?? 0);
  const rawDate     = gi.date || gi.kickoff_time || sl.kickoff_time || sl.date || "";
  const dateStr     = fmtDate(String(rawDate));
  const rawOpp      = gi.opponent || gi.opponent_team || "";
  const opponent    = String(rawOpp).trim();
  const ha          = gi.homeAway || (sl.was_home === true ? "H" : sl.was_home === false ? "A" : "");
  const oppStr      = opponent ? `${ha === "A" ? "@" : "vs"} ${opponent.toUpperCase()}` : "";
  const badgesData: Array<{icon:string;label:string;fp:number}> = Array.isArray((card as any).achievements) ? (card as any).achievements.filter(Boolean) : [];
  const badgeFpBonus = badgesData.reduce((s, b) => s + (b.fp ?? 0), 0);
  const tiles       = useMemo(() => getFootballStats(card.position as string, sl), [card.position, sl]);
  const hasStats    = Object.keys(sl).length > 0;

  return (
    <div style={{ height:"100%", padding:"10px 10px 8px", display:"flex", flexDirection:"column", gap:8, background:"linear-gradient(180deg,rgba(11,15,20,0.97),rgba(11,15,20,1.0))", borderRadius:18, overflow:"hidden", boxSizing:"border-box" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
        <div style={{ fontSize:12, fontWeight:900, color:"rgba(255,255,255,0.90)" }}>{dateStr||"—"}</div>
        <div style={{ fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.65)", textAlign:"right" }}>{oppStr||"—"}</div>
      </div>
      <div style={{ height:28, display:"flex", alignItems:"center", gap:8, flexWrap:"nowrap", minWidth:0, overflow:"hidden" }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:4, flexShrink:0 }}>
          <span style={{ fontSize:11, fontWeight:900, color:"rgba(255,255,255,0.65)" }}>FP</span>
          <span style={{ fontSize:18, fontWeight:900, color:"rgba(255,255,255,0.95)" }}>{round1(actual)}</span>
          {badgeFpBonus > 0 && <span style={{ fontSize:10, fontWeight:700, color:"#FFD700", alignSelf:"flex-end", marginBottom:2 }}>(+{badgeFpBonus})</span>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:3, flexWrap:"nowrap", flex:1, overflow:"hidden" }}>
          {badgesData.slice(0,5).map((b:any, i:number) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:2, flexShrink:0, background:"rgba(0,0,0,0.55)", borderRadius:6, padding:"2px 5px", border:"1px solid rgba(255,255,255,0.18)" }}>
              <span style={{ fontSize:13, lineHeight:1 }}>{b.icon}</span>
              <span style={{ fontSize:7, fontWeight:700, color:"#FFD700", letterSpacing:0.3 }}>+{b.fp}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height:1, background:"rgba(255,255,255,0.08)" }} />
      {!hasStats ? (
        <div style={{ flex:1, display:"flex", alignItems:"center" }}><div style={{ fontSize:12, fontWeight:900, color:"rgba(255,255,255,0.70)" }}>No stats loaded</div></div>
      ) : tiles.length > 0 ? (
        <div style={{ flex:1, display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:4, alignContent:"start", minWidth:0 }}>
          {tiles.map(s => (
            <div key={s.key} style={{ borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", padding:"3px 6px", display:"flex", flexDirection:"column", gap:1, minWidth:0 }}>
              <div style={{ fontSize:8, fontWeight:900, color:"rgba(255,255,255,0.55)", lineHeight:"10px" }}>{s.label}</div>
              <div style={{ fontSize:13, fontWeight:900, color:"rgba(255,255,255,0.92)" }}>{String(s.value)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex:1, display:"flex", alignItems:"center" }}><div style={{ fontSize:12, fontWeight:900, color:"rgba(255,255,255,0.70)" }}>Stats available</div></div>
      )}
      <div style={{ fontSize:10, fontWeight:900, color:"rgba(255,255,255,0.30)", letterSpacing:0.4, textAlign:"center" }}>TAP TO FLIP BACK</div>
    </div>
  );
}

// ── Public component ────────────────────────────────────────────────────────

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
  pulse?: any;
  shakeType?: ShakeType | null;
  cardShakeType?: ShakeType | null;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
  isSpotlight?: boolean;
  spotlightLevel?: number;
  isDimmed?: boolean;
  onRollComplete?: () => void;
};

export function PlayerCard(props: Props) {
  return (
    <PlayerCardShell
      {...props}
      renderFront={(p: ShellFrontProps) => (
        <CardFront
          {...p}
          renderHero={(heroProps: CardFrontHeroProps) => <WorldcupHero {...heroProps} />}
        />
      )}
      renderBack={(p: CardBackProps) => <BackStats {...p} />}
    />
  );
}