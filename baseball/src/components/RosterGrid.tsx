/**
 * baseball/src/components/RosterGrid.tsx
 * Thin wrapper — sets columns=3 and CardComponent=BaseballCard.
 */
import React from "react";
import { RosterGrid as SharedRosterGrid, type RosterGridCardProps } from "@shared/components/RosterGrid";
import { BaseballCard } from "./BaseballCard";

export function RosterGrid(props: Omit<Parameters<typeof SharedRosterGrid>[0], "columns" | "CardComponent">) {
  return (
    <SharedRosterGrid
      {...props}
      columns={3}
      CardComponent={BaseballCard as React.ComponentType<RosterGridCardProps>}
    />
  );
}
