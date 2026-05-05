/**
 * shared/components/SlateChip.tsx
 *
 * Persistent in-game pill showing today's slate identity. Tap to open
 * an overlay containing the sport-bound TodaysSlatePanel.
 *
 * Sport-agnostic: takes a label (e.g., "Slate #145"), a player-count
 * total, and the panel component as `children`. The sport wrapper
 * decides what slate-panel to show in the overlay.
 *
 * Pre-beta: callers must gate by isSlateV2Enabled(sportKey). This
 * component never reads feature flags itself.
 */

import { useCallback, useEffect, useState } from "react";
import { track } from "@shared/analytics/analytics";

interface SlateChipProps {
  /** "Slate #145" or similar identity label. */
  label: string;
  /** Total player count across slate (anchor + bonus + rotating). */
  playerCount: number;
  /** Slate panel content rendered inside the overlay when opened. */
  children: React.ReactNode;
  /** Optional sport key for analytics dimension. */
  sportKey?: string;
}

export function SlateChip({ label, playerCount, children, sportKey }: SlateChipProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => {
    setOpen(true);
    track("slate", "slate_chip_opened", {
      sport: sportKey ?? null,
      slate_label: label,
      player_count: playerCount,
    });
  }, [label, playerCount, sportKey]);

  const handleClose = useCallback(() => setOpen(false), []);

  // Lock body scroll while overlay is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="slate-chip"
        data-testid="slate-chip"
        onClick={handleOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(201,168,76,0.10)",
          border: "1px solid rgba(201,168,76,0.45)",
          color: "#F0F2F5",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.04em",
          cursor: "pointer",
          whiteSpace: "nowrap",
          lineHeight: 1.1,
        }}
      >
        <span style={{ color: "#C9A84C", fontWeight: 900 }}>{label}</span>
        <span aria-hidden="true" style={{ opacity: 0.6 }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{playerCount} players</span>
      </button>

      {open && (
        <div
          className="slate-chip__overlay"
          data-testid="slate-chip-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Today's slate"
          onClick={handleClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9000,
            background: "rgba(0,0,0,0.72)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            backdropFilter: "blur(6px)",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "85dvh",
              overflowY: "auto",
              background: "rgba(7,10,18,0.98)",
              color: "#F0F2F5",
              borderTop: "1px solid rgba(255,255,255,0.12)",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              fontFamily: "'Inter', system-ui, sans-serif",
              padding: "12px 16px 24px",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#C9A84C",
                }}
              >
                Today's Slate
              </span>
              <button
                type="button"
                onClick={handleClose}
                data-testid="slate-chip-close"
                aria-label="Close slate"
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(240,242,245,0.7)",
                  fontSize: 18,
                  fontWeight: 700,
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
