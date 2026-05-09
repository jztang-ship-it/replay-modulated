/**
 * basketball/src/components/AthleteCard.tsx — sport-specific shim.
 *
 * Renders the shared <CardFace> with basketball slot functions:
 *   - getHero            → NBA headshot URL (no flag/fallback overrides)
 *   - getStatTiles       → statDisplay lookup → fixed BASKETBALL_ORDER layout
 *   - getDisplayPosition → adapter.displayPosition (PG/SG/SF/PF/C)
 *
 * Was 277 lines of duplicated front + back markup; that all lives in
 * shared/components/CardFace.tsx now.
 */

import { CardFace, type CardFaceSlots, type StatTile } from "@shared/components/CardFace";
import { resetAllOverlays } from "@shared/components/PlayerCardShell";
import type { CardFaceProps } from "@shared/components/CardFace";
import { sportAdapter } from "../adapters/SportAdapter";
import type { PlayerCard } from "../adapters/types";
import { headshotUrl } from "@shared/utils/headshotUrl";

export { resetAllOverlays };

// ── Stat tile order ────────────────────────────────────────────────────────
// Basketball cards always show the same 6 stat tiles in the same slots so
// users can scan across cards row-by-row without each row's labels jumping.
// statDisplay drives WHICH stats are populated; this array enforces ORDER.

const BASKETBALL_ORDER = ["PTS", "REB", "AST", "BLK", "STL", "TO"];
const KEY_ALIASES: Record<string, string> = {
  TURNOVERS: "TO", TOV: "TO", TURNOVER: "TO",
};

function getStatValue(sl: Record<string, any>, key: string, variants: string[]): any {
  for (const k of [key, ...variants]) {
    const v = sl?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const vc = sl?.[camel];
    if (vc !== undefined && vc !== null && vc !== "") return vc;
  }
  return undefined;
}

function buildTiles(card: PlayerCard): StatTile[] {
  const sl = (card as any).statLine || {};
  const pos = String(card.position ?? "");
  const display = (sportAdapter.config as any).statDisplay ?? {};
  const defs: Array<{ key: string; variants: string[]; label: string }> =
    display[pos] ?? display.default ?? [];

  const collected: StatTile[] = [];
  for (const def of defs) {
    const v = getStatValue(sl, def.key, def.variants);
    if (v !== undefined) {
      const upperKey = (KEY_ALIASES[def.label.toUpperCase()] ?? def.label.toUpperCase());
      collected.push({ key: upperKey, label: upperKey, value: v });
    }
  }

  // Enforce BASKETBALL_ORDER positional layout — missing stats show as 0.
  const byKey = new Map(collected.map(t => [t.key, t]));
  return BASKETBALL_ORDER.map(k => byKey.get(k) ?? { key: k, label: k, value: 0 });
}

const SLOTS: CardFaceSlots = {
  getHero: (card) => ({
    imageUrl: headshotUrl(String((card as any).basePlayerId ?? "")) || null,
    alt: String((card as any).name ?? ""),
  }),
  getStatTiles: buildTiles,
  getDisplayPosition: (card) => sportAdapter.displayPosition((card as any).position),
  showStatTileFp: false,
};

type Props = Omit<CardFaceProps, keyof CardFaceSlots>;

export function AthleteCard(props: Props) {
  return <CardFace {...props} {...SLOTS} />;
}

export function AthleteCardLegacy(props: Props) {
  return <AthleteCard {...props} />;
}
