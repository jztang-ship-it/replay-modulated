/**
 * shared/components/CardBackGeneric.tsx
 * LAYER 1: Branded face-down card back — 100% sport-agnostic.
 *
 * Shows during: initial deal, after DRAW (all cards flip to this before reveal).
 * Both basketball and worldcup use this identically.
 * All sports import from "@shared/components/CardBackGeneric".
 */

import React from "react";

type Props = {
  isFlipping?: boolean;
};

export function CardBackGeneric({ isFlipping }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 18,
        overflow: "hidden",
        background: "linear-gradient(160deg, #1A2540 0%, #111828 50%, #0C1220 100%)",
        boxShadow: isFlipping
          ? "0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(255,177,74,0.12)"
          : "0 8px 24px rgba(0,0,0,0.4)",
        transition: "box-shadow 300ms ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Diamond grid pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            repeating-linear-gradient(
              45deg,
              rgba(255,177,74,0.025) 0px,
              rgba(255,177,74,0.025) 1px,
              transparent 1px,
              transparent 18px
            ),
            repeating-linear-gradient(
              -45deg,
              rgba(255,177,74,0.025) 0px,
              rgba(255,177,74,0.025) 1px,
              transparent 1px,
              transparent 18px
            )
          `,
        }}
      />

      {/* Center emblem */}
      <div
        style={{
          position: "relative",
          width: 64,
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid rgba(255,177,74,0.25)" }} />
        <div style={{ position: "absolute", inset: 10, borderRadius: "50%", border: "1px solid rgba(255,177,74,0.15)" }} />
        <span style={{ fontSize: 22, fontWeight: 950, color: "rgba(255,177,74,0.35)", letterSpacing: -1, fontStyle: "italic", lineHeight: 1 }}>
          R
        </span>
      </div>

      {/* Bottom wordmark */}
      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 7,
          fontWeight: 900,
          letterSpacing: 3,
          color: "rgba(255,177,74,0.2)",
          textTransform: "uppercase",
        }}
      >
        REPLAY FS
      </div>

    </div>
  );
}