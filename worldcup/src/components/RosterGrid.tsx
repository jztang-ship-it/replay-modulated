/**
 * worldcup/src/components/RosterGrid.tsx
 * Thin wrapper around shared RosterGrid — sets columns=2 and CardComponent=PlayerCard.
 * All grid/reveal/spotlight logic lives in shared/components/RosterGrid.tsx.
 */

import React from "react";
import { RosterGrid as SharedRosterGrid, type RosterGridCardProps } from "@shared/components/RosterGrid";
import { PlayerCard as PlayerCardComponent } from "./PlayerCard";

export function RosterGrid(props: Omit<Parameters<typeof SharedRosterGrid>[0], "columns" | "CardComponent">) {
  return (
    <SharedRosterGrid
      {...props}
      columns={2}
      CardComponent={PlayerCardComponent as React.ComponentType<RosterGridCardProps>}
    />
  );
}