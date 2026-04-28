/**
 * shared/components/LandingPage.tsx — sport-agnostic landing screen.
 *
 * Lifted from basketball/baseball copies (they were ~95% identical). The
 * sport-specific surface area (card data, card component, headshot URL,
 * grid layout, audio bed, optional game-log resolution) is exposed through
 * the LandingAdapter interface — sport wrappers just pass an adapter and
 * onPlay.
 *
 * 6 cards in a 3x2 grid (basketball) or 5 cards in a 3+2 centered grid
 * (baseball). Cards start face-down with TAP prompts and flip on tap to
 * reveal real in-game card fronts with headshots.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { ComponentType } from "react";
import type { Achievement, GamePhase, PlayerCard, TierColor } from "../types";
import { CardBackGeneric } from "./CardBackGeneric";
import { soundManager } from "../utils/soundManager";
import { useAuth } from "../auth/useAuth";
import { RegisterModal } from "./RegisterModal";

// ─── Types ──────────────────────────────────────────────────────────────────

export type LandingCardDef = {
  id: string;
  name: string;
  pos: string;
  salary: number;
  fp: number;
  team: string;
  season: string;
  basePlayerId: string;
  /** Optional explicit tier — overrides any salary-derived default.
   *  Baseball ships this from players.json so landing cards match production. */
  tier?: TierColor;
  achievements: Achievement[];
};

export type LandingResolved = {
  actualFp: number;
  statLine: Record<string, number>;
  achievements: Achievement[];
  gameInfo: { date: string; opponent: string; homeAway?: "H" | "A" };
};

export type LandingGridLayout = {
  /** CSS gridTemplateColumns for the card grid container. */
  templateColumns: string;
  /** Optional explicit gridColumn per card index — used by baseball's 3+2
   *  centered layout where slots 3 and 4 sit between columns. */
  gridColumnFor?: (index: number) => string | undefined;
};

export type LandingCardComponentProps = {
  card: PlayerCard;
  phase: GamePhase;
  canFlip: boolean;
  noTransition?: boolean;
  visibleFp?: number;
  badges: Array<{ id: string; icon: string; label: string; fp: number }>;
};

export type LandingAdapter = {
  /** Sport-specific roster of demo cards (5 or 6, depending on sport). */
  landingCards: LandingCardDef[];
  /** Sport-specific headshot URL builder. */
  landingHeadshotUrl: (id: string) => string;
  /** Sport-specific card renderer (AthleteCard / BaseballCard / etc.). */
  landingCardComponent: ComponentType<LandingCardComponentProps>;
  /** Grid layout — basketball is 3x2, baseball is 3+2 centered. */
  landingGridLayout: LandingGridLayout;
  /** Audio bed src. null = silent (baseball ships no bed). */
  landingAudioBedSrc?: string | null;
  /** Tier mapper — basketball derives from salary, baseball uses explicit d.tier. */
  landingTierFor: (d: LandingCardDef) => TierColor;
  /** Optional: ensure sport-specific data (game logs, etc.) is loaded.
   *  Resolves once data is ready; resolveLandingActuals can then return real values. */
  ensureLandingDataLoaded?: () => Promise<void>;
  /** Optional: resolve a card to a real game-log line. Baseball uses this to
   *  swap avg FP for an actual game's FP after dataEngine loads. Returns null
   *  if no log is available — the card stays at its avg-FP placeholder. */
  resolveLandingActuals?: (d: LandingCardDef) => LandingResolved | null;
};

interface Props {
  adapter: LandingAdapter;
  onPlay: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function LandingPage({ adapter, onPlay }: Props) {
  const { isAnonymous, signUp, linkGoogle, signIn, signInGoogle } = useAuth();
  const [showSignIn, setShowSignIn] = useState(false);
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const phase: GamePhase = "RESULTS";
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    landingCards: CARDS,
    landingHeadshotUrl,
    landingCardComponent: CardComponent,
    landingGridLayout,
    landingAudioBedSrc,
    landingTierFor,
    ensureLandingDataLoaded,
    resolveLandingActuals,
  } = adapter;

  // Per-card resolved game-log state. Empty until adapter.resolveLandingActuals
  // produces results (only baseball does this; basketball stays empty and
  // landing cards keep their static avg-FP).
  const [resolved, setResolved] = useState<Record<string, LandingResolved>>({});

