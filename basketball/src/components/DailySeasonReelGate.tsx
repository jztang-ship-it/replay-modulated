/**
 * basketball/src/components/DailySeasonReelGate.tsx
 *
 * Wraps the game view with a once-per-UTC-day "season reel" reveal. On the
 * first game entry of the day, the reel animates and lands on the
 * predetermined season picked by `pickTodaysSeason`. On subsequent entries
 * within the same UTC day, the gate is transparent — children render
 * immediately.
 *
 * This component is intentionally cosmetic in this PR — it animates the
 * reveal and stores the picked season in localStorage, but the data layer
 * still loads the legacy single-season pool. Wiring the picked season into
 * the slate selector is the follow-up PR.
 */

import { useEffect, useState } from "react";
import {
  loadSeasonsManifest,
  manifestLabelsChronological,
  pickTodaysSeason,
  type SeasonsManifest,
  type SeasonManifestEntry,
} from "@shared/utils/seasonPicker";
import { getDailyBonusDateKey } from "@shared/utils/dailyBonus";
import { SeasonReel } from "@shared/components/SeasonReel";

const MANIFEST_URL = "/basketball/data/seasons/_manifest.json";
const TODAYS_PICK_KEY = "replaymod_todays_season_pick_basketball";

type Stored = { dateKey: string; seasonKey: string; seasonLabel: string };

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(TODAYS_PICK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.dateKey || !parsed?.seasonKey) return null;
    return parsed as Stored;
  } catch {
    return null;
  }
}

function writeStored(s: Stored): void {
  try { localStorage.setItem(TODAYS_PICK_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

type Props = {
  /** When true (e.g. FTUE active), the reel is bypassed entirely. */
  bypass?: boolean;
  children: React.ReactNode;
};

export function DailySeasonReelGate({ bypass = false, children }: Props) {
  const [manifest, setManifest] = useState<SeasonsManifest | null>(null);
  const [pick, setPick] = useState<SeasonManifestEntry | null>(null);
  // null = unresolved; true = show reel; false = skip reel
  const [shouldShowReel, setShouldShowReel] = useState<boolean | null>(null);

  // Resolve "should we show the reel?" on mount.
  useEffect(() => {
    if (bypass) {
      setShouldShowReel(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const m = await loadSeasonsManifest(MANIFEST_URL);
        if (cancelled) return;
        setManifest(m);

        const today = new Date();
        const todaysPick = pickTodaysSeason("basketball", today, m);
        if (!todaysPick) {
          setShouldShowReel(false);
          return;
        }
        setPick(todaysPick);

        const dateKey = getDailyBonusDateKey(today);
        const stored = readStored();
        const alreadySeenToday = stored?.dateKey === dateKey;
        setShouldShowReel(!alreadySeenToday);

        // Always (re)write the stored pick — it's the source of truth for
        // "what season was rolled for today" used by the data layer in the
        // follow-up PR. Cheap to write.
        writeStored({ dateKey, seasonKey: todaysPick.key, seasonLabel: todaysPick.label });
      } catch (e) {
        // Manifest unavailable — fail open. Don't block gameplay; just skip
        // the reveal animation. The data layer's existing fallback (legacy
        // single-season pool) will pick up the slack.
        console.warn("[DailySeasonReelGate] manifest load failed; skipping reel:", e);
        if (!cancelled) setShouldShowReel(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bypass]);

  // Block rendering until we know whether to show the reel — avoids the
  // child mounting briefly, then being covered, then becoming interactive.
  if (shouldShowReel === null) {
    // Loading manifest. Render nothing rather than flicker; if this hangs
    // we fail-open after fetch resolves.
    return null;
  }

  if (shouldShowReel && manifest && pick) {
    const labels = manifestLabelsChronological(manifest);
    return (
      <>
        {children}
        <SeasonReel
          labels={labels}
          targetLabel={pick.label}
          onComplete={() => setShouldShowReel(false)}
        />
      </>
    );
  }

  return <>{children}</>;
}
