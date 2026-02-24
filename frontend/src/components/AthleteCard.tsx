import React, { useMemo, useRef, useEffect } from "react";
import type { GamePhase, PlayerCard, Position } from "../adapters/types";
import { AthleteCardFront } from "./AthleteCardFront";
import { CardBackGeneric } from "./CardBackGeneric";

const FLIP_STYLE_ID = "athlete-card-flip-styles";
if (typeof document !== "undefined" && !document.getElementById(FLIP_STYLE_ID)) {
  const style = document.createElement("style");
  style.id = FLIP_STYLE_ID;
  style.textContent = `
    .card-inner {
      position: relative;
      width: 100%;
      height: 100%;
      transform-style: preserve-3d;
      transition: transform var(--flip-ms, 450ms) cubic-bezier(0.4, 0.0, 0.2, 1);
      will-change: transform;
    }
    .card-inner.no-transition { transition: none !important; }
    .card-inner.is-flipped { transform: rotateY(180deg); }
    .card-face {
      position: absolute;
      inset: 0;
      border-radius: 18px;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      overflow: hidden;
    }
    .card-face-back { transform: rotateY(180deg); }
  `;
  document.head.appendChild(style);
}

type Props = {
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
};

type StatSpec = { key: string; variants: string[]; label: string };

const POSITION_STATS: Record<Position, StatSpec[]> = {
  FW: [
    { key: "goals_scored", variants: ["goals", "goalsScored"], label: "Goals" },
    { key: "assists", variants: ["assist"], label: "Assists" },
    { key: "expected_goals", variants: ["xg", "expectedGoals"], label: "xG" },
    { key: "expected_assists", variants: ["xa", "expectedAssists"], label: "xA" },
    { key: "bonus", variants: ["bonus"], label: "Bonus" },
    { key: "minutes", variants: ["mins", "min", "minutes_played"], label: "Minutes" },
  ],
  MD: [
    { key: "assists", variants: ["assist"], label: "Assists" },
    { key: "expected_assists", variants: ["xa", "expectedAssists"], label: "xA" },
    { key: "creativity", variants: ["creativity"], label: "Creativity" },
    { key: "influence", variants: ["influence"], label: "Influence" },
    { key: "bonus", variants: ["bonus"], label: "Bonus" },
    { key: "minutes", variants: ["mins", "min", "minutes_played"], label: "Minutes" },
  ],
  DE: [
    { key: "clean_sheets", variants: ["clean_sheet", "cleanSheet"], label: "Clean sheet" },
    { key: "goals_conceded", variants: ["goalsConceded"], label: "Conceded" },
    { key: "expected_goals_conceded", variants: ["xgc", "expectedGoalsConceded"], label: "xGC" },
    { key: "bps", variants: ["bps"], label: "BPS" },
    { key: "bonus", variants: ["bonus"], label: "Bonus" },
    { key: "minutes", variants: ["mins", "min", "minutes_played"], label: "Minutes" },
  ],
  GK: [
    { key: "saves", variants: ["saves_total", "savesTotal"], label: "Saves" },
    { key: "clean_sheets", variants: ["clean_sheet", "cleanSheet"], label: "Clean sheet" },
    { key: "goals_conceded", variants: ["goalsConceded"], label: "Conceded" },
    { key: "penalties_saved", variants: ["penaltiesSaved", "penalty_saves"], label: "Pens saved" },
    { key: "bonus", variants: ["bonus"], label: "Bonus" },
    { key: "minutes", variants: ["mins", "min", "minutes_played"], label: "Minutes" },
  ],
};

