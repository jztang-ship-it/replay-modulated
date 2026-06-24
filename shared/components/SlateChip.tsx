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
  /** Optional "Slate #145"-style identity label. When omitted, the chip
   *  renders "<season> · <N> players" with no leading separator. */
  label?: string;
  /** Total player count across slate (anchor + bonus + rotating). */
  playerCount: number;
  /** Slate panel content rendered inside the overlay when opened. */
  children: React.ReactNode;
  /** Optional sport key for analytics dimension. */
  sportKey?: string;
  /** Optional season label (e.g. "2024-25") shown alongside the chip
   *  identity. For per-season pools (basketball's daily season pick),
   *  this is what tells the user *which* year today's pool is from. */
  seasonLabel?: string;
}

export function SlateChip({ label, playerCount, children, sportKey, seasonLabel }: SlateChipProps) {
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
          // v2 substance: a more present NEUTRAL raised fill + clearer border +
          // a dark bottom edge for depth, so the chip reads as a pressable
          // control (year = neutral substance; BOSS pill = the gold focal).
          padding: "5px 11px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.09)",
          border: "1px solid rgba(255,255,255,0.16)",
          borderBottom: "1px solid rgba(0,0,0,0.28)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
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
        {/* Leading cards glyph (muted) — makes "tappable" unmistakable and
            pairs with the BOSS pill's crown. Inline SVG (no icon dep). */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.6)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true" style={{ flexShrink: 0 }}>
          <rect x="8" y="3" width="11" height="16" rx="2" />
          <path d="M5 6.5v11a2 2 0 0 0 2 2h7" />
        </svg>
        {label && <span style={{ color: "#C9A84C", fontWeight: 900 }}>{label}</span>}
        {seasonLabel && (
          <>
            {label && <span aria-hidden="true" style={{ opacity: 0.6 }}>·</span>}
            <span style={{ color: "#FFFFFF", fontWeight: 900 }}>{seasonLabel}</span>
          </>
        )}
        {(label || seasonLabel) && <span aria-hidden="true" style={{ opacity: 0.6 }}>·</span>}
        <span style={{ fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,0.62)" }}>{playerCount} players</span>
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
            // Mirrors the Legend modal styling in shared/components/GameBar.tsx
            // (LegendModal): backdrop blur + slide-up sheet with drag handle.
            position: "fixed",
            inset: 0,
            zIndex: 9000,
            background: "rgba(0,0,0,0.80)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: "10vh",
            paddingLeft: 16,
            paddingRight: 16,
            animation: "slateChipFadeInBg 200ms ease",
          }}
        >
          <style>{`
            @keyframes slateChipFadeInBg { from{opacity:0} to{opacity:1} }
            @keyframes slateChipSlideUp  { from{transform:translateY(100%)} to{transform:translateY(0)} }
          `}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "linear-gradient(160deg,#0E1628 0%,#080E1C 100%)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 18,
              width: "100%",
              maxWidth: 380,
              maxHeight: "78vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
              animation: "slateChipSlideUp 250ms cubic-bezier(.2,.9,.4,1)",
              fontFamily: "'Inter', system-ui, sans-serif",
              color: "#F0F2F5",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.18)" }} />
            </div>
            <div
              style={{
                padding: "0 16px 0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  letterSpacing: 1,
                  color: "#C9A84C",
                  textTransform: "uppercase",
                }}
              >
                {label}{seasonLabel ? <span style={{ color: "#FFFFFF", marginLeft: 8 }}>· {seasonLabel}</span> : null}
              </span>
              <button
                type="button"
                onClick={handleClose}
                data-testid="slate-chip-close"
                aria-label="Close slate"
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 22,
                  cursor: "pointer",
                  padding: "4px 8px",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 20px" }}>
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
