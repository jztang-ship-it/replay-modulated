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
// Side-effect import — basketball's wrapper calls configurePerSeason() so
// importing it here guarantees the engine is in per-season mode by the
// time we call setActiveSeason.
import "../engines/dataEngine";
import { setActiveSeason } from "@shared/engines/dataEngine";

const MANIFEST_URL = "/basketball/data/seasons/_manifest.json";
const TODAYS_PICK_KEY = "replaymod_todays_season_pick_basketball";
/** When the FTUE bypass is on, pin to the latest season — that's what the
 *  hardcoded FTUE roster expects. Any newer season key takes precedence
 *  if added in the future; this is the conservative default. */
const FTUE_SEASON_KEY = "2425";

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

  // Resolve season pick + reel-or-not on mount. Two responsibilities:
  //   1. Pin the active season on dataEngine BEFORE children render so the
  //      slate selector loads the right season's data.
  //   2. Decide whether to show the visual reel (skipped during FTUE and
  //      after the user has already seen today's reveal).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // FTUE: bypass entirely — pin to the canonical season the FTUE
      // narrative expects, no manifest fetch needed.
      if (bypass) {
        setActiveSeason(FTUE_SEASON_KEY);
        setShouldShowReel(false);
        return;
      }

      try {
        const m = await loadSeasonsManifest(MANIFEST_URL);
        if (cancelled) return;
        setManifest(m);

        const today = new Date();
        const todaysPick = pickTodaysSeason("basketball", today, m);
        if (!todaysPick) {
          // Manifest empty — fall back to FTUE_SEASON_KEY so something loads.
          setActiveSeason(FTUE_SEASON_KEY);
          setShouldShowReel(false);
          return;
        }
        setPick(todaysPick);

        const dateKey = getDailyBonusDateKey(today);
        const stored = readStored();
        // Read BEFORE write so first-of-day shows the reel.
        const alreadySeenToday = stored?.dateKey === dateKey && stored?.seasonKey === todaysPick.key;

        // QA / dev escape hatch — `?reel=force` always plays the reel.
        const forceReel = typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).get("reel") === "force";

        // Pin the season on the dataEngine. Children (GameView) will call
        // ensureLoaded() and get this season's files. Synchronous — no
        // network — so it's set by the time we resolve shouldShowReel.
        setActiveSeason(todaysPick.key);

        writeStored({ dateKey, seasonKey: todaysPick.key, seasonLabel: todaysPick.label });
        setShouldShowReel(forceReel || !alreadySeenToday);
      } catch (e) {
        // Manifest unavailable — fail open. Pin to FTUE_SEASON_KEY so the
        // engine has something to load; skip the reveal.
        console.warn("[DailySeasonReelGate] manifest load failed; using fallback season:", e);
        if (!cancelled) {
          setActiveSeason(FTUE_SEASON_KEY);
          setShouldShowReel(false);
        }
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
