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

// ── Football headshot tuning ───────────────────────────────────────────────
// API-Football headshots are studio shots on a white background. Basketball's
// NBA images are transparent-bg, so simple positioning works there but here
// we'd get a "white rectangle pasted on the card" look if we copied that.
//
// The treatment: aggressive scale-up to crop white-bg sides off-frame, plus
// a radial mask that fades the corners (where white still leaks) into the
// tier color underneath, plus top + bottom gradient overlays for clean
// transitions into the card top edge and the nameplate.
//
// All knobs are in one place so we can iterate visually without hunting:
//   Face too SMALL?     → increase HEADSHOT_WIDTH_PCT (e.g. 130 → 140)
//   Face too ZOOMED?    → decrease HEADSHOT_WIDTH_PCT (e.g. 130 → 118)
//   Face too LOW?       → decrease HEADSHOT_OBJECT_Y (e.g. 22 → 14)
//   Face too HIGH?      → increase HEADSHOT_OBJECT_Y (e.g. 22 → 30)
//   White edges still   → shrink the mask: RADIAL_INNER smaller (50 → 40)
//                          OR shrink ellipse: RADIAL_ELLIPSE_W (78 → 70)
//   Too feathered/soft  → loosen mask: RADIAL_INNER larger (50 → 65)
//   Bottom too dark     → reduce BOTTOM_FADE_END (0.78 → 0.55)
//   Top edge harsh      → strengthen TOP_FADE_START (0.30 → 0.45)
const HEADSHOT_WIDTH_PCT = 130;       // image width as % of container
const HEADSHOT_HEIGHT_PCT = 115;      // image height as % of container
const HEADSHOT_LEFT_PCT = -15;        // re-center after scale-up
const HEADSHOT_TOP_PCT = -5;          // small upward nudge
const HEADSHOT_OBJECT_Y = 22;         // object-position Y — face vertical placement within frame
const RADIAL_ELLIPSE_W = 78;          // mask ellipse width %
const RADIAL_ELLIPSE_H = 92;          // mask ellipse height %
const RADIAL_CENTER_Y = 38;           // mask center Y % from top (face area)
const RADIAL_INNER = 52;              // % — fully opaque radius
const TOP_FADE_START = 0.30;          // top overlay alpha at top edge
const BOTTOM_FADE_START = 50;         // % from top — where bottom fade begins
const BOTTOM_FADE_END = 0.78;         // bottom overlay alpha at very bottom

const HEADSHOT_MASK = `radial-gradient(ellipse ${RADIAL_ELLIPSE_W}% ${RADIAL_ELLIPSE_H}% at 50% ${RADIAL_CENTER_Y}%, rgba(0,0,0,1) ${RADIAL_INNER}%, rgba(0,0,0,0) 100%)`;

function FootballHero({ card, initials, isActiveReveal }: CardFrontHeroProps) {
  const team = String((card as any).team ?? "");
  const flag = getFlag(team);
  const opacity = isActiveReveal ? 0.15 : 1;
  const basePlayerId = String((card as any).basePlayerId ?? "");

  // Resolve image URL (no API call — manifest lookup + URL construction).
  // Prefer card.externalIds if the data layer attached them; else fall
  // back to the static manifest. The merge order means a roster card
  // built with externalIds populated wins over the manifest, which is
  // what we want for future per-card overrides.
  const cardExternalIds = (card as any).externalIds;
  const externalIds = cardExternalIds ?? getExternalIds(basePlayerId);
  const resolved = resolvePlayerImage({ sport: "football", playerId: basePlayerId, externalIds });
  const imgSrc = resolved.confidence !== "fallback" ? resolved.src : null;

  // Local state: when an <img> errors, hide it so the flag+initials
  // fallback (rendered conditionally below) becomes visible.
  const [imgFailed, setImgFailed] = React.useState(false);
  const showImage = imgSrc != null && !imgFailed;

  return (
    <>
      {/* Layer 1: Faded flag silhouette — always rendered as the deepest
          fallback so the card never appears empty during slow loads. */}
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
        <div style={{ fontSize: 72, lineHeight: 1, opacity: 0.18, transform: "scale(1.4) translateY(-8px)", filter: "blur(2px)", userSelect: "none" }}>
          {flag}
        </div>
      </div>

      {/* Layer 2: Flag + initials — only when no headshot is shown. We
          render this conditionally (not always-on underneath) so it
          doesn't fight the headshot's mask edges with text strokes that
          would peek through. Unmanifested players see this directly;
          manifested players see only the headshot. */}
      {!showImage && (
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
      )}

      {/* Layer 3: API-Football headshot — scaled, masked, color-tuned.
          objectPosition keeps the face in the upper-mid of the frame
          regardless of how the original photo was framed. The radial
          mask softens the corners where the studio white-bg leaks in. */}
      {showImage && (
        <img
          key={imgSrc}
          src={imgSrc!}
          alt={String((card as any).name ?? "")}
          onError={() => setImgFailed(true)}
          draggable={false}
          style={{
            position: "absolute",
            top: `${HEADSHOT_TOP_PCT}%`,
            left: `${HEADSHOT_LEFT_PCT}%`,
            width: `${HEADSHOT_WIDTH_PCT}%`,
            height: `${HEADSHOT_HEIGHT_PCT}%`,
            objectFit: "cover",
            objectPosition: `50% ${HEADSHOT_OBJECT_Y}%`,
            maskImage: HEADSHOT_MASK,
            WebkitMaskImage: HEADSHOT_MASK,
            filter: "contrast(1.06) saturate(1.06)",
            opacity, transition: "opacity 0.3s ease",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Layer 4: Top fade — only present when an image is shown. Smooths
          the photo into the tier-color background at the top edge. */}
      {showImage && (
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "30%",
            pointerEvents: "none",
            background: `linear-gradient(to bottom, rgba(0,0,0,${TOP_FADE_START}) 0%, rgba(0,0,0,0) 100%)`,
          }}
        />
      )}

      {/* Layer 5: Bottom fade — always rendered, regardless of whether
          the image is showing. Smooths into the nameplate area below. */}
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `linear-gradient(to bottom, rgba(0,0,0,0) ${BOTTOM_FADE_START}%, rgba(0,0,0,${BOTTOM_FADE_END}) 100%)`,
        }}
      />
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