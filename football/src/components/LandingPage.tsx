/**
 * football/src/components/LandingPage.tsx — sport-specific shim.
 *
 * Renders @shared/components/LandingPage with a football-flavored adapter:
 * the demo card list, the SoccerCard renderer, no headshot URL (flag + name
 * fallback handled inside SoccerCard's FootballHero), a 3-column grid (3+2
 * layout for the 5 launch cards), and no audio bed at launch. Tier is
 * derived from salary because football doesn't ship per-card tier overrides
 * on the landing page.
 */
import { useMemo } from "react";
import { LandingPage as SharedLandingPage } from "@shared/components/LandingPage";
import type { LandingAdapter, LandingCardDef } from "@shared/components/LandingPage";
import { SoccerCard } from "./SoccerCard";
import { tierFromSalary, DEFAULT_ECONOMY_CONFIG } from "@shared/engines/economyEngine";

const CARDS: LandingCardDef[] = [
  {
    id: "c1", name: "Lionel Messi", pos: "FWD", salary: 60, fp: 55.5,
    team: "Argentina", season: "2018", basePlayerId: "5503",
    achievements: [
      { id: "POACHER", icon: "🎯", label: "Poacher", fp: 15 },
      { id: "CREATOR", icon: "🪄", label: "Creator", fp: 18 },
    ],
  },
  {
    id: "c2", name: "Kylian Mbappé", pos: "FWD", salary: 60, fp: 45.9,
    team: "France", season: "2018", basePlayerId: "3009",
    achievements: [
      { id: "BRACE", icon: "⚡", label: "Brace", fp: 15 },
      { id: "SHARP", icon: "🔫", label: "Sharp", fp: 8 },
    ],
  },
  {
    id: "c3", name: "Vinícius Jr.", pos: "FWD", salary: 47, fp: 26.4,
    team: "Brazil", season: "2022", basePlayerId: "18395",
    achievements: [
      { id: "CREATOR", icon: "🪄", label: "Creator", fp: 18 },
    ],
  },
  {
    id: "c4", name: "Jude Bellingham", pos: "MID", salary: 37, fp: 26.3,
    team: "England", season: "2022", basePlayerId: "30714",
    achievements: [
      { id: "BOX_TO_BOX", icon: "💪", label: "Box-to-Box", fp: 10 },
    ],
  },
  {
    id: "c5", name: "Bukayo Saka", pos: "FWD", salary: 53, fp: 29.7,
    team: "England", season: "2022", basePlayerId: "22084",
    achievements: [
      { id: "POACHER", icon: "🎯", label: "Poacher", fp: 15 },
    ],
  },
];

interface Props {
  onPlay: () => void;
  onShowProfile?: () => void;
  onShowSignIn?: () => void;
}

export function LandingPage({ onPlay, onShowProfile, onShowSignIn }: Props) {
  const adapter = useMemo<LandingAdapter>(() => ({
    landingCards: CARDS,
    landingHeadshotUrl: () => "",
    landingCardComponent: SoccerCard,
    landingGridLayout: { templateColumns: "repeat(3, minmax(0, 1fr))" },
    landingAudioBedSrc: null,
    landingTierFor: (d) => tierFromSalary(d.salary, DEFAULT_ECONOMY_CONFIG),
  }), []);
  return <SharedLandingPage adapter={adapter} onPlay={onPlay} onShowProfile={onShowProfile} onShowSignIn={onShowSignIn} />;
}
