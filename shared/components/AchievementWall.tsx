import React, { useEffect, useMemo, useState } from "react";
import { track } from "@shared/analytics/analytics";
import { getAllDefs } from "@shared/achievements";
import type { WallRow } from "@shared/hooks/useAchievementWall";
import { useOwnAchievementWall, useOtherAchievementWall } from "@shared/hooks/useAchievementWall";
import { AchievementCard } from "./AchievementCard";
import { AchievementDetailModal } from "./AchievementDetailModal";

export interface AchievementWallProps {
  sport: string;
  isSelf: boolean;
  targetUserId?: string;       // required when isSelf=false
  ownUnlockedIds?: string[];   // own IDs — for comparison row when isSelf=false
  /** Own stats for header (self mode only) */
  totalHands?: number;
  lifetimeBestFp?: number;
  currentStreak?: number;
}

type FilterTab = "all" | "bronze" | "silver" | "gold";
type SortMode = "recent" | "tier";

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all",    label: "All" },
  { id: "bronze", label: "Instant" },
  { id: "silver", label: "Grinder" },
  { id: "gold",   label: "Cross-Era" },
];

function sortRows(rows: WallRow[], mode: SortMode): WallRow[] {
  const tierWeight: Record<string, number> = { gold: 0, silver: 1, bronze: 2 };
  return [...rows].sort((a, b) => {
    const aUnlocked = !!a.unlockedAt;
    const bUnlocked = !!b.unlockedAt;
    // Unlocked always before locked
    if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
    if (mode === "recent") {
      // Among unlocked: most recent first. Among locked: by tier.
      if (aUnlocked && bUnlocked) {
        return (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "");
      }
      return (tierWeight[a.def.tier] ?? 99) - (tierWeight[b.def.tier] ?? 99);
    }
    // "tier" mode: gold → silver → bronze, then by unlock date
    const tw = (tierWeight[a.def.tier] ?? 99) - (tierWeight[b.def.tier] ?? 99);
    if (tw !== 0) return tw;
    return (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "");
  });
}

function OwnWall(props: AchievementWallProps) {
  const { rows, loading } = useOwnAchievementWall(props.sport);
  return <WallInner {...props} rows={rows} loading={loading} />;
}

function OtherWall(props: AchievementWallProps & { targetUserId: string }) {
  const { rows, loading, nickname, rarityMap } = useOtherAchievementWall(props.sport, props.targetUserId);
  return <WallInner {...props} rows={rows} loading={loading} nickname={nickname} rarityMap={rarityMap} />;
}

