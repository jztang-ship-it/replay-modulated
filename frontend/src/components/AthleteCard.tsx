// src/components/AthleteCard.tsx
// LAYER 1: Card with three visual states + stats back + legend modal

import React, { useMemo } from "react";
import type { GamePhase, PlayerCard, Position } from "../adapters/types";
import { AthleteCardFront } from "./AthleteCardFront";
import { CardBackGeneric } from "./CardBackGeneric";

export type CardDisplayMode = "facedown" | "faceup" | "stats";

type AthleteCardProps = {
  card: PlayerCard;
  phase: GamePhase;
  displayMode: CardDisplayMode;
  isFlipping?: boolean;
  isLocked: boolean;
  isMvp: boolean;
  canTapForStats: boolean;
  onTapForStats?: () => void;
  visibleBadgeCount?: number;
  visibleFp?: number;
};

// ============================================================
// HELPERS
// ============================================================

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function prettyKey(k: string) {
  return String(k)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\bTOTAL POINTS\b/i, "Base FP")
    .toUpperCase();
}

// Format date: "2023-04-15" → "23 - Apr 15"
function formatDate(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const yy = String(d.getFullYear()).slice(2);
  const mon = d.toLocaleString("default", { month: "short" });
  const day = d.getDate();
  return `${yy} - ${mon} ${day}`;
}

function pickBreakdown(card: any): Record<string, number> | null {
  const candidates = [
    card?.fpBreakdown,
    card?.pointsByStat,
    card?.fpByStat,
    card?.statFp,
    card?.scoringBreakdown,
    card?.fantasyPointsByStat,
    card?.fantasyBreakdown,
  ];

  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "object" && !Array.isArray(c)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(c)) {
        // Skip the FPL fast-path key — it's just the total, not useful
        if (k === "TOTAL_POINTS") continue;
        const n = Number(v);
        if (Number.isFinite(n) && n !== 0) out[String(k)] = n;
      }
      if (Object.keys(out).length) return out;
    }
  }
  return null;
}

// Position-aware stat keys — FPL naming convention from statLine
// Layer 2 populates statLine from raw game log stats object
// These keys cover both snake_case (FPL API) and camelCase variants
const POSITION_STATS: Record<Position, Array<{ key: string; variants: string[]; abbrev: string }>> = {
  FW: [
    { key: "goals_scored",     variants: ["goals", "goalsScored", "goal"],           abbrev: "G" },
    { key: "assists",          variants: ["assist"],                                   abbrev: "A" },
    { key: "shots",            variants: ["shots_total", "shotsTotal"],                abbrev: "SH" },
    { key: "shots_on_target",  variants: ["shotsOnTarget", "shots_on_goal"],           abbrev: "SOT" },
    { key: "key_passes",       variants: ["keyPasses", "chances_created"],             abbrev: "KP" },
    { key: "dribbles_completed", variants: ["dribbles", "dribblesCompleted"],          abbrev: "DRB" },
    { key: "minutes",          variants: ["mins", "min", "minutes_played"],            abbrev: "MIN" },
  ],
  MD: [
    { key: "goals_scored",     variants: ["goals", "goalsScored"],                     abbrev: "G" },
    { key: "assists",          variants: ["assist"],                                    abbrev: "A" },
    { key: "key_passes",       variants: ["keyPasses", "chances_created"],             abbrev: "KP" },
    { key: "passes",           variants: ["passes_total", "passesTotal"],              abbrev: "PAS" },
    { key: "pass_accuracy",    variants: ["passAccuracy", "passes_accuracy"],          abbrev: "PA%" },
    { key: "tackles",          variants: ["tackles_total", "tacklesTotal"],            abbrev: "TKL" },
    { key: "minutes",          variants: ["mins", "min", "minutes_played"],            abbrev: "MIN" },
  ],
  DE: [
    { key: "tackles",          variants: ["tackles_total", "tacklesTotal"],            abbrev: "TKL" },
    { key: "interceptions",    variants: ["interceptions_total"],                      abbrev: "INT" },
    { key: "clearances",       variants: ["clearances_total", "clearancesTotal"],      abbrev: "CLR" },
    { key: "blocks",           variants: ["blocked_shots", "blockedShots"],            abbrev: "BLK" },
    { key: "clean_sheets",     variants: ["clean_sheet", "cleanSheet", "cleanSheets"], abbrev: "CS" },
    { key: "goals_conceded",   variants: ["goalsConceded", "goals_allowed"],           abbrev: "GA" },
    { key: "minutes",          variants: ["mins", "min", "minutes_played"],            abbrev: "MIN" },
  ],
  GK: [
    { key: "saves",            variants: ["saves_total", "savesTotal"],                abbrev: "SV" },
    { key: "clean_sheets",     variants: ["clean_sheet", "cleanSheet", "cleanSheets"], abbrev: "CS" },
    { key: "goals_conceded",   variants: ["goalsConceded", "goals_allowed"],           abbrev: "GA" },
    { key: "penalties_saved",  variants: ["penaltiesSaved", "penalty_saves"],          abbrev: "PKS" },
    { key: "punches",          variants: ["punches_total"],                            abbrev: "PUN" },
    { key: "high_claims",      variants: ["highClaims"],                               abbrev: "HC" },
    { key: "minutes",          variants: ["mins", "min", "minutes_played"],            abbrev: "MIN" },
  ],
};

