/**
 * shared/components/AppHeader.tsx
 * LAYER 1: Sport-agnostic top header — wordmark + nav tabs.
 *
 * Props:
 *   sportLabel?: string  — optional sport badge shown next to wordmark
 *                          e.g. "World Cup", "NBA". Omit for generic.
 *
 * All sports import from "@shared/components/AppHeader".
 */

import { useState } from "react";
import { soundManager } from "@shared/utils/soundManager";

type TabId = "home" | "pulse" | "collect" | "profile";
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "home",    label: "Play",    icon: "⚡" },
  { id: "pulse",   label: "Pulse",   icon: "📈" },
  { id: "collect", label: "Collect", icon: "🃏" },
  { id: "profile", label: "Profile", icon: "👤" },
];

type Props = {
  sportLabel?: string;
  onCollect?: () => void;
  onProfile?: () => void;
  hasUncollected?: boolean;
};

export function AppHeader({ sportLabel, onCollect, onProfile, hasUncollected }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [muted, setMuted] = useState(soundManager.isMuted());

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>

      {/* Wordmark + mute + optional sport badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 2 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 950, letterSpacing: -0.5, color: "#EAF0FF" }}>REPLAY</span>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: "#FFB14A", marginLeft: 2 }}>IFS</span>
        </div>
        <span
          onClick={(e) => { e.stopPropagation(); soundManager.toggleMute(); setMuted(soundManager.isMuted()); }}
          style={{ fontSize: 14, cursor: "pointer", opacity: 0.5, userSelect: "none" }}
        >{muted ? "🔇" : "🔊"}</span>
        {sportLabel && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
            color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
            border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, padding: "1px 5px",
          }}>
            {sportLabel}
          </span>
        )}
      </div>

      {/* Nav tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {TABS.map(({ id, label, icon }) => {
          const active   = activeTab === id;
          const disabled = id === "pulse";
          const isCollect = id === "collect";
          function handleClick() {
            if (disabled) return;
            if (isCollect) { onCollect?.(); return; }
            if (id === "profile") { onProfile?.(); return; }
            setActiveTab(id);
          }
          return (
            <div key={id} style={{ position: "relative" }}>
              <button
                onClick={handleClick}
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
              {/* Red dot for Collect tab */}
              {isCollect && hasUncollected && (
                <div style={{
                  position: "absolute", top: 0, right: 2,
                  width: 7, height: 7, borderRadius: "50%",
                  background: "#EF4444",
                  border: "1.5px solid #070A12",
                  pointerEvents: "none",
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}