function WallInner({
  sport,
  isSelf,
  targetUserId,
  ownUnlockedIds = [],
  totalHands,
  lifetimeBestFp,
  currentStreak,
  rows,
  loading,
  nickname,
  rarityMap = {},
}: AchievementWallProps & {
  rows: WallRow[];
  loading: boolean;
  nickname?: string | null;
  rarityMap?: Record<string, number>;
}) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [detailRow, setDetailRow] = useState<WallRow | null>(null);

  const totalDefs = getAllDefs().filter(d => d.sport === sport || d.sport === "all").length;
  const unlockedCount = rows.filter(r => !!r.unlockedAt).length;

  const filtered = useMemo(() => {
    const base = filter === "all" ? rows : rows.filter(r => r.def.tier === filter);
    return sortRows(base, sort);
  }, [rows, filter, sort]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isSelf && targetUserId) {
      track("profile", "profile_other_view", {
        target_user_id: targetUserId,
        sport,
      });
    }
  }, []);

  function handleFilterChange(id: FilterTab) {
    setFilter(id);
    track("profile", "achievement_filter_change", { filter: id, sport });
  }

  function handleDetailOpen(row: WallRow) {
    setDetailRow(row);
    track("profile", "achievement_detail_open", {
      achievement_id: row.def.id,
      locked: !row.unlockedAt,
      sport,
    });
  }

  // Comparison stats (other-user mode)
  const theirUnlockedIds = rows.filter(r => r.unlockedAt).map(r => r.def.id);
  const overlapCount = ownUnlockedIds.filter(id => theirUnlockedIds.includes(id)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: 0 }}>
      {/* Stats header */}
      <div style={{
        padding: "14px 16px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {!isSelf && nickname && (
          <div style={{ fontSize: 16, fontWeight: 800, color: "#EAF0FF", marginBottom: 8 }}>
            {nickname}'s Wall
          </div>
        )}

        {!isSelf && (
          <ComparisonRow
            myCount={ownUnlockedIds.length}
            theirCount={theirUnlockedIds.length}
            overlap={overlapCount}
            total={totalDefs}
          />
        )}

        {isSelf && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatChip label="Achievements" value={`${unlockedCount}/${totalDefs}`} />
            {totalHands !== undefined && <StatChip label="Hands" value={String(totalHands)} />}
            {lifetimeBestFp !== undefined && <StatChip label="Best FP" value={`${lifetimeBestFp}`} />}
            {currentStreak !== undefined && currentStreak > 0 && <StatChip label="Streak" value={`${currentStreak}🔥`} />}
          </div>
        )}

        {!isSelf && (
          <div style={{ marginTop: 8 }}>
            <StatChip label="Unlocked" value={`${theirUnlockedIds.length}/${totalDefs}`} />
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{
        display: "flex",
        gap: 0,
        overflowX: "auto",
        padding: "8px 16px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleFilterChange(tab.id)}
            style={{
              padding: "6px 14px",
              background: "transparent",
              border: "none",
              borderBottom: filter === tab.id ? "2px solid #FFB14A" : "2px solid transparent",
              color: filter === tab.id ? "#FFB14A" : "rgba(255,255,255,0.45)",
              fontSize: 12,
              fontWeight: filter === tab.id ? 800 : 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 150ms ease",
            }}
          >
            {tab.label}
          </button>
        ))}

        {/* Sort — right side */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", paddingBottom: 2 }}>
          <button
            onClick={() => setSort(s => s === "recent" ? "tier" : "recent")}
            style={{
              fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)",
              background: "transparent", border: "none",
              cursor: "pointer", whiteSpace: "nowrap", letterSpacing: 0.3,
            }}
          >
            {sort === "recent" ? "⏱ Recent" : "🏆 By Tier"}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 16px 24px",
        WebkitOverflowScrolling: "touch",
      }}>
        {loading ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 32, fontSize: 13 }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 32, fontSize: 13 }}>
            No achievements in this category.
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10,
          }}>
            {filtered.map(row => (
              <AchievementCard
                key={row.def.id}
                def={row.def}
                unlockedAt={row.unlockedAt}
                mvpCard={row.mvpCard}
                fpTier={row.fpTier}
                totalFp={row.totalFp}
                season={row.season}
                onClick={() => handleDetailOpen(row)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detailRow && (
        <AchievementDetailModal
          def={detailRow.def}
          unlockedAt={detailRow.unlockedAt}
          mvpCard={detailRow.mvpCard}
          fpTier={detailRow.fpTier}
          totalFp={detailRow.totalFp}
          season={detailRow.season}
          sourceHandId={detailRow.sourceHandId}
          isLocked={!detailRow.unlockedAt}
          onClose={() => setDetailRow(null)}
        />
      )}
    </div>
  );
}

function ComparisonRow({ myCount, theirCount, overlap, total }: {
  myCount: number; theirCount: number; overlap: number; total: number;
}) {
  return (
    <div style={{
      background: "rgba(255,177,74,0.06)",
      border: "1px solid rgba(255,177,74,0.2)",
      borderRadius: 10,
      padding: "8px 12px",
      fontSize: 12,
      color: "rgba(255,255,255,0.7)",
      lineHeight: 1.5,
    }}>
      You: <strong style={{ color: "#FFB14A" }}>{myCount}</strong>
      {" · "}
      They: <strong style={{ color: "#FFB14A" }}>{theirCount}</strong>
      {" · "}
      <strong style={{ color: "#86efac" }}>{overlap} in common</strong>
      <span style={{ color: "rgba(255,255,255,0.3)" }}> / {total} total</span>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8,
      padding: "5px 10px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: "#EAF0FF" }}>{value}</div>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

export function AchievementWall(props: AchievementWallProps) {
  return props.isSelf
    ? <OwnWall {...props} />
    : <OtherWall {...props} targetUserId={props.targetUserId!} />;
}
