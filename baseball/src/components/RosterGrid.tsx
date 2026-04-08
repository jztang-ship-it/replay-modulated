/**
 * baseball/src/components/RosterGrid.tsx
 * Thin wrapper — sets columns=3, CardComponent=BaseballCard, and applies a
 * "dice-5" layout override so the single pitcher slot sits centered between
 * the two BAT columns:
 *
 *   col 1       col 2       col 3
 *   BAT (s1)                BAT (s3)
 *               P (s0)
 *   BAT (s2)                BAT (s4)
 *
 * Slot 0 = P per baseballConfig.rosterSlots. The shared RosterGrid sets
 * `data-slot={slotIndex}` on each card wrapper, so we override placement
 * from CSS without touching shared code.
 */
import React from "react";
import { RosterGrid as SharedRosterGrid, type RosterGridCardProps } from "@shared/components/RosterGrid";
import { BaseballCard } from "./BaseballCard";

export function RosterGrid(props: Omit<Parameters<typeof SharedRosterGrid>[0], "columns" | "CardComponent">) {
  return (
    <div className="bb-dice5">
      <style>{`
        /* Dice-5 layout: P centered in col 2, BAT stacked in cols 1 & 3 */
        .bb-dice5 > .roster-grid {
          grid-template-rows: 1fr 1fr;
          row-gap: 8px;
        }
        /* Slot 0 = P — centered between col 1 & col 3, spans both rows */
        .bb-dice5 > .roster-grid > .card-slot[data-slot="0"] {
          grid-column: 2;
          grid-row: 1 / span 2;
          align-self: center;
        }
        /* Slot 1 = BAT — col 1 row 1 */
        .bb-dice5 > .roster-grid > .card-slot[data-slot="1"] {
          grid-column: 1;
          grid-row: 1;
        }
        /* Slot 2 = BAT — col 1 row 2 */
        .bb-dice5 > .roster-grid > .card-slot[data-slot="2"] {
          grid-column: 1;
          grid-row: 2;
        }
        /* Slot 3 = BAT — col 3 row 1 */
        .bb-dice5 > .roster-grid > .card-slot[data-slot="3"] {
          grid-column: 3;
          grid-row: 1;
        }
        /* Slot 4 = BAT — col 3 row 2 */
        .bb-dice5 > .roster-grid > .card-slot[data-slot="4"] {
          grid-column: 3;
          grid-row: 2;
        }
      `}</style>
      <SharedRosterGrid
        {...props}
        columns={3}
        CardComponent={BaseballCard as React.ComponentType<RosterGridCardProps>}
      />
    </div>
  );
}
