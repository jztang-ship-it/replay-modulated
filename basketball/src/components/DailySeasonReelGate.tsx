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

import { useEffect, useRef, useState } from "react";
import {
  loadSeasonsManifest,
  manifestLabelsChronological,
  pickTodaysSeason,
  type SeasonsManifest,
  type SeasonManifestEntry,
} from "@shared/utils/seasonPicker";
import { getDailyBonusDateKey } from "@shared/utils/dailyBonus";
import { SeasonReel } from "@shared/components/SeasonReel";
import { SeasonIntroOverlay } from "@shared/components/SeasonIntroOverlay";
// Side-effect import — basketball's wrapper calls configurePerSeason() so
// importing it here guarantees the engine is in per-season mode by the
// time we call setActiveSeason.
import "../engines/dataEngine";
import { setActiveSeason } from "@shared/engines/dataEngine";
import seasonIntros from "../data/seasonIntros.json";

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
  /** When true, append the FTUE follow-up line to the intro overlay
   *  ("Tap the gold icon to see the scoring rules"). Set true on the
   *  first hand after FTUE completes so the user sees the rules pointer
   *  exactly once. Returning users get the intro without the follow-up. */
  showFtueIntroFollowup?: boolean;
  children: React.ReactNode;
};

export function DailySeasonReelGate({ bypass = false, showFtueIntroFollowup = false, children }: Props) {
  const [manifest, setManifest] = useState<SeasonsManifest | null>(null);
  const [pick, setPick] = useState<SeasonManifestEntry | null>(null);
  // null = unresolved; true = show reel; false = skip reel
  const [shouldShowReel, setShouldShowReel] = useState<boolean | null>(null);
  // Independent gate for the season-intro overlay. Shown after the reel
  // completes OR (when reel is skipped because the user already saw it
  // earlier today) shown directly on the first game entry of the day.
  // Storage-keyed by date+seasonKey so it doesn't re-fire mid-day.
  const [showIntro, setShowIntro] = useState<boolean>(false);

  // Track previous bypass value. When bypass transitions true → false
  // (user just finished the FTUE), we want the reel to take over IMMEDIATELY
  // without a frame of game-view rendering in between. Manifest pre-fetched
  // during the FTUE bypass branch so the reel can mount without a network gap.
  const prevBypassRef = useRef(bypass);

  // Resolve season pick + reel-or-not on mount. Two responsibilities:
  //   1. Pin the active season on dataEngine BEFORE children render so the
  //      slate selector loads the right season's data.
  //   2. Decide whether to show the visual reel (skipped during FTUE and
  //      after the user has already seen today's reveal).
  useEffect(() => {
    let cancelled = false;
    // If we're transitioning out of FTUE (bypass true → false), reset the
    // gate to its loading state synchronously so children stop rendering
    // until the reel mounts. Without this, the GameView with the FTUE
    // anchor season (2024-25) flashes for ~1 frame before the reel covers.
    const justExitedFtue = prevBypassRef.current && !bypass;
    prevBypassRef.current = bypass;
    if (justExitedFtue) {
      setShouldShowReel(null);
    }
    (async () => {
      // QA / dev escape hatch — `?reel=force` always plays the reel,
      // even during FTUE. Checked first so the bypass path doesn't
      // short-circuit it.
      const forceReel = typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("reel") === "force";

      // FTUE: bypass entirely — pin to the canonical season the FTUE
      // narrative expects. Pre-fetch the manifest in the background so the
      // reel can fire immediately when FTUE completes (no second wait).
      if (bypass && !forceReel) {
        setActiveSeason(FTUE_SEASON_KEY);
        setShouldShowReel(false);
        loadSeasonsManifest(MANIFEST_URL).catch(() => { /* ignore — caught in main path */ });
        return;
      }

      try {
        const m = await loadSeasonsManifest(MANIFEST_URL);
        if (cancelled) return;
        setManifest(m);

        const today = new Date();
        // QA / dev escape hatch — `?season=KEY` (e.g. `?season=9899`) pins
        // the active season to a specific manifest entry. Falls back to
        // the daily deterministic pick if the key isn't found.
        const seasonOverride = typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("season")
          : null;
        const overridePick = seasonOverride
          ? m.seasons.find(s => s.key === seasonOverride) ?? null
          : null;
        const todaysPick = overridePick ?? pickTodaysSeason("basketball", today, m);
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

        // Pin the season on the dataEngine. Children (GameView) will call
        // ensureLoaded() and get this season's files. Synchronous — no
        // network — so it's set by the time we resolve shouldShowReel.
        setActiveSeason(todaysPick.key);

        writeStored({ dateKey, seasonKey: todaysPick.key, seasonLabel: todaysPick.label });
        const willShow = forceReel || !alreadySeenToday;
        console.info("[DailySeasonReelGate]", {
          forceReel,
          alreadySeenToday,
          willShowReel: willShow,
          pick: todaysPick.label,
          bypass,
        });
        setShouldShowReel(willShow);
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
          onComplete={() => {
            // Reel done → hand off to intro overlay before revealing
            // the game view. setShowIntro first so there's no frame in
            // between the reel and the intro.
            setShowIntro(true);
            setShouldShowReel(false);
          }}
        />
      </>
    );
  }

  // Season intro overlay — shows once after the reel lands. FTUE users get
  // an additional "tap the gold icon" follow-up paragraph.
  if (showIntro && pick) {
    const introText = (seasonIntros as Record<string, string>)[pick.key]
      ?? `Today we're going back to ${pick.label}. Good luck.`;
    return (
      <>
        {children}
        <SeasonIntroOverlay
          seasonLabel={pick.label}
          introText={introText}
          showFtueFollowup={showFtueIntroFollowup}
          onDismiss={() => setShowIntro(false)}
        />
      </>
    );
  }

  return <>{children}</>;
}
