/**
 * football/src/components/SoccerCard.tsx — sport-specific shim.
 *
 * Renders the shared <CardFace> with football slot functions:
 *   - getHero            → API-Football processed PNG with per-player portrait
 *                          adjustments; falls back to flag + initials
 *   - getDisplayPosition → sportAdapter.displayPosition(pos)
 *   - renderBack         → football pill-badge back (emoji + "+N" per badge)
 *
 * NOTE: the dev debug overlay (?debugFootballImages=1) that appeared in the
 * old FootballHero is not yet ported; add it as a follow-up if needed.
 */

import React, { useMemo } from "react";
import type { GamePhase, PlayerCard as PlayerCardType } from "../adapters/types";
import { CardFace, type CardFaceSlots } from "@shared/components/CardFace";
import type { CardFaceProps } from "@shared/components/CardFace";
import type { HeroSlot } from "@shared/components/CardHero";
import { resetAllOverlays } from "@shared/components/PlayerCardShell";
import { sportAdapter } from "../adapters/SportAdapter";
import { resolvePlayerImage } from "@shared/media/playerImages";
import { getExternalIds } from "../data/playerImageManifest";
import { getPortraitAdjustment } from "../data/playerPortraitAdjustments";
import type { TopGameTier } from "@shared/commentary/types";
import type { ShakeType } from "../hooks/useEmotionalReveal";
import type { PlayerCard } from "@shared/types";

export { resetAllOverlays };

// ── CardHero defaults (must match shared/components/CardHero.tsx) ──────────
// Per-player adjustments are relative to these. If CardHero's defaults ever
// change, update these too so football's scale/translate math stays correct.
const BASE_TOP = 12;
const BASE_LEFT = -5;
const BASE_WIDTH = 110;
const BASE_HEIGHT = 100;
const BASE_OBJECT_X = 50;
const BASE_OBJECT_Y = 10;

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

// ── Hero builder ───────────────────────────────────────────────────────────

function buildHero(card: PlayerCard): HeroSlot {
  const basePlayerId = String((card as any).basePlayerId ?? "");
  const name = String((card as any).name ?? "");
  const team = String((card as any).team ?? "");
  const flag = getFlag(team);
  const initials = name.split(" ").map((n: string) => n[0] ?? "").join("").slice(0, 2).toUpperCase();

  const externalIds = (card as any).externalIds ?? getExternalIds(basePlayerId);
  const resolved = resolvePlayerImage({ sport: "football", playerId: basePlayerId, externalIds });
  const imageUrl = resolved.confidence !== "fallback" ? resolved.src : null;

  // Per-player portrait adjustments. Most players hit no adjustment (identity).
  const adj = getPortraitAdjustment(basePlayerId);
  let imageStyle: HeroSlot["imageStyle"];
  if (adj.scale || adj.translateXPct || adj.translateYPct || adj.objectPositionX || adj.objectPositionY) {
    const scale = adj.scale ?? 1;
    const widthPct = BASE_WIDTH * scale;
    const heightPct = BASE_HEIGHT * scale;
    // Re-center after scaling so the face anchor point stays consistent.
    const widthDelta = widthPct - BASE_WIDTH;
    const heightDelta = heightPct - BASE_HEIGHT;
    imageStyle = {
      top: `${BASE_TOP - heightDelta / 2 + (adj.translateYPct ?? 0)}%`,
      left: `${BASE_LEFT - widthDelta / 2 + (adj.translateXPct ?? 0)}%`,
      width: `${widthPct}%`,
      height: `${heightPct}%`,
      objectPosition: `${adj.objectPositionX ?? BASE_OBJECT_X}% ${adj.objectPositionY ?? BASE_OBJECT_Y}%`,
    };
  }

  const fallback = (
    <div
      style={{
        position: "absolute", top: "28%", left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        pointerEvents: "none",
      }}
    >
      <span style={{ fontSize: 38, lineHeight: 1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.6))" }}>{flag}</span>
      <span style={{ fontSize: 28, fontWeight: 950, letterSpacing: 2, color: "rgba(255,255,255,0.80)", textShadow: "0 4px 16px rgba(0,0,0,0.8)", userSelect: "none" }}>{initials}</span>
    </div>
  );

  return { imageUrl, alt: name, fallback, imageStyle };
}

// ── Football back — pill badges ────────────────────────────────────────────
// Football shows earned badges as [emoji]+[+N] pills (max 5) rather than
// the shared icon-only row. Soccer stats are less self-evident than
// basketball so the FP attribution inline is UX-mandatory.

const POSITION_STAT_ORDER: Record<string, string[]> = {
  GK:      ["saves", "goals_conceded", "clearances", "blocked_shots", "pressures"],
  DEF:     ["tackles", "interceptions", "clearances", "blocked_shots", "dribbles_completed"],
  MID:     ["key_passes", "tackles", "interceptions", "dribbles_completed", "pressures"],
  FWD:     ["goals", "assists", "shots_on_target", "key_passes", "dribbles_completed"],
  default: ["goals", "assists", "key_passes", "tackles", "saves"],
};
const STAT_LABELS: Record<string, string> = {
  goals:"GOALS", assists:"ASSISTS", shots_on_target:"SOT", key_passes:"KEY PASS",
  tackles:"TACKLES", interceptions:"INT", clearances:"CLEAR", blocked_shots:"BLOCKS",
  pressures:"PRESS", saves:"SAVES", goals_conceded:"GA", yellow_cards:"YC",
  red_cards:"RC", dribbles_completed:"DRIB",
};

