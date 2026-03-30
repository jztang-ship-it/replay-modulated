/**
 * AccessGate.tsx
 * Simple PIN screen. Sits in front of the app.
 * Code: 9315
 */

import { useState, useEffect } from "react";

const CODE = "9315";
const STORAGE_KEY = "replaymod_access";

export function AccessGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState("");
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === CODE) setUnlocked(true);
    } catch {}
    setChecking(false);
  }, []);

  function handleDigit(d: string) {
    if (input.length >= 4) return;
    const next = input + d;
    setInput(next);
    if (next.length === 4) {
      if (next === CODE) {
        try { localStorage.setItem(STORAGE_KEY, CODE); } catch {}
        setTimeout(() => setUnlocked(true), 300);
      } else {
        setShake(true);
        setTimeout(() => { setShake(false); setInput(""); }, 600);
      }
    }
  }

  function handleDelete() {
    setInput(prev => prev.slice(0, -1));
  }

  if (checking) return null;
  if (unlocked) return <>{children}</>;

  const dots = Array.from({ length: 4 }, (_, i) => i < input.length);

  return (
    <div style={{
      width: "100vw", height: "100vh",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
      fontFamily: "'Inter', system-ui, sans-serif", userSelect: "none",
      gap: 32,
    }}>
      {/* Wordmark */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.5, color: "#EAF0FF" }}>
          REPLAY <span style={{ color: "#FFB14A" }}>IFS</span>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase" }}>
          Enter access code
        </div>
      </div>

      {/* Dots */}
      <div style={{
        display: "flex", gap: 16,
        transform: shake ? "translateX(0)" : "translateX(0)",
        animation: shake ? "shake 0.5s ease" : "none",
      }}>
        {dots.map((filled, i) => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: "50%",
            background: filled ? "#FFB14A" : "rgba(255,255,255,0.1)",
            border: `2px solid ${filled ? "#FFB14A" : "rgba(255,255,255,0.2)"}`,
            transition: "background 0.15s, border-color 0.15s",
            transform: shake ? "scale(1.1)" : "scale(1)",
          }} />
        ))}
      </div>

      {/* Keypad */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10,
        width: 220,
      }}>
        {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((key, i) => {
          if (key === "") return <div key={i} />;
          return (
            <button key={i} onClick={() => key === "⌫" ? handleDelete() : handleDigit(key)}
              style={{
                height: 60, borderRadius: 14, fontSize: key === "⌫" ? 18 : 22,
                fontWeight: 700, cursor: "pointer",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: key === "⌫" ? "rgba(255,255,255,0.4)" : "#EAF0FF",
                transition: "background 0.1s, transform 0.1s",
              }}
              onMouseDown={e => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
              onMouseUp={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
            >
              {key}
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
