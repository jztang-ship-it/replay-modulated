/**
 * LandingPage.tsx — Single screen, no scroll.
 * 6 cards in a 3x2 grid. Start face-down with TAP prompt.
 * Tap to flip and reveal real in-game card fronts with headshots.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { GamePhase, PlayerCard, Achievement } from "../adapters/types";
import { AthleteCard } from "./AthleteCard";
import { CardBackGeneric } from "./CardBackGeneric";
import { headshotUrl } from "@shared/utils/headshotUrl";
import { soundManager } from "@shared/utils/soundManager";
import { tierFromSalary, DEFAULT_ECONOMY_CONFIG } from "@shared/engines/economyEngine";

// ─── Card definitions ────────────────────────────────────────────────────────

type LandingCardDef = {
  id: string;
  name: string;
  pos: string;
  salary: number;
  fp: number;
  team: string;
  season: string;
  basePlayerId: string;
  achievements: Achievement[];
};

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

// ─── Component ───────────────────────────────────────────────────────────────

interface Props { onPlay: () => void; }

export function LandingPage({ onPlay }: Props) {
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const phase: GamePhase = "RESULTS";
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startAudio = useCallback(() => {
    if (audioRef.current) return;
    if (soundManager.isMuted()) return; // respect global mute
    const a = new Audio("/audio/basketball/crowd/bed-murmur.mp3");
    a.loop = true;
    a.volume = 0.15;
    audioRef.current = a;
    a.play().catch(() => {
      // Autoplay blocked — start on first user interaction
      const resume = () => {
        if (!soundManager.isMuted()) a.play().catch(() => {});
        window.removeEventListener("pointerdown", resume);
      };
      window.addEventListener("pointerdown", resume, { once: true });
    });
  }, []);

  useEffect(() => {
    startAudio();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [startAudio]);

  const handlePlay = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    onPlay();
  }, [onPlay]);

  function toggleCard(id: string) {
    setFlipped(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const playerCards = useMemo(() => {
    return CARDS.map((d, slotIndex) => {
      const cardId = `landing-${d.id}`;
      return {
        cardId,
        basePlayerId: d.basePlayerId,
        photoCode: d.basePlayerId,
        headshotUrl: headshotUrl(d.basePlayerId),
        name: d.name,
        team: d.team,
        season: d.season,
        position: d.pos,
        tier: tierFromSalary(d.salary, DEFAULT_ECONOMY_CONFIG),
        salary: d.salary,
        projectedFp: d.fp,
        actualFp: d.fp,
        fpDelta: 0,
        gameInfo: { date: "", opponent: "", homeAway: "" as any },
        statLine: {},
        achievements: d.achievements,
        slotIndex,
        wasHeld: false,
      } satisfies PlayerCard;
    });
  }, []);

  return (
    <div style={{
      background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
      color: "#F0F2F5",
      fontFamily: "'Inter', system-ui, sans-serif",
      height: "100dvh", maxHeight: "100dvh", overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      <style>{`
        @keyframes lp-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(127,255,0,0); }
          50%     { box-shadow: 0 0 22px 7px rgba(127,255,0,.5); }
        }
        .lp-cta {
          cursor:pointer;
          background: linear-gradient(135deg,#7FFF00 0%,#5BBE00 100%);
          color: #070A12; border: none; border-radius: 2px;
          font-weight: 800; letter-spacing: .12em; text-transform: uppercase;
          font-family: 'Impact','Arial Narrow',Arial,sans-serif;
          animation: lp-pulse 2s ease-in-out infinite;
        }
        .lp-card-inner {
          position: relative; width: 100%; height: 100%;
          transform-style: preserve-3d;
          transition: transform 0.55s cubic-bezier(0.4,0,0.2,1);
        }
        .lp-card-inner.flipped { transform: rotateY(180deg); }
        .lp-card-face {
          position: absolute; inset: 0; border-radius: 14px;
          backface-visibility: hidden; -webkit-backface-visibility: hidden;
          overflow: hidden;
        }
        .lp-card-back { transform: rotateY(0deg); }
        .lp-card-front { transform: rotateY(180deg); }
        @keyframes lp-tap-pulse { 0%,100% { opacity:.4; } 50% { opacity:.9; } }
        @keyframes lp-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
      `}</style>

      {/* NAV */}
      <nav style={{
        flexShrink: 0, display: "flex", justifyContent: "center", alignItems: "center",
        padding: "10px 24px",
      }}>
        <div style={{ fontWeight: 950, fontSize: 22, letterSpacing: -0.5 }}>
          REPLAY <span style={{ color: "#FFB14A" }}>IFS</span>
        </div>
      </nav>

      {/* MAIN */}
      <main style={{
        flex: 1, minHeight: 0,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "flex-start",
        padding: "12px 16px 0", gap: 0, textAlign: "center",
      }}>

        {/* 3x2 CARD GRID */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8, width: "100%", maxWidth: 340, marginBottom: 20,
        }}>
          {CARDS.map((c, i) => {
            const isFlipped = flipped.has(c.id);
            const card = playerCards[i];
            return (
              <div
                key={c.id}
                onClick={() => toggleCard(c.id)}
                style={{
                  aspectRatio: "329 / 478",
                  perspective: "800px",
                  cursor: "pointer",
                  animation: `lp-float ${1.8 + i * 0.2}s ease-in-out infinite`,
                }}
              >
                <div className={`lp-card-inner${isFlipped ? " flipped" : ""}`}>
                  {/* Back (face-down) — generic card back with logo */}
                  <div className="lp-card-face lp-card-back">
                    <CardBackGeneric />
                    {!isFlipped && (
                      <span style={{
                        position: "absolute", top: "16%", left: 0, right: 0, textAlign: "center",
                        fontSize: 8, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase",
                        color: "rgba(255,255,255,0.35)",
                        animation: "lp-tap-pulse 1.8s ease-in-out infinite",
                        zIndex: 2,
                      }}>TAP</span>
                    )}
                  </div>
                  {/* Front (face-up) — real in-game card with headshot */}
                  <div className="lp-card-face lp-card-front">
                    <AthleteCard
                      card={card}
                      phase={phase}
                      canFlip={false}
                      noTransition
                      visibleFp={card.actualFp}
                      badges={(card.achievements ?? []).map(a => ({
                        id: a.id,
                        icon: a.icon || "⭐",
                        label: a.label,
                        fp: a.fp ?? 0,
                      }))}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* HEADLINE + CTA */}
        <div style={{ maxWidth: 360, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: ".3em", textTransform: "uppercase",
            color: "#C9A84C", margin: 0,
          }}>
            Beta · Free to Play · No Sign-Up
          </p>
          <h1 style={{
            fontFamily: "'Impact','Arial Narrow',Arial,sans-serif", fontWeight: 900,
            fontSize: "clamp(24px, 5vw, 40px)", textTransform: "uppercase", lineHeight: 0.95, margin: 0,
          }}>
            You already know who balled out.<br />
            <em style={{ color: "#C9A84C", fontStyle: "normal" }}>Prove it.</em>
          </h1>
          <p style={{ fontSize: 12, color: "rgba(240,242,245,0.38)", lineHeight: 1.6, margin: 0 }}>
            Real stats. Real history. Your fantasy result instantly.
          </p>
          <button className="lp-cta" onClick={handlePlay} style={{ padding: "14px 52px", fontSize: 16 }}>
            Play IFS
          </button>
          <span style={{ fontSize: 10, color: "rgba(240,242,245,0.38)" }}>
            <span style={{ color: "#7FFF00" }}>✓</span> Skill based &nbsp;·&nbsp;
            <span style={{ color: "#7FFF00" }}>✓</span> Fantasy &nbsp;·&nbsp;
            <span style={{ color: "#7FFF00" }}>✓</span> Instant results
          </span>
        </div>
      </main>
    </div>
  );
}