  useEffect(() => {
    if (!resolveLandingActuals) return;
    let cancelled = false;
    const load = async () => {
      try {
        if (ensureLandingDataLoaded) await ensureLandingDataLoaded();
      } catch { /* fall through to avg-FP fallback */ }
      if (cancelled) return;
      const next: Record<string, LandingResolved> = {};
      for (const d of CARDS) {
        const r = resolveLandingActuals(d);
        if (r) next[d.id] = r;
      }
      setResolved(next);
    };
    load();
    return () => { cancelled = true; };
    // CARDS is stable per adapter instance — landingCards from the same adapter
    // is the same reference across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audio bed (basketball plays the murmur; baseball ships no bed).
  // Starts on first card flip — not on mount — so the page doesn't trigger
  // autoplay restrictions on browsers that block audio without a gesture.
  const startAudio = useCallback(() => {
    if (!landingAudioBedSrc) return;
    if (audioRef.current) return;
    if (soundManager.isMuted()) return;
    const a = new Audio(landingAudioBedSrc);
    a.loop = true;
    a.volume = 0.15;
    audioRef.current = a;
    a.play().catch(() => {});
  }, [landingAudioBedSrc]);

  useEffect(() => {
    if (!landingAudioBedSrc) return;
    // Poll mute state so toggling mute while on landing pauses/resumes audio.
    const poll = setInterval(() => {
      const a = audioRef.current;
      if (!a) return;
      if (soundManager.isMuted() && !a.paused) a.pause();
      else if (!soundManager.isMuted() && a.paused) a.play().catch(() => {});
    }, 300);
    return () => {
      clearInterval(poll);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [landingAudioBedSrc]);

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
      if (next.has(id)) next.delete(id); else {
        next.add(id);
        startAudio(); // sound starts on first flip
      }
      return next;
    });
  }

  const playerCards = useMemo(() => {
    return CARDS.map((d, slotIndex) => {
      const cardId = `landing-${d.id}`;
      const r = resolved[d.id];
      return {
        cardId,
        basePlayerId: d.basePlayerId,
        photoCode: d.basePlayerId,
        headshotUrl: landingHeadshotUrl(d.basePlayerId),
        name: d.name,
        team: d.team,
        season: d.season,
        position: d.pos,
        tier: d.tier ?? landingTierFor(d),
        salary: d.salary,
        projectedFp: d.fp,
        // Pre-load: avg FP placeholder so the slot never reads 0.
        // Post-load: real game-log FP including badge bonuses.
        actualFp: r ? r.actualFp : d.fp,
        fpDelta: 0,
        gameInfo: r?.gameInfo ?? { date: "", opponent: "", homeAway: "" as any },
        statLine: r?.statLine ?? {},
        achievements: r?.achievements ?? d.achievements,
        slotIndex,
        wasHeld: false,
      } satisfies PlayerCard;
    });
  }, [CARDS, resolved, landingHeadshotUrl, landingTierFor]);

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
        flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 20px",
      }}>
        <div style={{ fontWeight: 950, fontSize: 22, letterSpacing: -0.5 }}>
          REPLAY <span style={{ color: "#FFB14A" }}>IFS</span>
        </div>
        {isAnonymous && (
          <button
            onClick={() => setShowSignIn(true)}
            aria-label="Sign in"
            style={{
              background: "none", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "50%", width: 32, height: 32,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 15, padding: 0,
            }}
          >
            👤
          </button>
        )}
      </nav>

      {/* MAIN */}
      <main style={{
        flex: 1, minHeight: 0,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center",
        padding: "0 16px env(safe-area-inset-bottom, 12px)", gap: 16, textAlign: "center",
      }}>

        {/* CARD GRID — sport-specific layout */}
        <div style={{
          display: "grid",
          gridTemplateColumns: landingGridLayout.templateColumns,
          gap: 6, width: "100%", maxWidth: 340,
        }}>
          {CARDS.map((c, i) => {
            const isFlipped = flipped.has(c.id);
            const card = playerCards[i];
            const gridColumn = landingGridLayout.gridColumnFor?.(i);
            return (
              <div
                key={c.id}
                onClick={() => toggleCard(c.id)}
                style={{
                  ...(gridColumn ? { gridColumn } : {}),
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
                    <CardComponent
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
        <div style={{ maxWidth: 360, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: ".3em", textTransform: "uppercase",
            color: "#C9A84C", margin: 0,
          }}>
            Beta · Free to Play · No Sign-Up
          </p>
          {showSignIn && (
            <RegisterModal
              signInMode
              onClose={() => setShowSignIn(false)}
              onSuccess={() => setShowSignIn(false)}
              signUp={signUp}
              linkGoogle={linkGoogle}
              signIn={signIn}
              signInGoogle={signInGoogle}
            />
          )}
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
