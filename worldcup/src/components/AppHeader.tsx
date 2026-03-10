import React from "react";
/**
 * worldcup/src/components/AppHeader.tsx
 * Thin wrapper — shows "World Cup" sport label in shared AppHeader.
 */

import { AppHeader as SharedAppHeader } from "@shared/components/AppHeader";

export function AppHeader() {
  return <SharedAppHeader sportLabel="World Cup" />;
}