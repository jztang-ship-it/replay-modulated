/**
 * football/src/components/SoccerCard.tsx
 * Thin wrapper around PlayerCardShell + shared CardFront.
 *
 * renderFront → shared CardFront with FootballHero (flag emoji + initials)
 * renderBack  → BackStats (football position stats)
 */

import React, { useMemo } from "react";
import type { GamePhase, PlayerCard as PlayerCardType } from "../adapters/types";
import { PlayerCardShell, resetAllOverlays } from "@shared/components/PlayerCardShell";
import type { CardFrontProps as ShellFrontProps, CardBackProps } from "@shared/components/PlayerCardShell";
import { CardFront, type CardFrontHeroProps } from "@shared/components/CardFront";
import { sportAdapter } from "../adapters/SportAdapter";
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

// ── Football hero: API-Football image (when available) → flag + initials ──
// Resolution flow:
//   1. Look up player's externalIds in the manifest
//   2. If apiFootballId is known: resolve to API-Football CDN URL
//   3. Render <img>; on load failure, swap to flag+initials fallback
//   4. If no externalIds: render flag+initials directly (no failed network)
//
// The flag+initials fallback is always rendered behind the image as a
// safety net, so a slow or failed image load never leaves the card empty.

import { resolvePlayerImage } from "@shared/media/playerImages";
import { getExternalIds } from "../data/playerImageManifest";
import { getPortraitAdjustment } from "../data/playerPortraitAdjustments";

// ── Football headshot tuning ───────────────────────────────────────────────
// API-Football headshots are studio shots on a white background. The
// preprocessing script (football/scripts/processPlayerHeadshots.mjs)
// alpha-cuts that white background into transparency so the card's tier
// color shows through behind the player. With a real alpha channel in the
// PNG, we don't need any CSS tricks — no mask, no blend mode, no filter.
//
// Defaults are tuned to lock all football cards to a single visual scale
// and vertical face position. Mbappé's framing is the reference target —
// his source crop is roughly average for the API-Football set, so values
// that read well on his card read well across most of the squad. Width
// is dropped from basketball's 110 to 108 (slight head shrink) and the
// object-position Y is bumped from 10 to 14 so eyes land in the same
// upper-third zone for sources that include shoulders. The football photo
// stock IS more variable than the NBA stock, so per-player overrides in
// football/src/data/playerPortraitAdjustments.ts still exist as exceptions
// for sources that physically can't conform to the standard (e.g. tight
// face-only crops where the head touches both top and bottom of the source).
//
// CSS values that control face crop:
//   HEADSHOT_TOP_PCT        top offset of the <img> within the hero
//   HEADSHOT_LEFT_PCT       left offset of the <img>
//   HEADSHOT_WIDTH_PCT      width as % of hero container (face zoom)
//   HEADSHOT_HEIGHT_PCT     height as % of hero container
//   HEADSHOT_OBJECT_X       object-position X within the cropped image
//   HEADSHOT_OBJECT_Y       object-position Y (face vertical placement;
//                           smaller = higher)
//
// Tweak quick-reference (defaults below — applied to ALL football cards):
//   Heads too SMALL across the board  → bump HEADSHOT_WIDTH_PCT (108 → 116)
//   Heads too BIG across the board    → drop HEADSHOT_WIDTH_PCT (108 → 102)
//   Faces sit too LOW everywhere      → drop HEADSHOT_OBJECT_Y (14 → 10)
//   Faces sit too HIGH everywhere     → bump HEADSHOT_OBJECT_Y (14 → 18)
//
// For ONE-OFF fixes on a specific player, use playerPortraitAdjustments.ts
// rather than retuning the global defaults.

const HEADSHOT_TOP_PCT = 12;       // matches basketball (12)
const HEADSHOT_LEFT_PCT = -5;      // matches basketball (-5)
const HEADSHOT_WIDTH_PCT = 108;    // Mbappé reference (was 110 / basketball)
const HEADSHOT_HEIGHT_PCT = 98;    // Mbappé reference (was 100 / basketball)
const HEADSHOT_OBJECT_X = 50;      // 50 = horizontal center (matches basketball)
const HEADSHOT_OBJECT_Y = 14;      // Mbappé reference (was 10 / basketball)

