import React, { useEffect, useState } from "react";
import type { AchievementDef } from "@shared/achievements";
import type { MvpCardSnapshot } from "./AchievementCard";
import { getTier } from "@shared/theme";
import { headshotUrl } from "@shared/utils/headshotUrl";

export interface AchievementDetailModalProps {
  def: AchievementDef;
  unlockedAt?: string;
  mvpCard?: MvpCardSnapshot | null;
  fpTier?: string;
  totalFp?: number;
  season?: string;
  sourceHandId?: string | null;
  isLocked?: boolean;
  onClose: () => void;
}

const TIER_LABEL_FULL: Record<string, string> = {
  bronze: "Instant Impressive",
  silver: "Grinder",
  gold:   "Cross-Era",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

export function AchievementDetailModal({
  def,
  unlockedAt,
  mvpCard,
  fpTier,
  totalFp,
  season,
  isLocked,
  onClose,
}: AchievementDetailModalProps) {
  const locked = isLocked || !unlockedAt;
  const cardTier = getTier(mvpCard?.tier ?? (locked ? "WHITE" : "BLUE"));
  const [imgErr, setImgErr] = useState(false);
  const photoUrl = mvpCard?.photoCode && !imgErr ? headshotUrl(mvpCard.photoCode) : null;

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.85)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "fixed", top: 14, right: 14, zIndex: 10001,
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.18)",
          color: "#EAF0FF", fontSize: 18, fontWeight: 700,
          cursor: "pointer", lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        aria-label="Close"
      >×</button>

      {/* Hero area */}
      <div style={{
        width: "100%",
        maxWidth: 480,
        background: locked
          ? "linear-gradient(180deg, #0d1526 0%, #070A12 100%)"
          : `linear-gradient(180deg, ${cardTier.bg} 0%, #070A12 60%)`,
        minHeight: 260,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 20,
        paddingTop: 60,
        position: "relative",
      }}>
        {/* Photo or icon */}
        <div style={{
          width: 100, height: 100, borderRadius: "50%",
          overflow: "hidden",
          border: `3px solid ${locked ? "rgba(255,255,255,0.15)" : cardTier.accent}`,
          boxShadow: locked ? "none" : `0 0 0 1px rgba(0,0,0,0.4), 0 0 24px ${cardTier.glow}`,
          background: locked ? "#1a1f2e" : cardTier.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 42,
          marginBottom: 12,
        }}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={mvpCard?.name ?? ""}
              onError={() => setImgErr(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
            />
          ) : (
            <span>{locked ? "🔒" : (def.tier === "gold" ? "🏆" : def.tier === "silver" ? "🥈" : "🥉")}</span>
          )}
        </div>

        {/* Player name + position */}
        {!locked && mvpCard?.name && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#EAF0FF" }}>{mvpCard.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              {mvpCard.position} · {mvpCard.team}
            </div>
          </div>
        )}
      </div>

      {/* Info panel */}
      <div style={{
        width: "100%",
        maxWidth: 480,
        padding: "20px 20px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        background: "#070A12",
      }}>
        {/* Achievement category */}
        <div style={{
          fontSize: 9, fontWeight: 800, letterSpacing: 2,
          color: locked ? "rgba(255,255,255,0.3)" : cardTier.accent,
          textTransform: "uppercase",
        }}>
          {TIER_LABEL_FULL[def.tier]} · Basketball
        </div>

        {/* Achievement title */}
        <div style={{ fontSize: 26, fontWeight: 900, color: "#EAF0FF", lineHeight: 1.1 }}>
          {def.title}
        </div>

        {/* Description */}
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
          {def.description}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0" }} />

        {locked ? (
          <div style={{
            fontSize: 12, color: "rgba(255,255,255,0.35)", fontStyle: "italic",
          }}>
            Keep playing to unlock this achievement.
          </div>
        ) : (
          <>
            {/* Hand stats */}
            {(fpTier || totalFp !== undefined || season) && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {fpTier && (
                  <StatPill label="Tier" value={fpTier} accent={cardTier.accent} />
                )}
                {totalFp !== undefined && (
                  <StatPill label="Total FP" value={`${totalFp.toFixed(1)}`} accent={cardTier.accent} />
                )}
                {mvpCard?.fp !== undefined && (
                  <StatPill label={`${mvpCard.name ?? "Card"} FP`} value={`${mvpCard.fp.toFixed(1)}`} accent={cardTier.accent} />
                )}
                {season && (
                  <StatPill label="Season" value={season} accent={cardTier.accent} />
                )}
              </div>
            )}

            {/* Unlock date */}
            {unlockedAt && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                Unlocked {formatDate(unlockedAt)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: `1px solid ${accent}44`,
      borderRadius: 8,
      padding: "6px 12px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      minWidth: 64,
    }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: accent }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginTop: 1, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}
