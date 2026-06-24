/**
 * shared/components/AppHeader.tsx
 * LAYER 1: Sport-agnostic top header — wordmark + nav tabs + overflow + bell.
 *
 * Props:
 *   sportLabel?: string  — optional sport badge ("World Cup", "NBA")
 *   onCollect?, onProfile?, onBell?  — tab/icon handlers
 *   hasUncollected? — collect-tab red dot
 *   unreadInboxCount? — bell red dot trigger (>0 shows dot)
 *   onLight? — platinum-band variant: dark-on-light inversion for the solo
 *     play-surface header. Defaults OFF; every other usage stays dark-on-dark.
 */

import { useEffect, useRef, useState } from "react";
import { soundManager } from "@shared/utils/soundManager";
import { useAuth } from "@shared/auth/useAuth";
import { track } from "@shared/analytics/analytics";
import {
  PLATINUM_INK,
  PLATINUM_INK_MUTED,
  PLATINUM_DOT_BORDER,
} from "@shared/components/platinumBand";

type TabId = "home" | "pulse" | "tourney" | "collect" | "profile";

const PRIMARY_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "home",    label: "Play",    icon: "⚡" },
  { id: "collect", label: "Collect", icon: "🃏" },
  { id: "profile", label: "Profile", icon: "👤" },
];

const OVERFLOW_TABS: { id: TabId; label: string; icon: string; soon: boolean; desc: string }[] = [
  { id: "pulse",   label: "Pulse",   icon: "📈", soon: true, desc: "Daily sports news" },
  { id: "tourney", label: "Tourney", icon: "🏆", soon: true, desc: "Compete with other players for big prizes" },
];

type Props = {
  sportLabel?: string;
  onCollect?: () => void;
  onProfile?: () => void;
  onBell?: () => void;
  hasUncollected?: boolean;
  unreadInboxCount?: number;
  hasNewAchievements?: boolean;
  /** Platinum-band variant — dark-on-light inversion. Default OFF. */
  onLight?: boolean;
};

