// src/components/CardBackGeneric.tsx
// LAYER 1: Branded face-down card back
// Shows during: initial deal, after DRAW (all cards flip to this before reveal)

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
        background: "linear-gradient(160deg, #0E1628 0%, #080E1C 50%, #050810 100%)",
        border: "2px solid rgba(255,177,74,0.20)",
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
        {/* Outer ring */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1.5px solid rgba(255,177,74,0.25)",
          }}
        />
        {/* Inner ring */}
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            border: "1px solid rgba(255,177,74,0.15)",
          }}
        />
        {/* R mark */}
        <span
          style={{
            fontSize: 22,
            fontWeight: 950,
            color: "rgba(255,177,74,0.35)",
            letterSpacing: -1,
            fontStyle: "italic",
            lineHeight: 1,
          }}
        >
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

      {/* Top corners */}
      <Corner style={{ position: "absolute", top: 10, left: 10, opacity: 0.18 }} />
      <Corner style={{ position: "absolute", top: 10, right: 10, opacity: 0.18, transform: "scaleX(-1)" }} />
      <Corner style={{ position: "absolute", bottom: 10, left: 10, opacity: 0.18, transform: "scaleY(-1)" }} />
      <Corner style={{ position: "absolute", bottom: 10, right: 10, opacity: 0.18, transform: "scale(-1)" }} />
    </div>
  );
}

function Corner({ style }: { style: React.CSSProperties }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={style}>
      <path d="M0 0 L14 0 L14 3 L3 3 L3 14 L0 14 Z" fill="rgba(255,177,74,0.9)" />
    </svg>
  );
}