function getPositionStats(
  position: Position,
  statLine: Record<string, any>
): Array<{ key: string; abbrev: string; value: any }> {
  const defs = POSITION_STATS[position] ?? POSITION_STATS["MD"];
  const result: Array<{ key: string; abbrev: string; value: any }> = [];

  for (const def of defs) {
    // Try primary key then all variants
    const allKeys = [def.key, ...def.variants];
    let found: any = undefined;
    for (const k of allKeys) {
      if (statLine[k] !== undefined && statLine[k] !== null && statLine[k] !== "") {
        found = statLine[k];
        break;
      }
      // Also try camelCase conversion
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (statLine[camel] !== undefined && statLine[camel] !== null) {
        found = statLine[camel];
        break;
      }
    }
    if (found !== undefined) {
      result.push({ key: def.key, abbrev: def.abbrev, value: found });
    }
  }

  // If position stats returned nothing, do a smart fallback:
  // Show any numeric stats from statLine that look meaningful (non-zero, non-id)
  if (result.length === 0) {
    const SKIP_KEYS = new Set(["id", "player_id", "playerId", "element", "fixture", "team_h_score", "team_a_score", "round", "gameweek"]);
    const fallback = Object.entries(statLine)
      .filter(([k, v]) => {
        if (SKIP_KEYS.has(k)) return false;
        const n = Number(v);
        return Number.isFinite(n) && n !== 0 && n > 0;
      })
      .slice(0, 6)
      .map(([k, v]) => ({
        key: k,
        abbrev: k.replace(/_/g, " ").toUpperCase().slice(0, 3),
        value: v,
      }));
    return fallback;
  }

  return result;
}

// ============================================================
// LEGEND MODAL
// ============================================================

// ============================================================
// STATS BACK
// ============================================================

