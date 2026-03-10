/**
 * basketball/src/components/RosterGrid.tsx
 * Thin wrapper around shared RosterGrid — sets columns=3 and CardComponent=AthleteCard.
 * All grid/reveal/spotlight logic lives in shared/components/RosterGrid.tsx.
 */

import React from "react";
import { RosterGrid as SharedRosterGrid, type RosterGridCardProps } from "@shared/components/RosterGrid";
import { AthleteCard } from "./AthleteCard";

export function RosterGrid(props: Omit<Parameters<typeof SharedRosterGrid>[0], "columns" | "CardComponent">) {
  return (
    <SharedRosterGrid
      {...props}
      columns={3}
      CardComponent={AthleteCard as React.ComponentType<RosterGridCardProps>}
    />
  );
}