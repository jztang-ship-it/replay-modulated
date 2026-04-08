/**
 * baseball/src/components/RosterGrid.tsx
 * Thin wrapper — sets columns=6, CardComponent=BaseballCard, and applies a
 * 2P+3BAT layout matching baseballConfig.rosterSlots = ["P","P","BAT","BAT","BAT"]:
 *
 *   col 1-2     col 3-4     col 5-6
 *   P (s0)      P (s1)      BAT (s2)    ← row 1: three cards full width
 *
 *       col 2-3     col 4-5
 *       BAT (s3)    BAT (s4)             ← row 2: two cards centered
 *
 * The shared RosterGrid sets `data-slot={slotIndex}` on each card wrapper,
 * so we override placement from CSS without touching shared code.
 */
import React from "react";
import { RosterGrid as SharedRosterGrid, type RosterGridCardProps } from "@shared/components/RosterGrid";
import { BaseballCard } from "./BaseballCard";

export function RosterGrid(props: Omit<Parameters<typeof SharedRosterGrid>[0], "columns" | "CardComponent">) {
  return (
    <div className="bb-dice5">
      <style>{`
        /* 2P + 3BAT layout */
        .bb-dice5 > .roster-grid {
          grid-template-columns: repeat(6, 1fr);
          grid-template-rows: 1fr 1fr;
          row-gap: 8px;
        }
        /* Row 1 — three cards equally spaced */
        .bb-dice5 > .roster-grid > .card-slot[data-slot="0"] { grid-column: 1 / span 2; grid-row: 1; }
        .bb-dice5 > .roster-grid > .card-slot[data-slot="1"] { grid-column: 3 / span 2; grid-row: 1; }
        .bb-dice5 > .roster-grid > .card-slot[data-slot="2"] { grid-column: 5 / span 2; grid-row: 1; }
        /* Row 2 — two cards centered (cols 2-3 and 4-5, leaving col 1 and 6 as margins) */
        .bb-dice5 > .roster-grid > .card-slot[data-slot="3"] { grid-column: 2 / span 2; grid-row: 2; }
        .bb-dice5 > .roster-grid > .card-slot[data-slot="4"] { grid-column: 4 / span 2; grid-row: 2; }
      `}</style>
      <SharedRosterGrid
        {...props}
        columns={6}
        CardComponent={BaseballCard as React.ComponentType<RosterGridCardProps>}
      />
    </div>
  );
}
