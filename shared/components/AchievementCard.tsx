import React, { useState } from "react";
import type { AchievementDef } from "@shared/achievements";
import { getTier } from "@shared/theme";
import { headshotUrl } from "@shared/utils/headshotUrl";

export interface MvpCardSnapshot {
  photoCode?: string;
  name: string;
  team: string;
  position: string;
  tier: string;
  season: string;
  fp: number;
}

export interface AchievementCardProps {
  def: AchievementDef;
  unlockedAt?: string;         // ISO — undefined means locked
  mvpCard?: MvpCardSnapshot | null;
  fpTier?: string;
  totalFp?: number;
  season?: string;
  onClick?: () => void;
}

const TIER_ICON: Record<string, string> = {
  bronze: "🥉",
  silver: "🥈",
  gold:   "🏆",
};

const TIER_LABEL: Record<string, string> = {
  bronze: "Instant",
  silver: "Grinder",
  gold:   "Cross-Era",
};

export function AchievementCard({ def, unlockedAt, mvpCard, fpTier, totalFp, onClick }: AchievementCardProps) {
  const unlocked = !!unlockedAt;
  const cardTier = getTier(mvpCard?.tier ?? (unlocked ? "BLUE" : "WHITE"));
  const [imgErr, setImgErr] = useState(false);
  const photoUrl = mvpCard?.photoCode && !imgErr ? headshotUrl(mvpCard.photoCode) : null;

  const borderColor = unlocked
    ? `${cardTier.accent}55`
    : "rgba(255,255,255,0.08)";
  const glowColor = unlocked ? cardTier.glow : "transparent";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${def.title} — ${unlocked ? "unlocked" : "locked"}`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
      style={{
        position: "relative",
        borderRadius: 12,
        border: `1.5px solid ${borderColor}`,
        background: unlocked
          ? `linear-gradient(160deg, #0d1526 0%, #0a1020 100%)`
          : "rgba(255,255,255,0.03)",
        boxShadow: unlocked ? `0 0 12px ${glowColor}, 0 4px 14px rgba(0,0,0,0.4)` : "none",
        padding: "10px 10px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 7,
        cursor: "pointer",
        opacity: unlocked ? 1 : 0.55,
        transition: "opacity 150ms ease, transform 100ms ease",
        WebkitTapHighlightColor: "transparent",
        minHeight: 150,
        userSelect: "none",
      }}
      onPointerDown={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "scale(0.96)"; }}
      onPointerUp={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ""; }}
      onPointerLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ""; }}
    >
      {/* Tier pill — top left */}
      <div style={{
        position: "absolute", top: 7, left: 8,
        fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
        color: unlocked ? cardTier.accent : "rgba(255,255,255,0.3)",
        textTransform: "uppercase",
      }}>
        {TIER_ICON[def.tier]} {TIER_LABEL[def.tier]}
      </div>

      {/* Hero — photo or silhouette */}
      <div style={{
        marginTop: 16,
        width: 56, height: 56,
        borderRadius: "50%",
        overflow: "hidden",
        border: `2px solid ${unlocked ? cardTier.accent : "rgba(255,255,255,0.12)"}`,
        boxShadow: unlocked ? `0 0 0 1px rgba(0,0,0,0.4), 0 0 8px ${glowColor}` : "none",
        background: unlocked ? cardTier.bg : "#1a1f2e",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: unlocked && !photoUrl ? 22 : 14,
      }}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={mvpCard?.name ?? ""}
            onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
          />
        ) : (
          <span style={{ color: unlocked ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.2)" }}>
            {unlocked ? TIER_ICON[def.tier] : "🔒"}
          </span>
        )}
      </div>

      {/* Player name or "???" */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: unlocked ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)",
        textAlign: "center",
        lineHeight: 1.2,
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {unlocked && mvpCard?.name ? mvpCard.name : "???"}
      </div>

      {/* FP or tier badge */}
      {unlocked && (fpTier || totalFp !== undefined) && (
        <div style={{
          fontSize: 11,
          fontWeight: 900,
          color: cardTier.accent,
          letterSpacing: 0.3,
        }}>
          {fpTier || (totalFp !== undefined ? `${totalFp.toFixed(0)} FP` : "")}
        </div>
      )}

      {/* Achievement title */}
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: unlocked ? "#EAF0FF" : "rgba(255,255,255,0.45)",
        textAlign: "center",
        lineHeight: 1.3,
        marginTop: "auto",
      }}>
        {def.title}
      </div>
    </div>
  );
}
