import type { GamePhase, PlayerCard } from "../engine/types";
import { StatTable } from "./StatTable";

function tierAccent(tier: PlayerCard["tier"]) {
  switch (tier) {
    case "ORANGE": return "rgba(255,140,0,0.95)";
    case "PURPLE": return "rgba(140,80,255,0.95)";
    case "BLUE": return "rgba(30,144,255,0.95)";
    case "GREEN": return "rgba(46,204,113,0.95)";
    default: return "rgba(0,0,0,0.22)";
  }
}

export function AthleteCard(props: {
  card: PlayerCard;
  locked: boolean;
  showBack: boolean;
  phase: GamePhase;
  isMvp: boolean;
}) {
  const { card, locked, showBack, phase, isMvp } = props;
  const accent = tierAccent(card.tier);

  const actualFp = card.actualFp ?? 0;
  const delta =
    card.fpDelta ??
    (phase === "RESULTS"
      ? Number((actualFp - card.projectedFp).toFixed(1))
      : 0);

  const deltaPillBg =
    delta >= 0 ? "rgba(46,204,113,0.9)" : "rgba(0,0,0,0.25)";

  return (
    <div
      style={{
        height: 190,
        borderRadius: 16,
        border: `2px solid ${accent}`,
        boxShadow: card.tier === "ORANGE" ? `0 0 18px rgba(255,140,0,0.25)` : "none",
        overflow: "hidden",
        position: "relative",
        background: "white",
      }}
    >
      {/* Tier chip always visible */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          padding: "3px 8px",
          borderRadius: 999,
          background: accent,
          color: "white",
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: 0.4,
          zIndex: 3,
        }}
      >
        {card.tier}
      </div>

      {/* MVP */}
      {isMvp && phase === "RESULTS" && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            padding: "4px 10px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.85)",
            color: "white",
            fontSize: 12,
            fontWeight: 900,
            zIndex: 3,
          }}
        >
          MVP
        </div>
      )}

      {/* Protected */}
      {locked && phase === "HOLD" && (
        <div
          style={{
            position: "absolute",
            top: 44,
            left: 10,
            padding: "3px 8px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.82)",
            color: "white",
            fontSize: 11,
            fontWeight: 900,
            zIndex: 3,
          }}
        >
          PROTECTED 🔒
        </div>
      )}

      {!showBack ? (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 24 }}>
            <div style={{ fontWeight: 1000, fontSize: 14, lineHeight: 1.1, textTransform: "uppercase" }}>
              {card.name}
            </div>
            <div style={{ fontWeight: 1000, fontSize: 13, opacity: 0.9 }}>
              {card.position}
            </div>
          </div>

          <div style={{ marginTop: 6, opacity: 0.78, fontSize: 12 }}>
            {card.team} • {card.season}
          </div>

          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Salary</div>
            <div style={{ fontSize: 12, fontWeight: 1000 }}>${card.salary}</div>
          </div>

          {phase !== "RESULTS" ? (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)" }}>
              <div style={{ fontSize: 11, opacity: 0.7 }}>PROJECTED FP</div>
              <div style={{ fontSize: 22, fontWeight: 1000 }}>{card.projectedFp.toFixed(1)}</div>
            </div>
          ) : (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)" }}>
              <div style={{ fontSize: 11, opacity: 0.7 }}>ACTUAL FP</div>
              <div style={{ fontSize: 22, fontWeight: 1000 }}>{actualFp.toFixed(1)}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>
                  PROJ {card.projectedFp.toFixed(1)}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: deltaPillBg,
                    color: "white",
                  }}
                >
                  {delta >= 0 ? `+${delta.toFixed(1)}` : `${delta.toFixed(1)}`}
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: "auto", fontSize: 12, opacity: 0.72 }}>
            {phase === "HOLD" ? "Tap to protect players for redraw." : ""}
            {phase === "RESULTS" ? "Tap to flip for stat sheet." : ""}
          </div>
        </div>
      ) : (
        <div style={{ padding: 12, height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 1000, fontSize: 13, textTransform: "uppercase" }}>{card.name}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{card.position}</div>
          </div>

          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.78 }}>
            {card.team} • {card.season}
          </div>

          {card.gameInfo && (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
              {card.gameInfo.date} • vs {card.gameInfo.opponent}{" "}
              {card.gameInfo.homeAway ? `(${card.gameInfo.homeAway})` : ""}
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 1000 }}>
            FP: {(card.actualFp ?? 0).toFixed(1)} (Proj {card.projectedFp.toFixed(1)})
          </div>

          <div style={{ marginTop: 8, flex: 1, overflow: "auto" }}>
            <StatTable position={card.position} statLine={card.statLine ?? {}} />
          </div>

          {!!card.achievements?.length && (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.92 }}>
              <span style={{ fontWeight: 1000 }}>Badges:</span>{" "}
              {card.achievements.map((a) => a.label).join(", ")}
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.72 }}>
            Tap to flip back.
          </div>
        </div>
      )}

      {/* Accent bar always visible */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 6,
          background: accent,
          opacity: 0.9,
        }}
      />
    </div>
  );
}