// Debug overlay: enabled at runtime via either
//   ?debugFootballImages=1   (URL query param)
//   import.meta.env.VITE_DEBUG_FOOTBALL_IMAGES=true
// When on, each card overlays its resolved image source/scale so the
// values can be tuned without console-logging.
function isDebugFootballImagesEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debugFootballImages") === "1") return true;
  } catch { /* no-op */ }
  // @ts-ignore — Vite env access is fine at runtime.
  const envFlag = (import.meta as any)?.env?.VITE_DEBUG_FOOTBALL_IMAGES;
  return envFlag === "true" || envFlag === true;
}

function FootballHero({ card, initials, isActiveReveal }: CardFrontHeroProps) {
  const team = String((card as any).team ?? "");
  const flag = getFlag(team);
  const opacity = isActiveReveal ? 0.15 : 1;
  const basePlayerId = String((card as any).basePlayerId ?? "");
  const playerName = String((card as any).name ?? "");

  // Resolve image URL (no API call — manifest lookup + URL construction).
  // Resolution order: processed (alpha-cut) → raw local mirror → API CDN
  // → null (no image, render flag + initials fallback).
  const cardExternalIds = (card as any).externalIds;
  const externalIds = cardExternalIds ?? getExternalIds(basePlayerId);
  const resolved = resolvePlayerImage({ sport: "football", playerId: basePlayerId, externalIds });
  const imgSrc = resolved.confidence !== "fallback" ? resolved.src : null;

  // Per-player overrides (if any). Most players hit the default branch.
  const adj = getPortraitAdjustment(basePlayerId);
  const scale = adj.scale ?? 1;
  const widthPct = HEADSHOT_WIDTH_PCT * scale;
  const heightPct = HEADSHOT_HEIGHT_PCT * scale;
  // Re-center after scaling so a wider/taller image stays anchored at
  // the same nominal top-center spot the default would have used.
  const widthDelta = widthPct - HEADSHOT_WIDTH_PCT;
  const heightDelta = heightPct - HEADSHOT_HEIGHT_PCT;
  const leftPct = HEADSHOT_LEFT_PCT - widthDelta / 2 + (adj.translateXPct ?? 0);
  const topPct = HEADSHOT_TOP_PCT - heightDelta / 2 + (adj.translateYPct ?? 0);
  const objectX = adj.objectPositionX ?? HEADSHOT_OBJECT_X;
  const objectY = adj.objectPositionY ?? HEADSHOT_OBJECT_Y;

  // Local state: when an <img> errors (network failure, 404), hide it so
  // the flag + initials fallback below becomes visible.
  const [imgFailed, setImgFailed] = React.useState(false);
  const showImage = imgSrc != null && !imgFailed;
  const debug = isDebugFootballImagesEnabled();

  // Bare-minimum render — exactly the shape basketball uses on its
  // NBA headshots. The processed PNG has a real alpha channel; the
  // card's tier-color gradient (rendered by CardFront below us) shows
  // through behind the player naturally. No extra layers, no fades,
  // no silhouettes — every additional element introduced visible
  // banding/lines through the alpha edges.
  if (showImage) {
    return (
      <>
        <img
          key={imgSrc}
          src={imgSrc!}
          alt={playerName}
          onError={() => setImgFailed(true)}
          draggable={false}
          style={{
            position: "absolute",
            top: `${topPct}%`,
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            height: `${heightPct}%`,
            objectFit: "cover",
            objectPosition: `${objectX}% ${objectY}%`,
            // transform-origin keeps the head anchored near the top of the
            // hero box when scale != 1 — the head doesn't drift down as the
            // image grows. Combined with the topPct re-center math above,
            // this matches basketball's stable head anchor across all cards.
            transformOrigin: "top center",
            // Explicit image-rendering to ensure browsers use the default
            // (high-quality) sampler. Defending against any inherited
            // pixelated/crisp-edges rule that might creep in via global CSS.
            imageRendering: "auto",
            opacity, transition: "opacity 0.3s ease",
            pointerEvents: "none",
          }}
        />
        {debug && (
          <DebugBadge
            name={playerName}
            sourceLabel={debugSourceLabel(resolved.source)}
            scale={scale}
            objectX={objectX}
            objectY={objectY}
          />
        )}
      </>
    );
  }

  // Fallback only — when no image resolves (unmanifested players,
  // network failures). Self-contained: a flag emoji + initials,
  // centered. No interaction with the image path.
  return (
    <>
      <div
        style={{
          position: "absolute", top: "28%", left: 0, right: 0,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          opacity, transition: "opacity 0.3s ease",
          pointerEvents: "none",
        }}
      >
        <span style={{ fontSize: 38, lineHeight: 1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.6))" }}>{flag}</span>
        <span style={{ fontSize: 28, fontWeight: 950, letterSpacing: 2, color: "rgba(255,255,255,0.80)", textShadow: "0 4px 16px rgba(0,0,0,0.8)", userSelect: "none" }}>{initials}</span>
      </div>
      {debug && (
        <DebugBadge
          name={playerName}
          sourceLabel={imgFailed ? "fallback (img-err)" : debugSourceLabel(resolved.source)}
          scale={scale}
          objectX={objectX}
          objectY={objectY}
        />
      )}
    </>
  );
}

