/**
 * basketball/src/components/LandingPage.tsx — sport-specific shim.
 *
 * Renders @shared/components/LandingPage with a basketball-flavored adapter:
 * the demo card list, the AthleteCard renderer, NBA headshot URL builder,
 * a 3x2 grid, and the crowd-bed audio. Tier is derived from salary because
 * basketball doesn't ship per-card tier overrides on the landing page.
 */
import { useEffect, useMemo, useState } from "react";
import { LandingPage as SharedLandingPage } from "@shared/components/LandingPage";
import type { LandingAdapter, LandingCardDef } from "@shared/components/LandingPage";
import { AthleteCard } from "./AthleteCard";
import { headshotUrl } from "@shared/utils/headshotUrl";
import { tierFromSalary, DEFAULT_ECONOMY_CONFIG } from "@shared/engines/economyEngine";
import { isSlateV2Enabled } from "@shared/featureFlags";
import { BasketballSlatePanel, useAutoExpandOncePerDay } from "./BasketballSlatePanel";

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

  // Pre-beta: only show the slate panel when the per-sport flag is ON.
  // The drawer (and all slate-related hooks/effects) live inside <SlateDrawer />
  // so they only execute when the component is mounted — i.e. when the flag is
  // ON. With the flag OFF, no slate code runs from the landing path.
  const slateEnabled = isSlateV2Enabled("basketball");

  return (
    <>
      <SharedLandingPage adapter={adapter} onPlay={onPlay} onShowProfile={onShowProfile} onShowSignIn={onShowSignIn} />
      {slateEnabled && <SlateDrawer />}
    </>
  );
}

/**
 * Slate drawer — only mounted when the slate-v2 flag is ON for basketball.
 * Co-locating the hook calls inside this sub-component (rather than calling
 * them unconditionally in <LandingPage>) ensures useAutoExpandOncePerDay's
 * localStorage write and dynamic dailyBonus import never run with flag OFF.
 *
 * Styling mirrors the Legend modal in shared/components/GameBar.tsx — backdrop
 * blur + slide-up sheet with drag handle. Auto-expand-once-per-day on first
 * landing of the day; tap backdrop / Escape / × button to dismiss.
 */
function SlateDrawer() {
  const autoOpen = useAutoExpandOncePerDay("basketball");
  const [open, setOpen] = useState(false);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);

  // Lock body scroll while overlay is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape.
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
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(0,0,0,0.80)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: "10vh",
        paddingLeft: 16,
        paddingRight: 16,
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
          borderRadius: 18,
          width: "100%",
          maxWidth: 380,
          maxHeight: "78vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
          animation: "slatePanelSlideUp 250ms cubic-bezier(.2,.9,.4,1)",
          fontFamily: "'Inter', system-ui, sans-serif",
          color: "#F0F2F5",
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
          <BasketballSlatePanel />
        </div>
      </div>
    </div>
  );
}
