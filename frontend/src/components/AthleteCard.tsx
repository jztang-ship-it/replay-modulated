import React, { useMemo } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";
import { AthleteCardFront } from "./AthleteCardFront";

type Props = {
  card: PlayerCard;
  phase: GamePhase;
  isLocked: boolean;
  isMvp: boolean;
  isFlipped: boolean;
  canFlip: boolean;
  onToggleFlip: () => void;
};

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function prettyKey(k: string) {
  return String(k)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toUpperCase();
}

function pickBreakdown(card: any): Record<string, number> | null {
  const candidates = [
    card?.fpBreakdown,
    card?.pointsByStat,
    card?.fpByStat,
    card?.statFp,
    card?.scoringBreakdown,
    card?.fantasyPointsByStat,
    card?.fantasyBreakdown,
  ];

  for (const c of candidates) {
    if (!c) continue;

    if (typeof c === "object" && !Array.isArray(c)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(c)) {
        const n = Number(v);
        if (Number.isFinite(n) && n !== 0) out[String(k)] = n;
      }
      if (Object.keys(out).length) return out;
    }

    if (Array.isArray(c)) {
      const out: Record<string, number> = {};
      for (const row of c) {
        const key = row?.stat ?? row?.key ?? row?.label ?? row?.name;
        const val = row?.fp ?? row?.points ?? row?.value;
        const n = Number(val);
        if (key && Number.isFinite(n) && n !== 0) out[String(key)] = n;
      }
      if (Object.keys(out).length) return out;
    }
  }

  return null;
}

function pickStatsUsed(card: any): Record<string, any> | null {
  const candidates = [
    card?.statLine,
    card?.statsUsed,
    card?.gameInfo?.stats,
    card?.stats,
    card?.boxScore,
    card?.gameLog?.stats,
    card?.log?.stats,
  ];

  for (const s of candidates) {
    if (s && typeof s === "object" && !Array.isArray(s)) return s;
  }

  return null;
}

function BackAReplace() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 18,
        overflow: "hidden",
        background: "linear-gradient(180deg, rgba(12,18,32,1) 0%, rgba(7,11,20,1) 100%)",
        display: "grid",
        placeItems: "center",
        color: "rgba(255,255,255,0.92)",
        fontWeight: 950,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        backfaceVisibility: "hidden",
      }}
    >
      Replacing…
    </div>
  );
}

function BackBStats({ card }: { card: PlayerCard }) {
  const anyCard: any = card;

  const breakdown = useMemo(() => pickBreakdown(anyCard), [anyCard]);
  const statsUsed = useMemo(() => pickStatsUsed(anyCard), [anyCard]);

  const breakdownRows = useMemo(() => {
    if (!breakdown) return [];
    return Object.entries(breakdown)
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  }, [breakdown]);

  const statsRows = useMemo(() => {
    if (!statsUsed) return [];
    return Object.entries(statsUsed)
      .map(([k, v]) => ({ k, v }))
      .filter((r) => r.k && r.v != null && r.v !== "" && r.v !== 0)
      .slice(0, 28);
  }, [statsUsed]);

  // Date/Opponent extraction (try multiple shapes)
  const gi = anyCard?.gameInfo ?? {};
  const opponent = String(gi?.opponent ?? anyCard?.opponent ?? anyCard?.vs ?? anyCard?.matchup ?? "").trim();
  const ha = String(gi?.homeAway ?? anyCard?.homeAway ?? "").trim();
  const date = String(gi?.date ?? anyCard?.date ?? anyCard?.gameDate ?? anyCard?.matchDate ?? "").trim();
  const title = opponent ? `${ha === "H" ? "vs" : "@"} ${opponent}` : "Game Log";

  const fp = toNum(anyCard?.actualFp);
  const proj = toNum(anyCard?.projectedFp);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 18,
        overflow: "hidden",
        background: "linear-gradient(180deg, rgba(12,18,32,1) 0%, rgba(7,11,20,1) 100%)",
        color: "rgba(255,255,255,0.92)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        backfaceVisibility: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 950, letterSpacing: 0.8 }}>{title}</div>
          <div style={{ opacity: 0.75, fontSize: 12 }}>{date || " "}</div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ opacity: 0.75, fontSize: 12 }}>FP</div>
          <div style={{ fontWeight: 950, fontSize: 18 }}>{Number.isFinite(fp) ? fp.toFixed(fp % 1 === 0 ? 0 : 1) : "0"}</div>
          <div style={{ opacity: 0.65, fontSize: 11 }}>Proj {proj.toFixed(proj % 1 === 0 ? 0 : 1)}</div>
        </div>
      </div>

      {/* Breakdown */}
      <div
        style={{
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          padding: 10,
        }}
      >
        <div style={{ fontWeight: 900, opacity: 0.9, marginBottom: 8 }}>FP Breakdown</div>

        {breakdownRows.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            {breakdownRows.map((r) => (
              <div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div
                  style={{
                    opacity: 0.9,
                    fontSize: 12,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {prettyKey(r.k)}
                </div>
                <div style={{ fontWeight: 950, fontSize: 12, flexShrink: 0 }}>
                  {r.v > 0 ? `+${r.v}` : `${r.v}`}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ opacity: 0.75, fontSize: 12, lineHeight: 1.35 }}>
            No per-stat FP breakdown found on this card yet.
          </div>
        )}
      </div>

      {/* Stats Used */}
      <div style={{ flex: 1, overflow: "auto", borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", padding: 10 }}>
        <div style={{ fontWeight: 900, opacity: 0.9, marginBottom: 8 }}>Stats Used</div>

        {statsRows.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            {statsRows.map((r) => (
              <div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div
                  style={{
                    opacity: 0.9,
                    fontSize: 12,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {prettyKey(r.k)}
                </div>
                <div style={{ fontWeight: 900, fontSize: 12, flexShrink: 0 }}>{String(r.v)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ opacity: 0.75, fontSize: 12, lineHeight: 1.35 }}>
            No structured stats found on this card.
            <div style={{ marginTop: 8, fontWeight: 900, opacity: 0.9 }}>Raw card fields:</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11, opacity: 0.85 }}>
              {JSON.stringify(
                {
                  gameInfo: anyCard?.gameInfo ?? null,
                  statLine: anyCard?.statLine ?? null,
                  statsUsed: anyCard?.statsUsed ?? null,
                  stats: anyCard?.stats ?? null,
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", opacity: 0.65, fontSize: 12 }}>Tap card to flip back</div>
    </div>
  );
}

function AthleteCardBack(props: Props) {
  const { phase, isLocked, card } = props;

  // Back A in HOLD for unheld cards
  if (phase === "HOLD" && !isLocked) return <BackAReplace />;

  // Back B in RESULTS
  if (phase === "RESULTS") return <BackBStats card={card} />;

  return <BackAReplace />;
}

export function AthleteCard(props: Props) {
  const { isFlipped } = props;

  const flipContainer: React.CSSProperties = {
    perspective: "1200px",
    width: "100%",
    height: "100%",
  };

  const flipInner: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    transformStyle: "preserve-3d",
    transition: "transform 520ms cubic-bezier(.2,.9,.2,1)",
    transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
  };

  const faceFront: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backfaceVisibility: "hidden",
  };

  const faceBack: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    transform: "rotateY(180deg)",
    backfaceVisibility: "hidden",
  };

  return (
    <div style={flipContainer}>
      <div style={flipInner}>
        <div style={faceFront}>
          <AthleteCardFront {...props} />
        </div>

        <div style={faceBack}>
          <AthleteCardBack {...props} />
        </div>
      </div>
    </div>
  );
}
