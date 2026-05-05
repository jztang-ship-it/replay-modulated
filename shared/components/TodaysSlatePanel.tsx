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

  // Headliner: the top bonus player (sorted DESC by bonus by the adapter).
  const headliner = adapter.bonusPlayers[0];
  const otherBonus = adapter.bonusPlayers.slice(1);

  return (
    <section className="slate-panel" data-testid="todays-slate-panel">
      {adapter.signature && (
        <div
          className="slate-panel__signature"
          data-testid="slate-signature"
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(201,168,76,0.85)",
            marginBottom: 6,
          }}
        >
          {adapter.signature.label}
        </div>
      )}

      {adapter.themeMetadata && (
        <header className="slate-panel__theme" data-testid="slate-theme-banner">
          <h3>{adapter.themeMetadata.displayName}</h3>
          <p>{adapter.themeMetadata.description}</p>
        </header>
      )}

      <div className="slate-panel__countdown" data-testid="slate-countdown">
        Today's slate refreshes in {formatBonusCountdown(adapter.msUntilRotation)}
      </div>

      {headliner && (
        <div
          className="slate-panel__headliner"
          data-testid="slate-headliner"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 14px",
            margin: "12px 0",
            borderRadius: 14,
            background: "linear-gradient(120deg, rgba(255,215,0,0.12), rgba(255,215,0,0.04))",
            border: "1px solid rgba(255,215,0,0.35)",
            boxShadow: "0 4px 18px rgba(255,215,0,0.08)",
          }}
        >
          <button
            type="button"
            onClick={() => adapter.onCardTap?.(headliner.id)}
            data-testid={`headliner-${headliner.id}`}
            style={{
              all: "unset",
              cursor: adapter.onCardTap ? "pointer" : "default",
              transform: "scale(1.35)",
              transformOrigin: "center",
              padding: "0 10px",
              flex: "0 0 auto",
            }}
          >
            <adapter.CardThumb playerId={headliner.id} isAnchor={false} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,215,0,0.9)",
                marginBottom: 2,
              }}
            >
              Today's Headliner
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#F0F2F5", lineHeight: 1.2 }}>
              {headliner.name}
            </div>
            <div
              style={{
                marginTop: 4,
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.04em",
                color: "#0A0E18",
                background: "#FFD700",
              }}
            >
              +{headliner.bonus} FP bonus
            </div>
          </div>
        </div>
      )}

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

      {otherBonus.length > 0 && (
        <div className="slate-panel__bonus">
          <h4>Today's bonus players</h4>
          <div className="slate-panel__grid">
            {otherBonus.map(p => (
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
