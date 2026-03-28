// src/components/AppHeader.tsx
// LAYER 1: Sport-agnostic top header — wordmark + nav tabs only.
// Bonus pool lives in BonusPoolRow (GameView.tsx).

import { useState } from "react";

type TabId = "home" | "pulse" | "collect" | "profile";
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "home",    label: "Play",    icon: "⚡" },
  { id: "pulse",   label: "Pulse",   icon: "📈" },
  { id: "collect", label: "Collect", icon: "🃏" },
  { id: "profile", label: "Profile", icon: "👤" },
];

export function AppHeader() {
  const [activeTab, setActiveTab] = useState<TabId>("home");

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>

      {/* Wordmark */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 2, paddingLeft: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 950, letterSpacing: -0.5, color: "#EAF0FF" }}>REPLAY</span>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: "#FFB14A", marginLeft: 2 }}>FS</span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {TABS.map(({ id, label, icon }) => {
          const active   = activeTab === id;
          const disabled = id !== "home";
          return (
            <button
              key={id}
              onClick={() => !disabled && setActiveTab(id)}
              disabled={disabled}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                padding: "3px 8px",
                background: active ? "rgba(255,177,74,0.12)" : "transparent",
                border: active ? "1px solid rgba(255,177,74,0.3)" : "1px solid transparent",
                borderRadius: 8,
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.35 : 1,
                transition: "all 150ms ease",
                minWidth: 40,
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
              <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: active ? "#FFB14A" : "#EAF0FF" }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}