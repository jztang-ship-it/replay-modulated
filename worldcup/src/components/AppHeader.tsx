/**
 * worldcup/src/components/AppHeader.tsx
 * Thin wrapper — shows "World Cup" sport label in shared AppHeader.
 */

import { AppHeader as SharedAppHeader } from "@shared/components/AppHeader";

type Props = {
  onProfile?: () => void;
  onBell?: () => void;
  unreadInboxCount?: number;
};

export function AppHeader({ onProfile, onBell, unreadInboxCount }: Props) {
  return (
    <SharedAppHeader
      sportLabel="World Cup"
      onProfile={onProfile}
      onBell={onBell}
      unreadInboxCount={unreadInboxCount}
    />
  );
}