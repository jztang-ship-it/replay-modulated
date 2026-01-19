import React, { useMemo, useState } from "react";
import type { GamePhase, PlayerCard, Position, TierColor } from "../adapters/types";

function getInitials(name: string) {
  const parts = String(name ?? "").trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}

function plHeadshotUrl(photoCode: string) {
  return `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photoCode}.png`;
}

function tierStyle(tier: TierColor) {
  switch (tier) {
    case "ORANGE":
      return { border: "#f59e0b", label: "ORANGE" };
    case "PURPLE":
      return { border: "#8b5cf6", label: "PURPLE" };
    case "BLUE":
      return { border: "#3b82f6", label: "BLUE" };
    case "GREEN":
      return { border: "#22c55e", label: "GREEN" };
    default:
      return { border: "#e5e7eb", label: "WHITE" };
  }
}

function fmtSeason(season: string) {
  const n = Number(season);
  if (Number.isFinite(n)) {
    const yy = String(n).slice(-2);
    const next = String(n + 1).slice(-2);
    return `'${yy}-${next}`;
  }
  return season;
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

function getStat(stats: Record<string, any> | undefined, keys: string[]): number {
  const s = stats ?? {};
  for (const k of keys) {
    const v = (s as any)[k];
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function AthleteCard(props: {
  card: PlayerCard;
  phase: GamePhase;
  isLocked: boolean;
  isMvp: boolean;
  isFlipped: boolean;
  canFlip: boolean;
  onToggleFlip: () => void;
}) {
  const { card, phase, isLocked, isMvp, isFlipped, canFlip, onToggleFlip } = props;

  const t = tierStyle(card.tier);
  const seasonLabel = useMemo(() => fmtSeason(String(card.season ?? "")), [card.season]);

  const photoCode = (card as any).photoCode as string | undefined;
  const [imgBroken, setImgBroken] = useState(false);
  const headshotSrc = !imgBroken && photoCode ? plHeadshotUrl(photoCode) : null;

  const proj = Number(card.projectedFp ?? 0);
  const actual = Number(card.actualFp ?? 0);
  const delta = Number(card.fpDelta ?? 0);

  const showResults = phase === "RESULTS";
  const clickable = canFlip && phase === "RESULTS";

  // Extract all stats for back of card
  const stats = card.statLine || {};
  const statEntries = Object.entries(stats).filter(([k, v]) => typeof v === 'number' || !isNaN(Number(v)));

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: 16,
    border: `2px solid ${t.border}`,
    background: "#fff",
    boxShadow: isLocked ? "0 0 0 2px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.08)" : "0 6px 18px rgba(0,0,0,0.06)",
    position: "relative",
    overflow: "hidden",
    cursor: clickable ? "pointer" : "default",
    userSelect: "none",
    transform: "translateZ(0)",
  };

  const holdRibbon: React.CSSProperties = {
    position: "absolute",
    top: 10,
    left: -28,
    transform: "rotate(-20deg)",
    background: isLocked ? "rgba(0,0,0,0.85)" : "transparent",
    color: "white",
    padding: "4px 34px",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 0.8,
    display: isLocked ? "block" : "none",
    zIndex: 5,
  };

  const mvpBadge: React.CSSProperties = {
    position: "absolute",
    top: 10,
    right: 10,
    background: "#f59e0b",
    color: "white",
    fontSize: 10,
    fontWeight: 950,
    padding: "4px 8px",
    borderRadius: 999,
    display: isMvp ? "inline-flex" : "none",
    alignItems: "center",
    gap: 6,
    zIndex: 5,
  };

  const chip: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 900,
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.06)",
    border: "1px solid rgba(0,0,0,0.08)",
    whiteSpace: "nowrap",
  };

  const deltaChip: React.CSSProperties = {
    ...chip,
    background: delta >= 0 ? "rgba(34,197,94,0.16)" : "rgba(107,114,128,0.18)",
    border: "1px solid rgba(0,0,0,0.06)",
  };

  const HEADSHOT = 86;

  const Headshot = (
    <div
      style={{
        width: HEADSHOT,
        height: HEADSHOT,
        borderRadius: 18,
        overflow: "hidden",
        background: "rgba(0,0,0,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid rgba(0,0,0,0.10)",
        flex: "0 0 auto",
      }}
      title={String(card.name ?? "")}
    >
      {headshotSrc ? (
        <img
          src={headshotSrc}
          alt={String(card.name ?? "Player")}
          style={{
            width: "100%",
            height: "125%",
            objectFit: "cover",
            objectPosition: "50% 16%",
            display: "block",
          }}
          onError={() => setImgBroken(true)}
        />
      ) : (
        <span style={{ fontWeight: 950, fontSize: 18, opacity: 0.85 }}>{getInitials(String(card.name ?? ""))}</span>
      )}
    </div>
  );

  const Front = (
    <div style={{ padding: 10, height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {Headshot}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 950,
              lineHeight: 1.05,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {String(card.name ?? "Unknown").toUpperCase()}
          </div>

          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={chip}>
              {card.position} • {t.label}
            </span>
            <span style={chip}>${card.salary}</span>
            <span style={chip}>{showResults ? `ACT ${round1(actual)}` : `PROJ ${round1(proj)}`}</span>
            {showResults && <span style={deltaChip}>{delta >= 0 ? `+${round1(delta)}` : `${round1(delta)}`}</span>}
          </div>

          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {card.team ?? "Unknown"} • {seasonLabel}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "auto", fontSize: 11, opacity: 0.65 }}>
        {clickable ? "Tap to view stats" : phase === "HOLD" ? "Tap to protect" : " "}
      </div>
    </div>
  );

  const Back = (
    <div style={{ padding: 10, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {String(card.name ?? "Unknown").toUpperCase()}
        </div>
        <div style={{ fontSize: 11, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        FP: {round1(actual)}
        </div>
      </div>

      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85 }}>
        {card.gameInfo?.date || 'N/A'} • vs {card.gameInfo?.opponent || 'Unknown'}
      </div>

      <div
        style={{
          marginTop: 8,
          borderTop: "1px solid rgba(0,0,0,0.10)",
          paddingTop: 8,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "6px 12px",
          fontSize: 11,
          maxHeight: "60%",
          overflow: "auto",
        }}
      >
        {statEntries.slice(0, 12).map(([key, value]) => (
          <React.Fragment key={key}>
            <span style={{ opacity: 0.75, textTransform: "capitalize" }}>{key.replace(/_/g, ' ')}</span>
            <span style={{ fontWeight: 900, textAlign: "right" }}>{Number(value).toFixed(0)}</span>
          </React.Fragment>
        ))}
      </div>

      {card.achievements && card.achievements.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {card.achievements.slice(0, 3).map((ach) => (
            <span key={ach.id} style={{ ...chip, fontSize: 9, background: "rgba(34,197,94,0.16)" }}>
              {ach.label}
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, opacity: 0.65 }}>Tap to flip back</div>
        <div style={{ fontSize: 11, fontWeight: 900 }}>
          {card.position} • ${card.salary}
        </div>
      </div>
    </div>
  );

  return (
    <div style={containerStyle} onClick={clickable ? onToggleFlip : undefined}>
      <div style={holdRibbon}>PROTECTED</div>
      <div style={mvpBadge}>★ MVP</div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          transition: "transform 220ms ease",
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}>{Front}</div>
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "#fff" }}>
          {Back}
        </div>
      </div>
    </div>
  );
}
