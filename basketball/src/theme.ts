export type TierTokens = {
  bg: string;
  bgEnd: string;
  frame: string;
  glow: string;
};

export function getTier(tierRaw: any): TierTokens {
  const t = String(tierRaw ?? "").toUpperCase();

  if (t.includes("ORANGE")) return {
    bg: "#2A1500", bgEnd: "#0F0800",
    frame: "rgba(255,160,50,0.90)", glow: "rgba(255,140,30,0.28)",
  };
  if (t.includes("PURPLE")) return {
    bg: "#1A0D2E", bgEnd: "#080612",
    frame: "rgba(175,100,255,0.88)", glow: "rgba(160,90,255,0.26)",
  };
  if (t.includes("BLUE")) return {
    bg: "#071828", bgEnd: "#020A12",
    frame: "rgba(70,155,255,0.88)", glow: "rgba(60,140,255,0.24)",
  };
  if (t.includes("GREEN")) return {
    bg: "#061A0F", bgEnd: "#020A06",
    frame: "rgba(60,210,120,0.88)", glow: "rgba(50,200,110,0.22)",
  };
  return {
    bg: "#141820", bgEnd: "#080A10",
    frame: "rgba(200,215,240,0.55)", glow: "rgba(200,215,240,0.12)",
  };
}

export const THEME = {
  palette: {
    green_primary:  "#4ADE80",
    blue_primary:   "#38BDF8",
    blue_secondary: "#7DD3FC",
    black:          "#000000",
  },
  colors: {
    textPrimary:   "#FFFFFF",
    surfaceStroke: "rgba(255,255,255,0.12)",
  },
  button: {
    default: "#FFFFFF",
    action: {
      borderRadius: 14,
    },
    multiplier: {
      active:   { bg: "#FFFFFF" },
      inactive: { bg: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" },
    },
  },
};