function BackBStats({ card }: { card: PlayerCard }) {
  const anyCard: any = card;
  const sl: Record<string, any> = anyCard?.statLine ?? {};
  const gi: Record<string, any> = anyCard?.gameInfo ?? {};

  // ── Date: try every possible field name FPL / generic logs use ──
  const rawDate =
    gi?.date || gi?.kickoff_time || gi?.game_date || gi?.gameDate ||
    sl?.date || sl?.kickoff_time || sl?.game_date || sl?.gameDate ||
    anyCard?.date || anyCard?.gameDate || "";
  const date = formatDate(String(rawDate).trim());

  // ── Opponent: try every possible field ──
  const rawOpp =
    gi?.opponent || gi?.opponent_team || gi?.opponentTeam || gi?.vs ||
    sl?.opponent || sl?.opponent_team || sl?.opponentTeam || sl?.matchup ||
    anyCard?.opponent || anyCard?.vs || "";
  const opponent = String(rawOpp).trim();

  // ── Home/Away ──
  const rawHA =
    gi?.homeAway ?? gi?.was_home ?? gi?.home ??
    sl?.was_home ?? sl?.homeAway ?? anyCard?.homeAway;
  // was_home is a boolean in FPL
  const isHome = rawHA === true || rawHA === "H" || rawHA === "home" || rawHA === 1;
  const isAway = rawHA === false || rawHA === "A" || rawHA === "away" || rawHA === 0;
  const haSuffix = (rawHA !== undefined && rawHA !== null && rawHA !== "")
    ? (isHome ? " (H)" : isAway ? " (A)" : "")
    : "";
  const matchup = opponent ? `${isHome ? "vs" : "@"} ${opponent.toUpperCase()}${haSuffix}` : "";

  // ── FP values ──
  const fp = toNum(anyCard?.actualFp);
  const proj = toNum(anyCard?.projectedFp);
  const fpStr = fp.toFixed(1);
  const projStr = proj.toFixed(1);

  // ── Stats: show position-aware stats, fall back to ALL numeric fields ──
  const posStats = useMemo(() =>
    getPositionStats(card.position, sl),
    [card.position, sl] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // If position stats found nothing, show every non-trivial numeric stat in statLine
  const allStats = useMemo(() => {
    if (posStats.length > 0) return posStats;
    // Skip noise fields
    const SKIP = new Set([
      "id","element","fixture","round","gameweek","gw","season","season_id",
      "team_h_score","team_a_score","team_h","team_a","was_home","kickoff_time",
      "opponent_team","total_points","bps","ict_index","influence","creativity",
      "threat","starts","value","selected","transfers_in","transfers_out",
      "transfers_balance","in_dreamteam",
    ]);
    return Object.entries(sl)
      .filter(([k, v]) => {
        if (SKIP.has(k)) return false;
        const n = Number(v);
        return Number.isFinite(n) && n > 0;
      })
      .map(([k, v]) => ({
        key: k,
        abbrev: k.replace(/_/g,"").toUpperCase().slice(0, 4),
        value: v,
      }))
      .slice(0, 9);
  }, [posStats, sl]); // eslint-disable-line react-hooks/exhaustive-deps

  const achievements: any[] = anyCard?.achievements ?? [];

  // ── Debug: log what we're working with (remove after confirming data works) ──
  // console.log("[CARD BACK]", { date, opponent, fp, proj, slKeys: Object.keys(sl), gi });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 18,
        overflow: "hidden",
        background: "linear-gradient(160deg, #0C1422 0%, #070B14 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        color: "rgba(255,255,255,0.92)",
        padding: "10px 11px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        backfaceVisibility: "hidden",
      }}
    >
      {/* ── Row 1: Date + Matchup ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.3, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {date || "—"}
        </span>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.5, color: "rgba(255,255,255,0.8)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {matchup || "—"}
        </span>
      </div>

      {/* ── Row 2: FP + proj on same line ── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>FP</span>
        <span style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.5, lineHeight: 1, color: "#EAF0FF" }}>{fpStr}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", lineHeight: 1 }}>proj {projStr}</span>
        {achievements.length > 0 && (
          <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
            {achievements.map((a: any, i: number) => (
              <span key={i} title={a.label} style={{ fontSize: 13, lineHeight: 1 }}>{a.icon ?? "⭐"}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

      {/* ── DEBUG PANEL: remove once data confirmed ── */}
      {allStats.length === 0 && (
        <div style={{ fontSize: 7, color: "rgba(255,200,0,0.7)", background: "rgba(255,200,0,0.07)", borderRadius: 6, padding: "4px 6px", lineHeight: 1.6, overflowY: "auto", maxHeight: 80 }}>
          <div>gi: {JSON.stringify(gi).slice(0, 80)}</div>
          <div>sl keys: {Object.keys(sl).join(", ").slice(0, 120) || "EMPTY"}</div>
          <div>fp:{toNum(anyCard?.actualFp).toFixed(1)} proj:{toNum(anyCard?.projectedFp).toFixed(1)}</div>
        </div>
      )}

      {/* ── Stats grid ── */}
      {allStats.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px 3px", flex: 1 }}>
          {allStats.map(s => (
            <div
              key={s.key}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 6,
                padding: "4px 3px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 7, fontWeight: 900, letterSpacing: 0.5, color: "rgba(255,255,255,0.38)", textTransform: "uppercase", marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.abbrev}
              </div>
              <div style={{ fontSize: 14, fontWeight: 950, lineHeight: 1, color: "#EAF0FF" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty state with helpful debug info */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>No stats loaded</span>
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.15)" }}>
            {Object.keys(sl).length > 0 ? `${Object.keys(sl).length} fields in statLine` : "statLine is empty"}
          </span>
        </div>
      )}

      {/* ── Tap hint ── */}
      <div style={{ textAlign: "center", fontSize: 8, fontWeight: 700, letterSpacing: 0.6, color: "rgba(255,255,255,0.18)", flexShrink: 0 }}>
        TAP TO FLIP BACK
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function AthleteCard({
  card,
  phase,
  displayMode,
  isFlipping,
  isLocked,
  isMvp,
  canTapForStats,
  onTapForStats,
  visibleBadgeCount,
  visibleFp,
}: AthleteCardProps) {
  const rotation = displayMode === "faceup" ? 0 : 180;

  const handleClick = (e: React.MouseEvent) => {
    if (canTapForStats && displayMode !== "facedown") {
      e.stopPropagation();
      onTapForStats?.();
    }
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        perspective: "1000px",
        cursor: canTapForStats && displayMode !== "facedown" ? "pointer" : "default",
      }}
      onClick={handleClick}
    >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            transformStyle: "preserve-3d",
            transition: isFlipping
              ? "transform 600ms cubic-bezier(.2,.85,.4,1)"
              : "transform 400ms cubic-bezier(.2,.9,.2,1)",
            transform: `rotateY(${rotation}deg)`,
          }}
        >
          {/* Front */}
          <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}>
            <AthleteCardFront
              card={card}
              phase={phase}
              isLocked={isLocked}
              isMvp={isMvp}
              isFlipped={displayMode === "stats"}
              canFlip={canTapForStats}
              onToggleFlip={onTapForStats || (() => {})}
              visibleFp={visibleFp}
              visibleBadgeCount={visibleBadgeCount}
            />
          </div>

          {/* Back */}
          <div style={{ position: "absolute", inset: 0, transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}>
            {displayMode === "facedown"
              ? <CardBackGeneric isFlipping={isFlipping} />
              : <BackBStats card={card} />
            }
          </div>
        </div>
      </div>
  );
}

// ============================================================
// BACKWARD COMPATIBILITY WRAPPER
// ============================================================

export type LegacyAthleteCardProps = {
  card: PlayerCard;
  phase: GamePhase;
  isLocked: boolean;
  isMvp: boolean;
  isFlipped: boolean;
  canFlip: boolean;
  onToggleFlip: () => void;
  isFaceDown?: boolean;
  visibleFp?: number;
};

export function AthleteCardLegacy({
  card, phase, isLocked, isMvp, isFlipped, canFlip, onToggleFlip, isFaceDown, visibleFp,
}: LegacyAthleteCardProps) {
  let displayMode: CardDisplayMode = "faceup";
  if (isFaceDown) displayMode = "facedown";
  else if (isFlipped) displayMode = "stats";

  return (
    <AthleteCard
      card={card}
      phase={phase}
      displayMode={displayMode}
      isFlipping={isFaceDown}
      isLocked={isLocked}
      isMvp={isMvp}
      canTapForStats={canFlip && !isFaceDown}
      onTapForStats={onToggleFlip}
      visibleFp={visibleFp}
    />
  );
}