export function AppHeader({
  sportLabel,
  onCollect,
  onProfile,
  onBell,
  hasUncollected,
  unreadInboxCount = 0,
  hasNewAchievements,
  onLight = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [muted, setMuted] = useState(soundManager.isMuted());
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const { isAnonymous } = useAuth();

  // Platinum-band inversion (onLight): text/icons go dark-on-light to read on
  // the light bar; IFS keeps brand orange (#FFB14A); the notification-dot ring
  // becomes a light cutout halo instead of the dark-body ring. Default OFF
  // keeps every other AppHeader usage exactly as-is.
  const inkPrimary = onLight ? PLATINUM_INK : "#EAF0FF";
  const inkActive = onLight ? PLATINUM_INK : "#FFB14A";
  const inkOverflowClosed = onLight ? PLATINUM_INK_MUTED : "#7c8aa3";
  const badgeColor = onLight ? PLATINUM_INK_MUTED : "rgba(255,255,255,0.4)";
  const badgeBorder = onLight ? "1px solid rgba(0,0,0,0.18)" : "1px solid rgba(255,255,255,0.15)";
  const dotBorder = "1.5px solid " + (onLight ? PLATINUM_DOT_BORDER : "#070A12");

  // Click-outside to close overflow dropdown
  useEffect(() => {
    if (!overflowOpen) return;
    function onDocClick(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    }
    function onDocKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOverflowOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [overflowOpen]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>

      {/* Wordmark + mute + optional sport badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 2 }}>
        <div
          role="button"
          tabIndex={0}
          aria-label="Switch sport"
          onClick={() => {
            track("nav", "wordmark_clicked", { from: window.location.pathname });
            window.location.href = "/?pick=1";
          }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.location.href = "/?pick=1"; } }}
          style={{ display: "flex", alignItems: "baseline", gap: 2, cursor: "pointer" }}
        >
          <span style={{ fontSize: 16, fontWeight: 950, letterSpacing: -0.5, color: inkPrimary }}>REPLAY</span>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: "#FFB14A", marginLeft: 2 }}>IFS</span>
        </div>
        <span
          onClick={(e) => { e.stopPropagation(); soundManager.toggleMute(); setMuted(soundManager.isMuted()); }}
          style={{ fontSize: 14, cursor: "pointer", opacity: 0.5, userSelect: "none" }}
        >{muted ? "🔇" : "🔊"}</span>
        {sportLabel && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
            color: badgeColor, textTransform: "uppercase",
            border: badgeBorder, borderRadius: 4, padding: "1px 5px",
          }}>{sportLabel}</span>
        )}
      </div>

      {/* Right cluster: primary tabs · overflow · bell */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {PRIMARY_TABS.map(({ id, label, icon }) => {
          const active   = activeTab === id;
          const isCollect = id === "collect";
          function handleClick() {
            setActiveTab(id);
            if (isCollect) { onCollect?.(); return; }
            if (id === "profile") { onProfile?.(); return; }
          }
          return (
            <div key={id} style={{ position: "relative" }}>
              <button
                onClick={handleClick}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                  padding: "3px 8px",
                  background: active ? "rgba(255,177,74,0.12)" : "transparent",
                  border: active ? "1px solid rgba(255,177,74,0.3)" : "1px solid transparent",
                  borderRadius: 8, cursor: "pointer",
                  transition: "all 150ms ease", minWidth: 40,
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
                <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: active ? inkActive : inkPrimary }}>
                  {label}
                </span>
              </button>
              {isCollect && hasUncollected && (
                <div style={{
                  position: "absolute", top: 0, right: 2,
                  width: 7, height: 7, borderRadius: "50%",
                  background: "#EF4444", border: dotBorder,
                  pointerEvents: "none",
                }} />
              )}
              {id === "profile" && hasNewAchievements && (
                <div style={{
                  position: "absolute", top: 0, right: 2,
                  width: 7, height: 7, borderRadius: "50%",
                  background: "#FFB14A", border: dotBorder,
                  pointerEvents: "none",
                }} />
              )}
            </div>
          );
        })}

        {/* Overflow ⋮ */}
        <div ref={overflowRef} style={{ position: "relative" }}>
          <button
            onClick={() => setOverflowOpen((v) => {
              if (!v) track('nav', 'overflow_opened', {}, 'system');
              return !v;
            })}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "3px 8px", minWidth: 32,
              background: overflowOpen ? "rgba(255,177,74,0.12)" : "transparent",
              border: overflowOpen ? "1px solid rgba(255,177,74,0.3)" : "1px solid transparent",
              borderRadius: 8, cursor: "pointer",
              fontSize: 16, color: overflowOpen ? inkActive : inkOverflowClosed,
            }}
            aria-label="More"
            aria-expanded={overflowOpen}
            aria-haspopup="menu"
          >⋮</button>
          {overflowOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0,
              minWidth: 220, background: "#11192b",
              border: "1px solid #2a3550", borderRadius: 8,
              boxShadow: "0 8px 18px rgba(0,0,0,0.5)",
              overflow: "hidden", zIndex: 100,
            }}>
              {OVERFLOW_TABS.map(({ id, label, icon, soon, desc }, i) => (
                <div key={id} style={{
                  padding: "10px 12px",
                  display: "flex", flexDirection: "column", gap: 4,
                  borderBottom: i < OVERFLOW_TABS.length - 1 ? "1px solid #1c2540" : "none",
                  cursor: soon ? "default" : "pointer", opacity: soon ? 0.7 : 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#EAF0FF" }}>{icon} {label}</span>
                    {soon && (
                      <span style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: 0.6, color: "#FFB14A",
                        border: "1px solid rgba(255,177,74,0.3)", borderRadius: 3,
                        padding: "2px 5px",
                      }}>COMING SOON</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#7c8aa3", lineHeight: 1.4 }}>{desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bell — hidden when anonymous */}
        {!isAnonymous && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => onBell?.()}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "3px 8px", minWidth: 32, background: "transparent",
                border: "1px solid transparent", borderRadius: 8, cursor: "pointer",
                fontSize: 14,
              }}
              aria-label="Inbox"
            >🔔</button>
            {unreadInboxCount > 0 && (
              <div style={{
                position: "absolute", top: 0, right: 2,
                width: 7, height: 7, borderRadius: "50%",
                background: "#EF4444", border: dotBorder,
                pointerEvents: "none",
              }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