// ── Debug overlay ──────────────────────────────────────────────────────────
// Tiny corner ribbon shown when ?debugFootballImages=1 is set or the
// VITE_DEBUG_FOOTBALL_IMAGES env var is true. Surfaces the four tuning
// knobs (image source, scale, objectPosition X/Y) directly on the card
// so the user can see at a glance which override was applied. Sits under
// the salary/position labels (z-index 7) so it never covers card chrome.
function DebugBadge(props: {
  name: string;
  sourceLabel: string;
  scale: number;
  objectX: number;
  objectY: number;
}) {
  const { name, sourceLabel, scale, objectX, objectY } = props;
  return (
    <div
      style={{
        position: "absolute",
        bottom: "30%",
        left: 4,
        right: 4,
        zIndex: 7,
        pointerEvents: "none",
        background: "rgba(0,0,0,0.78)",
        color: "#FFEA86",
        fontSize: 7,
        lineHeight: 1.25,
        fontWeight: 700,
        fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
        padding: "2px 4px",
        borderRadius: 3,
        letterSpacing: 0.2,
        textAlign: "left",
        wordBreak: "break-all",
      }}
    >
      <div style={{ color: "#FFFFFF" }}>{name}</div>
      <div>src: {sourceLabel}</div>
      <div>scale: {scale.toFixed(2)} · obj: {objectX}%/{objectY}%</div>
    </div>
  );
}

function debugSourceLabel(source: string): string {
  switch (source) {
    case "local-cache-processed": return "processed";
    case "local-cache":            return "local";
    case "api-football":           return "api-cdn";
    case "thesportsdb":            return "thesportsdb";
    default:                       return "fallback";
  }
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
  // PR 2 stat → FP attribution: each tile shows the count *and* its FP
  // contribution so users can see why they earned each point. Soccer stats
  // are less self-evident than basketball ("Goals 1" doesn't translate to
  // a number the way "PTS 40" does), so the math layer is mandatory.
  const fpBreakdown = useMemo(() => {
    if (!hasStats) return {} as Record<string, number>;
    return sportAdapter.computeFantasyPointsDetailed({ ...sl, _position: card.position }).breakdown;
  }, [card.position, sl, hasStats]);
  function fmtFp(n: number): string {
    if (!Number.isFinite(n) || n === 0) return "";
    const r = Math.round(n * 10) / 10;
    return (r > 0 ? "+" : "") + (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1));
  }

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
          {tiles.map(s => {
            const fpContrib = fpBreakdown[s.key] ?? 0;
            const fpLabel = fmtFp(fpContrib);
            const fpColor = fpContrib > 0 ? "#FFD700" : fpContrib < 0 ? "#FF6B6B" : "rgba(255,255,255,0.30)";
            return (
              <div key={s.key} style={{ borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", padding:"3px 6px", display:"flex", flexDirection:"column", gap:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:4 }}>
                  <div style={{ fontSize:8, fontWeight:900, color:"rgba(255,255,255,0.55)", lineHeight:"10px" }}>{s.label}</div>
                  {fpLabel && <div style={{ fontSize:7, fontWeight:800, color:fpColor, lineHeight:"10px" }}>{fpLabel}</div>}
                </div>
                <div style={{ fontSize:13, fontWeight:900, color:"rgba(255,255,255,0.92)" }}>{String(s.value)}</div>
              </div>
            );
          })}
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

export function SoccerCard(props: Props) {
  return (
    <PlayerCardShell
      {...props}
      renderFront={(p: ShellFrontProps) => (
        <CardFront
          {...p}
          displayPosition={sportAdapter.displayPosition((p.card as any)?.position)}
          renderHero={(heroProps: CardFrontHeroProps) => <FootballHero {...heroProps} />}
        />
      )}
      renderBack={(p: CardBackProps) => <BackStats {...p} />}
    />
  );
}