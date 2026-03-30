/**
 * LandingPage.tsx — Single screen, no scroll.
 * 6 cards in a 3x2 grid, tappable to flip. "Play IFS" CTA below.
 */
import { useState } from "react";
import { CardBackGeneric } from "./CardBackGeneric";

// ─── tokens ──────────────────────────────────────────────────────────────
const BLACK  = "#070A12";
const TEXT   = "#F0F2F5";
const MUTED  = "rgba(240,242,245,0.38)";
const GOLD   = "#C9A84C";
const GREEN  = "#7FFF00";

// ─── card definitions ────────────────────────────────────────────────────
type Card = { id: string; name: string; pos: string; fp: string; color: string; salary: string };

const CARDS: Card[] = [
  { id:"c1", name:"Trae Young",     pos:"PG", fp:"43.5", color:"#4B9EE8", salary:"$38" },
  { id:"c2", name:"De'Aaron Fox",   pos:"PG", fp:"61.2", color:"#4B9EE8", salary:"$45" },
  { id:"c3", name:"Nikola Jokic",   pos:"C",  fp:"68.4", color:"#E8631A", salary:"$63" },
  { id:"c4", name:"LeBron James",   pos:"SF", fp:"89.5", color:"#E8631A", salary:"$59" },
  { id:"c5", name:"Stephen Curry",  pos:"PG", fp:"77.8", color:"#8B5CF6", salary:"$52" },
  { id:"c6", name:"Kevin Durant",   pos:"SF", fp:"71.2", color:"#8B5CF6", salary:"$55" },
];

interface Props { onPlay: () => void; }

export function LandingPage({ onPlay }: Props) {
  const [flipped, setFlipped] = useState<Set<string>>(new Set());

  function toggleCard(id: string) {
    setFlipped(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div style={{
      background: `linear-gradient(180deg, ${BLACK} 0%, #0A1020 38%, ${BLACK} 100%)`,
      color: TEXT,
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
        padding: "12px 16px 0",
        gap: 0,
        textAlign: "center",
      }}>

        {/* 3x2 CARD GRID */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
          width: "100%",
          maxWidth: 340,
          marginBottom: 20,
        }}>
          {CARDS.map(c => {
            const isFlipped = flipped.has(c.id);
            return (
              <div
                key={c.id}
                onClick={() => toggleCard(c.id)}
                style={{
                  aspectRatio: "329 / 478",
                  perspective: "800px",
                  cursor: "pointer",
                  animation: `lp-float ${1.8 + parseInt(c.id.slice(1)) * 0.2}s ease-in-out infinite`,
                }}
              >
                <div className={`lp-card-inner${isFlipped ? " flipped" : ""}`}>
                  {/* Back (face-down) */}
                  <div className="lp-card-face lp-card-back" style={{
                    background: "linear-gradient(160deg, #1A2540 0%, #111828 50%, #0C1220 100%)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}>
                    <CardBackGeneric />
                    {!isFlipped && (
                      <span style={{
                        position: "absolute", top: "20%", left: 0, right: 0, textAlign: "center",
                        fontSize: 8, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase",
                        color: "rgba(255,255,255,0.35)",
                        animation: "lp-tap-pulse 1.8s ease-in-out infinite",
                      }}>TAP</span>
                    )}
                  </div>
                  {/* Front (face-up) */}
                  <div className="lp-card-face lp-card-front" style={{
                    background: `linear-gradient(160deg, ${c.color}22 0%, ${c.color}44 100%)`,
                    border: `1.5px solid ${c.color}66`,
                    display: "flex", flexDirection: "column", justifyContent: "flex-end",
                    padding: "8px 6px 6px",
                  }}>
                    <div style={{ position: "absolute", top: 6, left: 6, fontSize: 10, fontWeight: 900, color: c.color }}>{c.salary}</div>
                    <div style={{ position: "absolute", top: 6, right: 6, fontSize: 7, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>{c.pos}</div>
                    <div style={{ marginTop: "auto" }}>
                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, color: "rgba(255,255,255,0.9)", lineHeight: 1.2 }}>{c.name}</div>
                      <div style={{ fontSize: 18, fontWeight: 950, color: c.color, lineHeight: 1 }}>{c.fp}</div>
                      <div style={{ fontSize: 7, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5 }}>FP</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* HEADLINE + CTA */}
        <div style={{ maxWidth: 360, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".3em", textTransform: "uppercase", color: GOLD, margin: 0 }}>
            Beta · Free to Play · No Sign-Up
          </p>
          <h1 style={{
            fontFamily: "'Impact','Arial Narrow',Arial,sans-serif", fontWeight: 900,
            fontSize: "clamp(24px, 5vw, 40px)", textTransform: "uppercase", lineHeight: 0.95, margin: 0,
          }}>
            You already know who balled out.<br />
            <em style={{ color: GOLD, fontStyle: "normal" }}>Prove it.</em>
          </h1>
          <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            A new way to sports entertainment — <strong style={{ color: TEXT }}>INSTANT</strong> fantasy sports.
          </p>
          <button className="lp-cta" onClick={onPlay} style={{ padding: "14px 52px", fontSize: 16 }}>
            Play IFS
          </button>
          <span style={{ fontSize: 10, color: MUTED }}>
            <span style={{ color: GREEN }}>✓</span> Skill based &nbsp;·&nbsp;
            <span style={{ color: GREEN }}>✓</span> Fantasy &nbsp;·&nbsp;
            <span style={{ color: GREEN }}>✓</span> Instant results
          </span>
        </div>

      </main>
    </div>
  );
}
