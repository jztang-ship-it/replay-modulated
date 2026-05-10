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
import { headshotUrl } from "@shared/utils/headshotUrl";
import type { TopGameTier, TopGameResult } from "@shared/commentary/types";


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
function getPositionStats(pos: string, sl: Record<string, any>) {
  const display = (sportAdapter.config as any).statDisplay ?? {};
  const defs: Array<{ key: string; variants: string[]; label: string }> =
    display[pos] ?? display["default"] ?? [];
  const result: Array<{ key: string; label: string; value: any }> = [];
  for (const def of defs) {
    const v = getStatValue(sl, def.key, def.variants);
    if (v !== undefined) result.push({ key: def.key, label: def.label, value: v });
  }
  return result;
}
function getFallbackStats(sl: Record<string, any>) {
  const SKIP = new Set(["selected", "transfers_in", "transfers_out", "transfers_balance", "value", "id", "element", "fixture", "round", "gameweek", "gw", "season", "season_id", "team_h_score", "team_a_score", "team_h", "team_a", "was_home", "kickoff_time", "opponent_team", "total_points", "in_dreamteam"]);
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
function round1(n: number) { return Math.round(n * 10) / 10; }

const BASKETBALL_ORDER = ["PTS", "REB", "AST", "BLK", "STL", "TO"];
const KEY_ALIASES: Record<string, string> = { "TURNOVERS": "TO", "TOV": "TO", "TURNOVER": "TO" };

// ── BasketballHero ────────────────────────────────────────────────────────

function BasketballHero({ card, initials, isActiveReveal }: CardFrontHeroProps) {
  const [imgReady, setImgReady] = React.useState(false);
  const headshotSrc = (() => {
    const base = String((card as any)?.basePlayerId ?? "").trim();
    return headshotUrl(base);
  })();
  return (
    <>
      {/* Initials always rendered as fallback — visible when image hasn't loaded yet */}
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 32, fontWeight: 950, color: "rgba(255,255,255,0.50)", userSelect: "none" }}>
        {initials}
      </div>
      {headshotSrc && (
        <img
          key={headshotSrc}
          src={headshotSrc}
          alt={String((card as any)?.name ?? "")}
          style={{ position: "absolute", top: "12%", left: "-5%", width: "110%", height: "100%", objectFit: "cover", objectPosition: "50% 10%", opacity: imgReady ? 1 : 0, transition: "opacity 0.3s ease" }}
          draggable={false}
          onLoad={() => setImgReady(true)}
          onError={() => setImgReady(false)}
        />
      )}
    </>
  );
}

// ── BadgeRow — shared badge display, icon + visible "+N" FP contribution.
// Treats bonus FP as a property of each badge (per user feedback) instead of
// crammed next to the hero FP where it clips on narrow cards.

