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

import { useEffect, useState } from "react";
import { formatBonusCountdown } from "../utils/dailyBonus";
import { track } from "@shared/analytics/analytics";
import type { TierColor } from "../types";

export type SlatePanelAdapter = {
  themeMetadata: { displayName: string; description: string; iconKey?: string } | null;
  anchors: Array<{ id: string; name: string; tier: TierColor }>;
  bonusPlayers: Array<{ id: string; name: string; bonus: 5 | 10 | 20 }>;
  rotatingCount: number;
  msUntilRotation: number;
  CardThumb: React.FC<{ playerId: string; isAnchor: boolean }>;
  fullSlatePlayers: Array<{ id: string; name: string; tier: TierColor; isAnchor: boolean }>;
  onCardTap?: (playerId: string) => void;
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

  return (
    <section className="slate-panel" data-testid="todays-slate-panel">
      {adapter.themeMetadata && (
        <header className="slate-panel__theme" data-testid="slate-theme-banner">
          <h3>{adapter.themeMetadata.displayName}</h3>
          <p>{adapter.themeMetadata.description}</p>
        </header>
      )}

      <div className="slate-panel__countdown" data-testid="slate-countdown">
        Today's slate refreshes in {formatBonusCountdown(adapter.msUntilRotation)}
      </div>

      <div className="slate-panel__anchors">
        <h4>Always in today's deck</h4>
        <div className="slate-panel__grid">
          {adapter.anchors.map(p => (
            <button
              key={p.id}
              type="button"
              className="slate-panel__card"
              onClick={() => adapter.onCardTap?.(p.id)}
              data-anchor="true"
            >
              <adapter.CardThumb playerId={p.id} isAnchor={true} />
            </button>
          ))}
        </div>
      </div>

      {adapter.bonusPlayers.length > 0 && (
        <div className="slate-panel__bonus">
          <h4>Today's bonus players</h4>
          <div className="slate-panel__grid">
            {adapter.bonusPlayers.map(p => (
              <button
                key={p.id}
                type="button"
                className="slate-panel__card"
                onClick={() => adapter.onCardTap?.(p.id)}
              >
                <adapter.CardThumb playerId={p.id} isAnchor={false} />
                <span className="slate-panel__bonus-badge">+{p.bonus} FP</span>
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
      >
        {expanded ? "Hide full slate" : "See full slate"}
      </button>

      {expanded && (
        <div className="slate-panel__full" data-testid="slate-full-list">
          {adapter.fullSlatePlayers.map(p => (
            <button
              key={p.id}
              type="button"
              className="slate-panel__card slate-panel__card--small"
              onClick={() => adapter.onCardTap?.(p.id)}
              data-anchor={p.isAnchor ? "true" : "false"}
            >
              <adapter.CardThumb playerId={p.id} isAnchor={p.isAnchor} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