function getFootballStats(pos: string, sl: Record<string, any>) {
  const order = POSITION_STAT_ORDER[pos] ?? POSITION_STAT_ORDER.default;
  const result: Array<{ key: string; label: string; value: any }> = [];
  for (const key of order) {
    const v = sl?.[key];
    if (v !== undefined && v !== null) result.push({ key, label: STAT_LABELS[key] ?? key.toUpperCase(), value: v });
  }
  if (result.length < 5) {
    for (const [k, v] of Object.entries(sl ?? {})) {
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
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function BackStats({ card, topGameTier }: { card: PlayerCardType; topGameTier: TopGameTier | null }) {
  const gi = (card as any).gameInfo || {};
  const sl = (card as any).statLine || {};
  const actual = Number((card as any).actualFp ?? 0);
  const rawDate = gi.date || gi.kickoff_time || sl.kickoff_time || sl.date || "";
  const dateStr = fmtDate(String(rawDate));
  const rawOpp = gi.opponent || gi.opponent_team || "";
  const opponent = String(rawOpp).trim();
  const ha = gi.homeAway || (sl.was_home === true ? "H" : sl.was_home === false ? "A" : "");
  const oppStr = opponent ? `${ha === "A" ? "@" : "vs"} ${opponent.toUpperCase()}` : "";
  const badgesData: Array<{ icon: string; label: string; fp: number }> =
    Array.isArray((card as any).achievements) ? (card as any).achievements.filter(Boolean) : [];
  const badgeFpBonus = badgesData.reduce((s, b) => s + (b.fp ?? 0), 0);
  const tiles = useMemo(() => getFootballStats(card.position as string, sl), [card.position, sl]);
  const hasStats = Object.keys(sl).length > 0;

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
    <div style={{ height: "100%", padding: "10px 10px 8px", display: "flex", flexDirection: "column", gap: 8, background: "linear-gradient(180deg,rgba(11,15,20,0.97),rgba(11,15,20,1.0))", borderRadius: 18, overflow: "hidden", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.90)" }}>{dateStr || "—"}</div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.65)", textAlign: "right" }}>{oppStr || "—"}</div>
      </div>
      <div style={{ height: 28, display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap", minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.65)" }}>FP</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: "rgba(255,255,255,0.95)" }}>{round1(actual)}</span>
          {badgeFpBonus > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#FFD700", alignSelf: "flex-end", marginBottom: 2 }}>(+{badgeFpBonus})</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "nowrap", flex: 1, overflow: "hidden" }}>
          {badgesData.slice(0, 5).map((b: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0, background: "rgba(0,0,0,0.55)", borderRadius: 6, padding: "2px 5px", border: "1px solid rgba(255,255,255,0.18)" }}>
              <span style={{ fontSize: 13, lineHeight: 1 }}>{b.icon}</span>
              <span style={{ fontSize: 7, fontWeight: 700, color: "#FFD700", letterSpacing: 0.3 }}>+{b.fp}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
      {!hasStats ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}><div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.70)" }}>No stats loaded</div></div>
      ) : tiles.length > 0 ? (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 4, alignContent: "start", minWidth: 0 }}>
          {tiles.map(s => {
            const fpContrib = fpBreakdown[s.key] ?? 0;
            const fpLabel = fmtFp(fpContrib);
            const fpColor = fpContrib > 0 ? "#FFD700" : fpContrib < 0 ? "#FF6B6B" : "rgba(255,255,255,0.30)";
            return (
              <div key={s.key} style={{ borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", padding: "3px 6px", display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 4 }}>
                  <div style={{ fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,0.55)", lineHeight: "10px" }}>{s.label}</div>
                  {fpLabel && <div style={{ fontSize: 7, fontWeight: 800, color: fpColor, lineHeight: "10px" }}>{fpLabel}</div>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>{String(s.value)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}><div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.70)" }}>Stats available</div></div>
      )}
      <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.30)", letterSpacing: 0.4, textAlign: "center" }}>TAP TO FLIP BACK</div>
    </div>
  );
}

// ── CardFace slots ─────────────────────────────────────────────────────────

const SLOTS: CardFaceSlots = {
  getHero: buildHero,
  getDisplayPosition: (card) => sportAdapter.displayPosition((card as any)?.position),
  renderBack: (card, topGameTier) => <BackStats card={card as PlayerCardType} topGameTier={topGameTier} />,
};

// ── Public component ────────────────────────────────────────────────────────

type Props = Omit<CardFaceProps, keyof CardFaceSlots> & {
  /** Legacy prop — unused by CardFace but kept so callers don't break. */
  performanceTag?: any;
};

export function SoccerCard({ performanceTag: _p, ...props }: Props) {
  return <CardFace {...props} {...SLOTS} />;
}
