/**
 * basketball/src/components/LandingPage.tsx — sport-specific shim.
 *
 * Renders @shared/components/LandingPage with a basketball-flavored adapter:
 * the demo card list, the AthleteCard renderer, NBA headshot URL builder,
 * a 3x2 grid, and the crowd-bed audio. Tier is derived from salary because
 * basketball doesn't ship per-card tier overrides on the landing page.
 */
import { useMemo } from "react";
import { LandingPage as SharedLandingPage } from "@shared/components/LandingPage";
import type { LandingAdapter, LandingCardDef } from "@shared/components/LandingPage";
import { AthleteCard } from "./AthleteCard";
import { headshotUrl } from "@shared/utils/headshotUrl";
import { tierFromSalary, DEFAULT_ECONOMY_CONFIG } from "@shared/engines/economyEngine";

const CARDS: LandingCardDef[] = [
  {
    id: "c1", name: "Ja Morant", pos: "PG", salary: 55, fp: 48.2,
    team: "MEM", season: "2024-25", basePlayerId: "1629630",
    achievements: [
      { id: "MAESTRO", icon: "🎼", label: "Maestro", fp: 8 },
      { id: "PURE", icon: "🎯", label: "Pure", fp: 3 },
    ],
  },
  {
    id: "c2", name: "Stephen Curry", pos: "PG", salary: 57, fp: 77.8,
    team: "GSW", season: "2024-25", basePlayerId: "201939",
    achievements: [
      { id: "FIRE", icon: "🔥", label: "Fire", fp: 5 },
      { id: "DIME", icon: "🧠", label: "Dime", fp: 5 },
    ],
  },
  {
    id: "c3", name: "Jayson Tatum", pos: "SF", salary: 66, fp: 62.1,
    team: "BOS", season: "2024-25", basePlayerId: "1628369",
    achievements: [
      { id: "GOD_MODE", icon: "⚡", label: "God Mode", fp: 10 },
      { id: "WIZARD", icon: "🪄", label: "Wizard", fp: 5 },
    ],
  },
  {
    id: "c4", name: "LeBron James", pos: "SF", salary: 67, fp: 89.5,
    team: "LAL", season: "2024-25", basePlayerId: "2544",
    achievements: [
      { id: "GOD_MODE", icon: "⚡", label: "God Mode", fp: 10 },
      { id: "QUAD_DBL", icon: "🦕", label: "Quad Double", fp: 30 },
    ],
  },
  {
    id: "c5", name: "Anthony Edwards", pos: "SG", salary: 62, fp: 64.8,
    team: "MIN", season: "2024-25", basePlayerId: "1630162",
    achievements: [
      { id: "FIRE", icon: "🔥", label: "Fire", fp: 5 },
      { id: "TRIPLE_DBL", icon: "👑", label: "Triple Double", fp: 8 },
    ],
  },
  {
    id: "c6", name: "Kevin Durant", pos: "SF", salary: 60, fp: 71.2,
    team: "PHX", season: "2024-25", basePlayerId: "201142",
    achievements: [
      { id: "BUCKET", icon: "🏀", label: "Bucket", fp: 2 },
      { id: "DOUBLE_DBL", icon: "✌️", label: "Double Double", fp: 2 },
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
    landingHeadshotUrl: headshotUrl,
    landingCardComponent: AthleteCard,
    landingGridLayout: { templateColumns: "repeat(3, minmax(0, 1fr))" },
    landingAudioBedSrc: "/audio/basketball/crowd/bed-murmur.mp3",
    landingTierFor: (d) => tierFromSalary(d.salary, DEFAULT_ECONOMY_CONFIG),
  }), []);

  return (
    <SharedLandingPage adapter={adapter} onPlay={onPlay} onShowProfile={onShowProfile} onShowSignIn={onShowSignIn} />
  );
}