function BadgeRow({ badges }: { badges: Array<{ icon: string; label: string; fp: number; id?: string }> }) {
  if (!badges?.length) return null;
  return (
    <div style={{ minHeight: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
      {badges.slice(0, 8).map((b, i) => (
        <span
          key={b.id ?? b.label ?? i}
          title={b.label}
          style={{ display: "inline-flex", alignItems: "center", gap: 1, lineHeight: 1 }}
        >
          <span style={{ fontSize: 11 }}>{b.icon}</span>
          {b.fp !== 0 && (
            <span style={{ fontSize: 9, fontWeight: 900, color: b.fp > 0 ? "#FFD700" : "#FF6B6B" }}>
              {b.fp > 0 ? "+" : ""}{b.fp}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

// ── AchievementBack — featured-stat hero layout for Top Games ────────────
// Replaces the regular tile grid when the player hit a T0/T1/T2 achievement.
// One headline (1+ featured stats), one tier-context line, badges (each
// labeled with their FP contribution), then the remaining stats. FP is
// highlighted in the supporting row since it's no longer the hero number.

const TIER_CONTEXT_BASE: Record<TopGameTier, string> = {
  record: "ALL-TIME RECORD",
  career: "CAREER HIGH",
  season: "BEST OF SEASON",
};
const COUNT_PREFIX: Record<number, string> = { 2: "DOUBLE", 3: "TRIPLE", 4: "QUAD" };

function AchievementBack({
  card,
  result,
  dateStr,
  oppStr,
}: {
  card: PlayerCard;
  result: TopGameResult;
  dateStr: string;
  oppStr: string;
}) {
  const sl = (card as any).statLine || {};
  // Combine all same-tier reasons into a single headline. allReasons is
  // already filtered to the highest tier by detectTopGame.
  const reasons = result.allReasons?.length ? result.allReasons : (result.primaryReason ? [result.primaryReason] : []);
  // Cap at 3 to keep the headline readable. 4+ same-tier achievements in
  // one game is so rare we'd rather truncate than let the layout break.
  const featured = reasons.slice(0, 3).map(r => ({
    key: KEY_ALIASES[String(r.category).toUpperCase()] ?? String(r.category).toUpperCase(),
    value: r.value,
  }));
  const featuredKeys = new Set(featured.map(f => f.key));

  const baseContext = TIER_CONTEXT_BASE[result.tier!];
  const contextLine = featured.length > 1
    ? `${COUNT_PREFIX[featured.length] ?? `${featured.length}-WAY`} ${baseContext}`
    : baseContext;

  // Supporting stats — FP first (since the achievement headline replaced it
  // as the hero), then every non-featured stat in BASKETBALL_ORDER, including
  // zeros, so the row always reads as a complete stat line.
  const actual = safeNumber((card as any).actualFp) ?? 0;
  const posStats = getPositionStats(card.position as Position, sl);
  const fallbackStats = getFallbackStats(sl);
  const raw = (posStats.length > 0 ? posStats : fallbackStats).map(t => ({
    ...t,
    key: KEY_ALIASES[t.key.toUpperCase()] ?? t.key.toUpperCase(),
  }));
  const supporting = (() => {
    const byKey = new Map(raw.map(t => [t.key, t]));
    const others = BASKETBALL_ORDER
      .filter(k => !featuredKeys.has(k))
      .map(k => ({ key: k, value: Number(byKey.get(k)?.value ?? 0) }));
    return [{ key: "FP", value: round1(actual) }, ...others];
  })();

  // Number font scales down as more achievements stack into one headline.
  const numFontStyle: React.CSSProperties = featured.length >= 3
    ? { fontSize: 32, letterSpacing: -0.5 }
    : featured.length === 2
      ? { fontSize: 44, letterSpacing: -0.5 }
      : { fontSize: 64, letterSpacing: -1 };

  const badgesData: Array<{ icon: string; label: string; fp: number; id?: string }> =
    Array.isArray((card as any).achievements) ? (card as any).achievements.filter(Boolean) : [];

  return (
    <div style={{ ...S.backWrap, position: "relative" }}>
      <div style={S.backTopRow}>
        <div style={S.backDate}>{dateStr || "—"}</div>
        <div style={S.backOpp}>{oppStr || "—"}</div>
      </div>
      <div style={S.achWrap}>
        <div style={{ ...S.achHeadline, ...numFontStyle }}>
          {featured.map((f, i) => (
            <span key={f.key}>
              <span style={S.achHeadlineNum}>{f.value}</span>
              <span style={S.achHeadlineUnit}> {f.key}</span>
              {i < featured.length - 1 && <span style={S.achHeadlineSep}>{" · "}</span>}
            </span>
          ))}
        </div>
        <div style={S.achContext}>{contextLine}</div>
      </div>
      <BadgeRow badges={badgesData} />
      <StatRows stats={supporting} highlightKey="FP" />
      <div style={S.tapHint}>TAP TO FLIP BACK</div>
    </div>
  );
}

// ── Two-row stat list helper — shared by AchievementBack and BackBStats.
// Splits N stats across 2 centered comma rows (ceil(N/2) on top). Optional
// highlightKey applies a gold/bold treatment to one stat (used for FP on
// AchievementBack, where FP got demoted from the hero slot).
function StatRows({
  stats,
  highlightKey,
}: {
  stats: Array<{ key: string; value: number }>;
  highlightKey?: string;
}) {
  const half = Math.ceil(stats.length / 2);
  const row1 = stats.slice(0, half);
  const row2 = stats.slice(half);
  const renderRow = (items: Array<{ key: string; value: number }>, rowKey: string) => (
    <div style={S.achSupportRow}>
      {items.map((s, i) => {
        const isHl = highlightKey && s.key === highlightKey;
        const stat = (
          <span style={isHl ? { color: "#FFD27A", fontWeight: 900 } : undefined}>
            {s.value} {s.key}
          </span>
        );
        return (
          <span key={`${rowKey}-${s.key}`}>
            {stat}
            {i < items.length - 1 && <span style={{ opacity: 0.45 }}>{"  ·  "}</span>}
          </span>
        );
      })}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 4 }}>
      {renderRow(row1, "r1")}
      {row2.length > 0 && renderRow(row2, "r2")}
    </div>
  );
}

// ── BackBStats — regular (non-achievement) back, same hero pattern ───────
// FP is the hero number, badges sit between hero and stat rows, all 6
// basketball stats split across 2 comma rows below. When this card has
// a Top Game result, defers to AchievementBack which uses the achievement
// stat as the hero instead of FP.

function BackBStats({ card, topGameResult }: { card: PlayerCard; topGameTier?: TopGameTier | null; topGameResult?: TopGameResult | null }) {
  const gi = (card as any).gameInfo || {};
  const sl = (card as any).statLine || {};
  const posStats = useMemo(() => getPositionStats(card.position as Position, sl), [card.position, sl]);
  const fallbackStats = useMemo(() => getFallbackStats(sl), [sl]);

  const raw = (posStats.length > 0 ? posStats : fallbackStats).map(t => ({
    ...t,
    key: KEY_ALIASES[t.key.toUpperCase()] ?? t.key.toUpperCase(),
  }));
  const allStats = useMemo(() => {
    const byKey = new Map(raw.map(t => [t.key, t]));
    return BASKETBALL_ORDER.map(k => ({ key: k, value: Number(byKey.get(k)?.value ?? 0) }));
  }, [raw]);

  const actual = safeNumber((card as any).actualFp) ?? 0;
  const rawDate = gi.date || gi.kickoff_time || sl.kickoff_time || sl.date || "";
  const dateStr = fmtDate(String(rawDate));
  const rawOpp = gi.opponent || gi.opponent_team || sl.opponent || sl.opponent_team || "";
  const opponent = String(rawOpp).trim();
  const ha = gi.homeAway || (sl.was_home === true ? "H" : sl.was_home === false ? "A" : "");
  const oppStr = opponent ? `${ha === "A" ? "@" : "vs"} ${opponent.toUpperCase()}` : "";
  const badgesData: Array<{ icon: string; label: string; fp: number; id?: string }> =
    Array.isArray((card as any).achievements) ? (card as any).achievements.filter(Boolean) : [];
  const hasStats = Object.keys(sl).length > 0;
  const allZero = allStats.every(s => s.value === 0);

  // Achievement-mode: defer entirely to AchievementBack.
  const isAchievement = !!topGameResult?.tier && !!topGameResult.primaryReason && hasStats;
  if (isAchievement) {
    return <AchievementBack card={card} result={topGameResult!} dateStr={dateStr} oppStr={oppStr} />;
  }

  return (
    <div style={{ ...S.backWrap, position: "relative" }}>
      <div style={S.backTopRow}>
        <div style={S.backDate}>{dateStr || "—"}</div>
        <div style={S.backOpp}>{oppStr || "—"}</div>
      </div>
      {!hasStats || allZero ? (
        <div style={S.noStatsWrap}><div style={S.noStatsText}>No game log</div></div>
      ) : (
        <>
          <div style={S.achWrap}>
            <div style={{ ...S.achHeadline, fontSize: 56, letterSpacing: -1 }}>
              <span style={S.achHeadlineNum}>{round1(actual)}</span>
              <span style={S.achHeadlineUnit}> FP</span>
            </div>
          </div>
          {/* Badges between hero and stat rows. Each badge shows its FP
              contribution inline (treated as a property of the badge, not a
              separate suffix on the hero FP — fixes the right-edge clipping). */}
          <BadgeRow badges={badgesData} />
          <StatRows stats={allStats} />
        </>
      )}
      <div style={S.tapHint}>TAP TO FLIP BACK</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backWrap: { height: "100%", padding: "8px 8px 6px", display: "flex", flexDirection: "column", gap: 4, background: "linear-gradient(180deg,rgba(11,15,20,0.97),rgba(11,15,20,1.0))", borderRadius: 18, overflow: "hidden", boxSizing: "border-box" },
  backTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 },
  backDate: { fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.90)" },
  backOpp: { fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.65)", textAlign: "right" },
  tapHint: { fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,0.30)", letterSpacing: 0.4, textAlign: "center" },
  noStatsWrap: { flex: 1, display: "flex", flexDirection: "column", gap: 10 },
  noStatsText: { fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.70)" },
  achWrap: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0, minWidth: 0, textAlign: "center" },
  achHeadline: { fontWeight: 950, lineHeight: 1, color: "rgba(255,255,255,0.98)", whiteSpace: "nowrap", display: "block" },
  achHeadlineNum: { fontWeight: 950 },
  achHeadlineUnit: { fontWeight: 900, opacity: 0.78, fontSize: "0.45em", letterSpacing: 1.4, marginLeft: 1 },
  achHeadlineSep: { fontWeight: 800, opacity: 0.45, fontSize: "0.7em" },
  achContext: { fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: "#FFD27A", marginTop: 10, textAlign: "center" },
  achSupportRow: { fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: "rgba(255,255,255,0.55)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
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
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
  isSpotlight?: boolean;
  spotlightLevel?: number;
  isDimmed?: boolean;
  onRollComplete?: () => void;
  heldFpVisible?: boolean;
  isTapTarget?: boolean;
  isFTUE?: boolean;
  glowActive?: boolean;
  glowTier?: string;
  glowDurationMs?: number;
  /** Top Games tier — forwarded to CardFront for the shimmer/stamp overlay. */
  topGameTier?: TopGameTier | null;
  /** Top Games full result — drives the achievement-mode back layout. */
  topGameResult?: TopGameResult | null;
};

export function AthleteCard(props: Props) {
  const {
    glowActive,
    glowTier,
    glowDurationMs,
    topGameTier,
    topGameResult,
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
          topGameTier={topGameTier ?? null}
          displayPosition={sportAdapter.displayPosition((p.card as any)?.position)}
          renderHero={(heroProps: CardFrontHeroProps) => (
            <BasketballHero {...heroProps} />
          )}
        />
      )}
      renderBack={(p: CardBackProps) => <BackBStats card={p.card} topGameTier={topGameTier ?? null} topGameResult={topGameResult ?? null} />}
    />
  );
}

export function AthleteCardLegacy(props: Props) {
  return <AthleteCard {...props} />;
}