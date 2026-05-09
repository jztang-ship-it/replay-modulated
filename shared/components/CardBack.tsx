/**
 * shared/components/CardBack.tsx
 *
 * Single shared back-of-card layout. Sport responsibility shrinks to:
 *   - getStatTiles(card) → ordered list of {key, label, value, fpContribution?}
 *   - showStatTileFp     → whether to surface the per-tile FP attribution
 *
 * Everything else (header date/opp, FP value + bonus, badges row, divider,
 * tile grid CSS, tap hint) lives here. Previously AthleteCard.tsx /
 * BaseballCard.tsx / SoccerCard.tsx each owned a near-identical copy of
 * this layout; that's where small font-size and gap divergences accumulated.
 */

import type { PlayerCard } from "@shared/types";
import { TopGameStamp } from "./TopGameOverlay";
import type { TopGameTier } from "../commentary/types";
import { teamAbbrev } from "./CardFront";

export interface StatTile {
  key: string;
  label: string;
  value: number | string;
  /** Optional per-tile FP attribution. Football opts in via
   *  showStatTileFp; basketball/baseball leave it undefined. */
  fpContribution?: number;
}

interface CardBackProps {
  card: PlayerCard;
  tiles: StatTile[];
  /** When true, render "+N" / "-N" attribution next to each tile's value.
   *  Default false. */
  showStatTileFp?: boolean;
  topGameTier?: TopGameTier | null;
}

function safeNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

function fmtFp(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n) || n === 0) return "";
  const r = Math.round(n * 10) / 10;
  return (r > 0 ? "+" : "") + (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1));
}

export function CardBack({ card, tiles, showStatTileFp, topGameTier }: CardBackProps) {
  const gi = (card as any).gameInfo || {};
  const sl = (card as any).statLine || {};
  const actual = safeNumber((card as any).actualFp) ?? 0;
  const rawDate = gi.date || gi.kickoff_time || sl.kickoff_time || sl.date || "";
  const dateStr = fmtDate(String(rawDate));
  const rawOpp = gi.opponent || gi.opponent_team || sl.opponent || sl.opponent_team || "";
  const opponent = teamAbbrev(String(rawOpp).trim());
  const ha = gi.homeAway || (sl.was_home === true ? "H" : sl.was_home === false ? "A" : "");
  const oppStr = opponent ? `${ha === "A" ? "@" : "vs"} ${opponent}` : "";

  const badgesData: Array<{ icon: string; label: string; fp: number; id?: string }> =
    Array.isArray((card as any).achievements) ? (card as any).achievements.filter(Boolean) : [];
  const badgeFpBonus = badgesData.reduce((s, b) => s + (b.fp ?? 0), 0);

  const hasStats = Object.keys(sl).length > 0;
  const allZero = tiles.length > 0 && tiles.every(t => Number(t.value) === 0);

  return (
    <div style={S.backWrap}>
      <div style={S.backTopRow}>
        <div style={S.backDate}>{dateStr || "—"}</div>
        <div style={S.backOpp}>{oppStr || "—"}</div>
      </div>
      <div style={S.fpRow}>
        <div style={S.fpGroup}>
          <span style={S.fpLabel}>FP</span>
          <span style={S.fpValue}>{round1(actual)}</span>
          {badgeFpBonus !== 0 && (
            <span style={{ ...S.fpBonus, color: badgeFpBonus > 0 ? "#FFD700" : "#FF6B6B" }}>
              ({badgeFpBonus > 0 ? "+" : ""}{badgeFpBonus})
            </span>
          )}
        </div>
        {topGameTier && (
          <div style={S.topGameStampWrap}>
            <TopGameStamp tier={topGameTier} />
          </div>
        )}
      </div>
      <div style={S.badgeRow}>
        {badgesData.length > 0 ? (
          badgesData.slice(0, 8).map((b, i) => (
            <span
              key={b.id ?? b.label ?? i}
              title={`${b.label} (${b.fp > 0 ? "+" : ""}${b.fp})`}
              style={S.badgeIcon}
            >{b.icon}</span>
          ))
        ) : (
          <span style={S.noBadges}>No badges</span>
        )}
      </div>
      <div style={S.divider} />
      {!hasStats || allZero || tiles.length === 0 ? (
        <div style={S.noStatsWrap}><div style={S.noStatsText}>No game log</div></div>
      ) : (
        <div style={S.tilesGrid}>
          {tiles.slice(0, 9).map(t => {
            const fpLabel = showStatTileFp ? fmtFp(t.fpContribution) : "";
            const fpColor =
              (t.fpContribution ?? 0) > 0 ? "#FFD700"
                : (t.fpContribution ?? 0) < 0 ? "#FF6B6B"
                  : "rgba(255,255,255,0.30)";
            return (
              <div key={t.key} style={S.tile}>
                <div style={S.tileHead}>
                  <div style={S.tileLabel}>{t.label}</div>
                  {fpLabel && <div style={{ ...S.tileFp, color: fpColor }}>{fpLabel}</div>}
                </div>
                <div style={S.tileValue}>{String(t.value)}</div>
              </div>
            );
          })}
        </div>
      )}
      <div style={S.tapHint}>TAP TO FLIP BACK</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backWrap: { height: "100%", padding: "10px 10px 8px", display: "flex", flexDirection: "column", gap: 6, background: "linear-gradient(180deg,rgba(11,15,20,0.97),rgba(11,15,20,1.0))", borderRadius: 18, overflow: "hidden", boxSizing: "border-box" },
  backTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backDate: { fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.90)" },
  backOpp: { fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.65)", textAlign: "right" },
  fpRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 },
  fpGroup: { display: "flex", alignItems: "baseline", gap: 3, minWidth: 0 },
  fpLabel: { fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.65)" },
  fpValue: { fontSize: 22, fontWeight: 900, color: "rgba(255,255,255,0.95)" },
  fpBonus: { fontSize: 10, fontWeight: 700, alignSelf: "flex-end", marginBottom: 1 },
  topGameStampWrap: { flexShrink: 0, transform: "rotate(-4deg) scale(0.7)", transformOrigin: "right center" },
  badgeRow: { minHeight: 12, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" },
  badgeIcon: { fontSize: 9, lineHeight: 1 },
  noBadges: { fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.25)" },
  divider: { height: 1, background: "rgba(255,255,255,0.08)" },
  tilesGrid: { flex: 1, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 4, alignContent: "start", minWidth: 0 },
  tile: { borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", padding: "3px 6px", display: "flex", flexDirection: "column", gap: 1, minWidth: 0 },
  tileHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 4 },
  tileLabel: { fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,0.55)", lineHeight: "10px" },
  tileFp: { fontSize: 7, fontWeight: 800, lineHeight: "10px" },
  tileValue: { fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.92)" },
  tapHint: { fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.30)", letterSpacing: 0.4, textAlign: "center" },
  noStatsWrap: { flex: 1, display: "flex", flexDirection: "column", gap: 10 },
  noStatsText: { fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.70)" },
};
