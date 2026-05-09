/**
 * shared/components/TodaysSlatePanel.tsx
 *
 * Sport-agnostic UI for today's slate. Default content: anchors + bonus
 * players + countdown + rotating-count summary. "See full slate" toggle
 * (default collapsed) reveals the full slate.
 *
 * Placement contract: collapsible drawer, never a blocking modal.
 * No user-facing copy mentions a "limit" or "cap." Copy referring to
 * Top Games clarifies that historical performances may surface players
 * outside today's slate.
 */

import { useEffect, useMemo, useState } from "react";
import { formatBonusCountdown } from "../utils/dailyBonus";
import { track } from "@shared/analytics/analytics";
import type { TierColor } from "../types";
import { tierRank } from "@shared/theme";

export type SlatePanelAdapter = {
  themeMetadata: { displayName: string; description: string; iconKey?: string } | null;
  anchors: Array<{ id: string; name: string; tier: TierColor }>;
  bonusPlayers: Array<{ id: string; name: string; tier: TierColor; bonus: 5 | 10 | 20 }>;
  rotatingCount: number;
  msUntilRotation: number;
  CardThumb: React.FC<{ playerId: string; isAnchor: boolean }>;
  fullSlatePlayers: Array<{ id: string; name: string; tier: TierColor; isAnchor: boolean }>;
  onCardTap?: (playerId: string) => void;
  /** Optional slate identity ("Slate #145"). Backward-compatible: omit
   *  to skip the signature line. */
  signature?: { number: number; label: string };
};

export function TodaysSlatePanel({ adapter }: { adapter: SlatePanelAdapter }) {
  const [expanded, setExpanded] = useState(false);

  // Fire once on mount — panel impressions for funnel analysis.
  useEffect(() => {
    track("slate", "slate_panel_opened", {
      theme_key: adapter.themeMetadata?.iconKey ?? null,
      anchor_count: adapter.anchors.length,
      bonus_count: adapter.bonusPlayers.length,
      rotating_count: adapter.rotatingCount,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExpandToggle = () => {
    setExpanded(prev => {
      const next = !prev;
      // Only fire when expanding open — not on collapse.
      if (next) {
        track("slate", "slate_full_view_expanded", {
          full_slate_count: adapter.fullSlatePlayers.length,
        });
      }
      return next;
    });
  };

  // All 3 bonus players (sorted DESC by bonus by the adapter: 20, 10, 5).
  // Rendered together in a uniform 3-column grid below.
  const bonusPlayers = adapter.bonusPlayers;

  // Anchors and the full-slate list both render top-tier first
  // (RED → ORANGE → PURPLE → BLUE → GREEN). Sort here at render time so
  // each sport adapter doesn't have to bake the order in.
  const sortedAnchors = useMemo(
    () => [...adapter.anchors].sort((a, b) => tierRank(a.tier) - tierRank(b.tier)),
    [adapter.anchors],
  );
  const sortedFullSlate = useMemo(
    () => [...adapter.fullSlatePlayers].sort((a, b) => tierRank(a.tier) - tierRank(b.tier)),
    [adapter.fullSlatePlayers],
  );

  return (
    <section className="slate-panel" data-testid="todays-slate-panel">
      {/* SlateChip's overlay header already shows {label} (e.g. "Slate #145"),
          so the panel-internal signature is redundant — dropped to avoid the
          duplicate "Slate #N" the user spotted in the overlay. */}

      {adapter.themeMetadata && (
        <header className="slate-panel__theme" data-testid="slate-theme-banner">
          <h3>{adapter.themeMetadata.displayName}</h3>
          <p>{adapter.themeMetadata.description}</p>
        </header>
      )}

      <div className="slate-panel__countdown" data-testid="slate-countdown">
        Refreshes in {formatBonusCountdown(adapter.msUntilRotation)}
      </div>

      <div className="slate-panel__anchors">
        <h4>Always in today's deck</h4>
        <div
          className="slate-panel__grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
          }}
        >
          {sortedAnchors.map(p => (
            <button
              key={p.id}
              type="button"
              className="slate-panel__card"
              onClick={() => adapter.onCardTap?.(p.id)}
              data-anchor="true"
              data-tier={p.tier}
              style={{
                all: "unset",
                cursor: adapter.onCardTap ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: 6,
                borderRadius: 10,
                minWidth: 0,
              }}
            >
              <adapter.CardThumb playerId={p.id} isAnchor={true} />
            </button>
          ))}
        </div>
      </div>

      {bonusPlayers.length > 0 && (
        <div
          className="slate-panel__bonus"
          data-testid="slate-bonus"
          style={{ marginTop: 14 }}
        >
          <h4>Today's Bonus</h4>
          <div
            className="slate-panel__grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              alignItems: "stretch",
            }}
          >
            {bonusPlayers.map(p => (
              <button
                key={p.id}
                type="button"
                className="slate-panel__card"
                onClick={() => adapter.onCardTap?.(p.id)}
                data-testid={`slate-bonus-${p.id}`}
                data-tier={p.tier}
                style={{
                  all: "unset",
                  cursor: adapter.onCardTap ? "pointer" : "default",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: "8px 6px 10px",
                  borderRadius: 12,
                  // Subtle gold tint on the body marks the bonus row;
                  // tier color shows on the avatar circle inside the
                  // CardThumb, not on the card body.
                  background: "rgba(255,215,0,0.07)",
                  border: "1.5px solid rgba(255,215,0,0.55)",
                  boxShadow: "0 0 0 1px rgba(255,215,0,0.25)",
                  minWidth: 0,
                  textAlign: "center",
                }}
              >
                <adapter.CardThumb playerId={p.id} isAnchor={false} />
                <span
                  className="slate-panel__bonus-badge"
                  style={{
                    marginTop: 2,
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: "0.04em",
                    color: "#0A0E18",
                    background: "#FFD700",
                    whiteSpace: "nowrap",
                  }}
                >
                  +{p.bonus} FP
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="slate-panel__discover">
        Plus {adapter.rotatingCount} more players rotating in today's slate.
        Start a hand to discover them. Top Games can still surface notable
        historical performances from the full library.
      </p>

      <button
        type="button"
        className="slate-panel__expand"
        onClick={handleExpandToggle}
        data-testid="slate-expand-toggle"
        aria-expanded={expanded}
        style={{
          marginTop: 12,
          width: "100%",
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(201,168,76,0.55)",
          background: "rgba(201,168,76,0.12)",
          color: "#FFEA86",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        {expanded ? "Hide full slate" : "See full slate"}
      </button>

      {expanded && (
        <div
          className="slate-panel__full"
          data-testid="slate-full-list"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
            marginTop: 10,
          }}
        >
          {sortedFullSlate.map(p => (
            <button
              key={p.id}
              type="button"
              className="slate-panel__card slate-panel__card--small"
              onClick={() => adapter.onCardTap?.(p.id)}
              data-anchor={p.isAnchor ? "true" : "false"}
              data-tier={p.tier}
              style={{
                all: "unset",
                cursor: adapter.onCardTap ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: 4,
                borderRadius: 8,
                minWidth: 0,
              }}
            >
              <adapter.CardThumb playerId={p.id} isAnchor={p.isAnchor} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
