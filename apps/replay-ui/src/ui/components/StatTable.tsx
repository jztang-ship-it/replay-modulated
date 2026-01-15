import { useMemo } from "react";
import type { Position } from "../engine/types";

function label(k: string) {
  const map: Record<string, string> = {
    minutes: "Minutes",
    goals: "Goals",
    assists: "Assists",
    cleanSheets: "Clean Sheets",
    goalsConceded: "Goals Conceded",
    saves: "Saves",
    yellowCards: "Yellow",
    redCards: "Red",
    bonus: "Bonus",
    bps: "BPS",
    influence: "Influence",
    creativity: "Creativity",
    threat: "Threat",
    ictIndex: "ICT",
  };
  return map[k] ?? k;
}

function pickKeys(position: Position, statLine: Record<string, number>) {
  const common = ["minutes", "yellowCards", "redCards", "bonus"];
  const gk = ["saves", "goalsConceded", "cleanSheets", "bps"];
  const outfield = ["goals", "assists", "cleanSheets", "goalsConceded", "influence", "creativity", "threat", "ictIndex"];

  const preferred = position === "GK" ? [...gk, ...common] : [...outfield, ...common];
  return preferred.filter((k) => statLine[k] !== undefined);
}

export function StatTable(props: { position: Position; statLine: Record<string, number> }) {
  const { position, statLine } = props;
  const keys = useMemo(() => pickKeys(position, statLine), [position, statLine]);

  if (keys.length === 0) return <div style={{ fontSize: 12, opacity: 0.7 }}>No stat breakdown available.</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
      {keys.map((k) => (
        <div key={k} style={{ display: "contents" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{label(k)}</div>
          <div style={{ fontSize: 12, fontWeight: 900 }}>
            {Number.isFinite(statLine[k]) ? statLine[k].toFixed(2) : String(statLine[k])}
          </div>
        </div>
      ))}
    </div>
  );
}
