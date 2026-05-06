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
import { useEffect, useMemo, useState } from "react";
import { LandingPage as SharedLandingPage } from "@shared/components/LandingPage";
import type { LandingAdapter, LandingCardDef } from "@shared/components/LandingPage";
import { SoccerCard } from "./SoccerCard";
import { tierFromSalary, DEFAULT_ECONOMY_CONFIG } from "@shared/engines/economyEngine";
import { isSlateV2Enabled } from "@shared/featureFlags";
import { FootballSlatePanel, useAutoExpandOncePerDay } from "./FootballSlatePanel";

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
    // Same TierColor narrowness as in GameView.tsx — football's local PlayerCard
    // type omits "RED" while shared's includes it. Football data never produces
    // RED tier cards. Cast bridges the structural mismatch safely.
    landingCardComponent: SoccerCard as unknown as LandingAdapter["landingCardComponent"],
    landingGridLayout: { templateColumns: "repeat(3, minmax(0, 1fr))" },
    landingAudioBedSrc: null,
    landingTierFor: (d) => tierFromSalary(d.salary, DEFAULT_ECONOMY_CONFIG),
  }), []);

  // Pre-beta: only show the slate drawer when the per-sport flag is ON.
  // SlateDrawer's hooks/effects only run when it's mounted — flag OFF =
  // zero slate code from the landing path.
  const slateEnabled = isSlateV2Enabled("football");

  return (
    <>
      <SharedLandingPage adapter={adapter} onPlay={onPlay} onShowProfile={onShowProfile} onShowSignIn={onShowSignIn} />
      {slateEnabled && <SlateDrawer />}
    </>
  );
}

/**
 * Slate drawer — only mounted when the slate-v2 flag is ON for football.
 * Auto-expands once per UTC day; tap backdrop / Escape / × button to dismiss.
 * Mirrors baseball/src/components/LandingPage.tsx SlateDrawer.
 */
function SlateDrawer() {
  const autoOpen = useAutoExpandOncePerDay("football");
  const [open, setOpen] = useState(false);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="slate-panel-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Today's slate"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.80)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        paddingBottom: "10vh", paddingLeft: 16, paddingRight: 16,
        animation: "slatePanelFadeInBg 200ms ease",
      }}
    >
      <style>{`
        @keyframes slatePanelFadeInBg { from{opacity:0} to{opacity:1} }
        @keyframes slatePanelSlideUp  { from{transform:translateY(100%)} to{transform:translateY(0)} }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(160deg,#0E1628 0%,#080E1C 100%)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 18, width: "100%", maxWidth: 380, maxHeight: "78vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
          animation: "slatePanelSlideUp 250ms cubic-bezier(.2,.9,.4,1)",
          fontFamily: "'Inter', system-ui, sans-serif", color: "#F0F2F5",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.18)" }} />
        </div>
        <div style={{
          padding: "0 16px 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{
            fontSize: 14, fontWeight: 900, letterSpacing: 1,
            color: "#C9A84C", textTransform: "uppercase",
          }}>
            Today's Slate
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close slate"
            style={{
              background: "none", border: "none",
              color: "rgba(255,255,255,0.5)",
              fontSize: 22, cursor: "pointer",
              padding: "4px 8px", lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 20px" }}>
          <FootballSlatePanel />
        </div>
      </div>
    </div>
  );
}