function safeNumber(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function prettifyKey(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function getStatValue(sl: Record<string, any>, key: string, variants: string[]) {
  for (const k of [key, ...variants]) {
    const v = sl?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const vc = sl?.[camel];
    if (vc !== undefined && vc !== null && vc !== "") return vc;
  }
  return undefined;
}

function getPositionStats(pos: Position, sl: Record<string, any>) {
  const defs = POSITION_STATS[pos] ?? POSITION_STATS.MD;
  const result: Array<{ key: string; label: string; value: any }> = [];
  for (const def of defs) {
    const v = getStatValue(sl, def.key, def.variants);
    if (v !== undefined) result.push({ key: def.key, label: def.label, value: v });
  }
  return result;
}

function getFallbackStats(sl: Record<string, any>) {
  const SKIP = new Set([
    "selected",
    "transfers_in",
    "transfers_out",
    "transfers_balance",
    "value",
    "id",
    "element",
    "fixture",
    "round",
    "gameweek",
    "gw",
    "season",
    "season_id",
    "team_h_score",
    "team_a_score",
    "team_h",
    "team_a",
    "was_home",
    "kickoff_time",
    "opponent_team",
    "total_points",
    "in_dreamteam",
  ]);
  const out: Array<{ key: string; label: string; value: any }> = [];
  for (const [k, v] of Object.entries(sl || {})) {
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
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function BackBStats({ card }: { card: PlayerCard }) {
  const gi = (card as any).gameInfo || {};
  const sl = (card as any).statLine || {};

  const posStats = useMemo(() => getPositionStats(card.position as Position, sl), [card.position, sl]);
  const fallbackStats = useMemo(() => getFallbackStats(sl), [sl]);
  const tiles = posStats.length > 0 ? posStats : fallbackStats;

  const actual = safeNumber((card as any).actualFp) ?? 0;
  const proj = safeNumber((card as any).projectedFp) ?? 0;

  const rawDate = gi.date || gi.kickoff_time || sl.kickoff_time || sl.date || "";
  const dateStr = fmtDate(String(rawDate));
  const rawOpp = gi.opponent || gi.opponent_team || sl.opponent || sl.opponent_team || "";
  const opponent = String(rawOpp).trim();
  const ha = gi.homeAway || (sl.was_home === true ? "H" : sl.was_home === false ? "A" : "");
  const oppStr = opponent ? `${ha === "A" ? "@" : "vs"} ${opponent.toUpperCase()}` : "";

  const badges = Array.isArray((card as any).achievements) ? (card as any).achievements.map((a: any) => a?.icon).filter(Boolean) : [];
  const hasStats = Object.keys(sl).length > 0;

  return (
    <div style={S.backWrap}>
      <div style={S.backTopRow}>
        <div style={S.backDate}>{dateStr || "—"}</div>
        <div style={S.backOpp}>{oppStr || "—"}</div>
      </div>

      <div style={S.backMidRow}>
        <div style={S.fpLine}>
          <span style={S.fpLabel}>FP</span>
          <span style={S.fpValue}>{round1(actual)}</span>
          <span style={S.fpSpacer} />
          <span style={S.fpSubLabel}>Proj</span>
          <span style={S.fpSubValue}>{round1(proj)}</span>
        </div>

        {badges.length > 0 && (
          <div style={S.badgesInline}>
            {badges.slice(0, 5).map((ic: string, i: number) => (
              <span key={i} style={S.badgeIcon}>
                {ic}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={S.divider} />

      {!hasStats ? (
        <div style={S.noStatsWrap}>
          <div style={S.noStatsText}>No stats loaded</div>
        </div>
      ) : tiles.length > 0 ? (
        <div style={S.tilesGrid}>
          {tiles.slice(0, 9).map((s) => (
            <div key={s.key} style={S.tile}>
              <div style={S.tileLabel}>{s.label}</div>
              <div style={S.tileValue}>{String(s.value)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={S.noStatsWrap}>
          <div style={S.noStatsText}>Stats available</div>
        </div>
      )}

      <div style={S.tapHint}>TAP TO FLIP BACK</div>
    </div>
  );
}

export function AthleteCard(props: Props) {
  const locked = props.locked ?? props.isLocked ?? false;
  const flipped = props.flipped ?? props.isFlipped ?? false;
  const canFlip = props.canFlip ?? false;

  const {
    card,
    phase,
    isMvp = false,
    onToggleFlip,
    isRevealing,
    visibleFp,
    visibleBadgeCount,
    noTransition,
    flipDurationMs,
    fpCountUpMs,
    performanceTag,
    pulse,
  } = props;

  // ✅ ECONOMY FREEZE (fix border/tier/salary “changing”)
  // Freeze tier/salary/projectedFp by cardId for UI stability.
  const economyRef = useRef<Map<string, { tier: any; salary: any; projectedFp: any }>>(new Map());

  const id = String((card as any).cardId ?? "");
  useEffect(() => {
    if (!id) return;
    const m = economyRef.current;
    if (!m.has(id)) {
      m.set(id, { tier: (card as any).tier, salary: (card as any).salary, projectedFp: (card as any).projectedFp });
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
    } as PlayerCard;
  }, [card, id]);

  const innerClass = ["card-inner", flipped ? "is-flipped" : "", noTransition ? "no-transition" : ""].filter(Boolean).join(" ");
  const innerStyle = { ["--flip-ms" as any]: `${Math.max(0, flipDurationMs ?? 450)}ms` } as React.CSSProperties;

  return (
    <div style={{ width: "100%", height: "100%", perspective: "1000px" }}>
      <div className={innerClass} style={innerStyle}>
        <div className="card-face">
          <AthleteCardFront
            card={stableCard}
            phase={phase}
            isLocked={locked}
            isMvp={isMvp}
            isFlipped={flipped}
            canFlip={canFlip}
            onToggleFlip={onToggleFlip ?? (() => {})}
            visibleFp={visibleFp}
            visibleBadgeCount={visibleBadgeCount}
            isRevealing={isRevealing}
            performanceTag={performanceTag}
            pulse={pulse}
            fpCountUpMs={fpCountUpMs}
          />
        </div>

        <div className="card-face card-face-back">{canFlip ? <BackBStats card={stableCard} /> : <CardBackGeneric />}</div>
      </div>
    </div>
  );
}

export function AthleteCardLegacy(props: Props) {
  return <AthleteCard {...props} />;
}

const S: Record<string, React.CSSProperties> = {
  backWrap: {
    height: "100%",
    padding: "10px 10px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "linear-gradient(180deg,rgba(11,15,20,0.97),rgba(11,15,20,1.0))",
    borderRadius: 18,
    overflow: "hidden",
    boxSizing: "border-box" as const,
  },
  backTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backDate: { fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.90)" },
  backOpp: { fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.65)", textAlign: "right" },

  backMidRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  fpLine: { display: "flex", alignItems: "baseline", gap: 8 },
  fpLabel: { fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.65)" },
  fpValue: { fontSize: 22, fontWeight: 900, color: "rgba(255,255,255,0.95)" },
  fpSpacer: { width: 10 },
  fpSubLabel: { fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.45)" },
  fpSubValue: { fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.75)" },

  badgesInline: { display: "flex", alignItems: "center", gap: 6 },
  badgeIcon: { fontSize: 16, opacity: 0.95 },

  divider: { height: 1, background: "rgba(255,255,255,0.08)" },

  tilesGrid: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
    gap: 6,
    alignContent: "start",
    overflow: "hidden",
    minWidth: 0,
  },
  tile: {
    borderRadius: 10,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "6px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minHeight: 40,
    minWidth: 0,
    overflow: "hidden",
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: 900,
    color: "rgba(255,255,255,0.55)",
    lineHeight: "11px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tileValue: {
    fontSize: 14,
    fontWeight: 900,
    color: "rgba(255,255,255,0.92)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  tapHint: {
    fontSize: 10,
    fontWeight: 900,
    color: "rgba(255,255,255,0.30)",
    letterSpacing: 0.4,
    textAlign: "center",
  },

  noStatsWrap: { flex: 1, display: "flex", flexDirection: "column", gap: 10 },
  noStatsText: { fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.70)" },
};