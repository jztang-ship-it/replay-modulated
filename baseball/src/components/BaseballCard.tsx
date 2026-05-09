/**
 * baseball/src/components/BaseballCard.tsx — sport-specific shim.
 *
 * Renders the shared <CardFace> with baseball slot functions:
 *   - getHero            → local MLB headshot (/baseball/headshots/)
 *   - getStatTiles       → pitcher (IP/K/ER/W/QS/BB) or batter (H/HR/RBI/R/BB/SB/2B/3B/PA)
 *   - getDisplayPosition → "BAT" → BatGlyph SVG; pitcher string passes through
 */

import React from "react";
import { CardFace, type CardFaceSlots, type StatTile } from "@shared/components/CardFace";
import { resetAllOverlays } from "@shared/components/PlayerCardShell";
import type { CardFaceProps } from "@shared/components/CardFace";
import { sportAdapter } from "../adapters/SportAdapter";
import type { PlayerCard } from "../adapters/types";

export { resetAllOverlays };

// Baseball ships local headshots at /baseball/headshots/{id}.png.
// The shared headshotUrl helper defaults to the NBA CDN — don't use it here.
function baseballHeadshotUrl(id: string): string {
  return id ? `/baseball/headshots/${id}.png` : "";
}

// Unicode has no "baseball bat alone" emoji (🏏 is cricket). This SVG glyph
// inherits tier color via currentColor so CardFront needs no color prop.
function BatGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: "inline-block", verticalAlign: "middle" }}
      aria-hidden="true"
    >
      <circle cx="4" cy="4" r="2" fill="currentColor" />
      <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="12" y1="12" x2="20" y2="20" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function buildTiles(card: PlayerCard): StatTile[] {
  const sl = (card as any).statLine || {};
  if (sportAdapter.isPitcherPosition(String(card.position ?? ""))) {
    return [
      { key: "ip",      label: "IP",  value: sl.ip      ?? 0 },
      { key: "k",       label: "K",   value: sl.k       ?? 0 },
      { key: "er",      label: "ER",  value: sl.er      ?? 0 },
      { key: "w",       label: "W",   value: sl.w       ?? 0 },
      { key: "qs",      label: "QS",  value: sl.qs      ?? 0 },
      { key: "bb",      label: "BB",  value: sl.bb      ?? 0 },
    ];
  }
  return [
    { key: "h",       label: "H",   value: sl.h       ?? 0 },
    { key: "hr",      label: "HR",  value: sl.hr      ?? 0 },
    { key: "rbi",     label: "RBI", value: sl.rbi     ?? 0 },
    { key: "r",       label: "R",   value: sl.r       ?? 0 },
    { key: "bb",      label: "BB",  value: sl.bb      ?? 0 },
    { key: "sb",      label: "SB",  value: sl.sb      ?? 0 },
    { key: "doubles", label: "2B",  value: sl.doubles ?? 0 },
    { key: "triples", label: "3B",  value: sl.triples ?? 0 },
    { key: "pa",      label: "PA",  value: sl.pa      ?? 0 },
  ];
}

const SLOTS: CardFaceSlots = {
  getHero: (card) => {
    const photoCode = String((card as any)?.photoCode ?? (card as any)?.basePlayerId ?? "").trim();
    return {
      imageUrl: baseballHeadshotUrl(photoCode) || null,
      alt: String((card as any).name ?? ""),
    };
  },
  getStatTiles: buildTiles,
  getDisplayPosition: (card) => {
    const s = sportAdapter.displayPosition((card as any)?.position);
    return s === "BAT" ? <BatGlyph /> : s;
  },
  showStatTileFp: false,
};

type Props = Omit<CardFaceProps, keyof CardFaceSlots>;

export function BaseballCard(props: Props) {
  return <CardFace {...props} {...SLOTS} />;
}
