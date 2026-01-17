import { useMemo } from "react";
import type { GamePhase, PlayerCard, Position, TierColor } from "../engine/types";

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
    const v = s[k];
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function statRowsForPosition(pos: Position, stats: Record<string, any> | undefined) {
  const minutes = getStat(stats, ["minutes", "minutesPlayed"]);
  const goals = getStat(stats, ["goals_scored"]);
  const assists = getStat(stats, ["assists"]);
  const cs = getStat(stats, ["clean_sheets"]);
  const gc = getStat(stats, ["goals_conceded"]);
  const saves = getStat(stats, ["saves"]);
  const yc = getStat(stats, ["yellow_cards"]);
  const rc = getStat(stats, ["red_cards"]);
  const bonus = getStat(stats, ["bonus"]);
  const bps = getStat(stats, ["bps"]);
  const tp = getStat(stats, ["total_points"]);

  if (pos === "GK") {
    return [
      ["Total Points", tp],
      ["Minutes", minutes],
      ["Saves", saves],
      ["Goals Conceded", gc],
      ["Clean Sheet", cs],
      ["Yellow", yc],
      ["Red", rc],
      ["Bonus", bonus],
      ["BPS", bps],
    ] as Array<[string, number]>;
  }

  if (pos === "DEF") {
    return [
      ["Total Points", tp],
      ["Minutes", minutes],
      ["Clean Sheet", cs],
      ["Goals Conceded", gc],
      ["Goals", goals],
      ["Assists", assists],
      ["Yellow", yc],
      ["Red", rc],
      ["Bonus", bonus],
      ["BPS", bps],
    ] as Array<[string, number]>;
  }

  if (pos === "MID") {
    return [
      ["Total Points", tp],
      ["Minutes", minutes],
      ["Goals", goals],
      ["Assists", assists],
      ["Clean Sheet", cs],
      ["Yellow", yc],
      ["Red", rc],
      ["Bonus", bonus],
      ["BPS", bps],
    ] as Array<[string, number]>;
  }

  return [
    ["Total Points", tp],
    ["Minutes", minutes],
    ["Goals", goals],
    ["Assists", assists],
    ["Yellow", yc],
    ["Red", rc],
    ["Bonus", bonus],
    ["BPS", bps],
  ] as Array<[string, number]>;
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

  // IMPORTANT: no clamping — allow negative values
  const proj = Number(card.projectedFp ?? 0);
  const actual = Number(card.actualFp ?? 0);
  const delta = Number(card.fpDelta ?? 0);

  const showResults = phase === "RESULTS";
  const clickable = canFlip && phase === "RESULTS";

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: 160,
    borderRadius: 14,
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
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.8,
    display: isLocked ? "block" : "none",
  };

  const mvpBadge: React.CSSProperties = {
    position: "absolute",
    top: 10,
    right: 10,
    background: "#f59e0b",
    color: "white",
    fontSize: 11,
    fontWeight: 900,
    padding: "4px 8px",
    borderRadius: 999,
    display: isMvp ? "inline-flex" : "none",
    alignItems: "center",
    gap: 6,
  };

  const tierPill: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 8px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.06)",
    fontSize: 11,
    fontWeight: 800,
  };

  const bigNumberBox: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: 12,
    padding: "8px 10px",
    minWidth: 90,
    textAlign: "right",
    background: "rgba(0,0,0,0.02)",
  };

  const deltaStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    background: delta >= 0 ? "rgba(34,197,94,0.15)" : "rgba(107,114,128,0.18)",
  };

  const rows = useMemo(() => statRowsForPosition(card.position, card.statLine as any), [card.position, card.statLine]);

  const Front = (
    <div style={{ padding: 12, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={tierPill}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: t.border, display: "inline-block" }} />
              {card.position} • {t.label}
            </span>
          </div>

          <div style={{ marginTop: 8, fontSize: 16, fontWeight: 950, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {String(card.name ?? "Unknown").toUpperCase()}
          </div>

          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {card.team ?? "Unknown"} • {seasonLabel}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <div style={bigNumberBox}>
            <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 800 }}>SALARY</div>
            <div style={{ fontSize: 18, fontWeight: 950 }}>${card.salary}</div>
          </div>

          <div style={bigNumberBox}>
            <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 800 }}>PROJ FP</div>
            <div style={{ fontSize: 18, fontWeight: 950 }}>{round1(proj)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ fontSize: 11, opacity: 0.65 }}>
          {clickable ? "Tap to view box score" : phase === "HOLD" ? "Tap to protect" : " "}
        </div>

        {showResults && (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={bigNumberBox}>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 800 }}>ACT FP</div>
              <div style={{ fontSize: 18, fontWeight: 950 }}>{round1(actual)}</div>
            </div>

            <div>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 800, textAlign: "right" }}>VS PROJ</div>
              <div style={deltaStyle}>{delta >= 0 ? `+${round1(delta)}` : `${round1(delta)}`}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const Back = (
    <div style={{ padding: 12, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {String(card.name ?? "Unknown").toUpperCase()}
        </div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{card.team ?? "Unknown"} • {seasonLabel}</div>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
        Match Date: {card.gameInfo?.date ?? "N/A"}
      </div>

      <div style={{ marginTop: 10, borderTop: "1px solid rgba(0,0,0,0.10)", paddingTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {rows.slice(0, 10).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ opacity: 0.75 }}>{k}</span>
            <span style={{ fontWeight: 900 }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, opacity: 0.65 }}>Tap to flip back</div>
        <div style={{ fontSize: 11, fontWeight: 900 }}>{card.position} • ${card.salary}</div>
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
