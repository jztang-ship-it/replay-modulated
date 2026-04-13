export type TierKey = "RED" | "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";

export interface TierTokens {
  bg: string;
  bgEnd: string;
  accent: string;
  isLight: boolean;
  frame: string;
  glow: string;
}

/** Top-right position text (e.g. PG / C) — designer palette; salary tier breakpoints unchanged */
export const TIER_POSITION_TEXT: Record<TierKey, string> = {
  RED:    "#a81c2b",
  ORANGE: "#d16523",
  PURPLE: "#8524cd",
  GREEN:  "#74ab1d",
  BLUE:   "#1caebf",
  WHITE:  "#4d525f",
};

export const TIER_TOKENS: Record<TierKey, TierTokens> = {
  // RED = $73+ "bug" tier (Jokić, Giannis, Wemby, Shai, Luka, AD). Deep crimson to
  // distinguish from GOAT tier red (#EF4444) and ORANGE (#FC7100).
  RED:    { bg: "#B91C1C", bgEnd: "#F43F5E", accent: "#F43F5E", isLight: false, frame: "rgba(244,63,94,0.92)",   glow: "rgba(220,38,38,0.32)"   },
  ORANGE: { bg: "#FC7100", bgEnd: "#FFA200", accent: "#FFA200", isLight: false, frame: "rgba(255,160,50,0.90)",  glow: "rgba(255,140,30,0.28)"  },
  PURPLE: { bg: "#7E00FF", bgEnd: "#1A0033", accent: "#BB5BFF", isLight: false, frame: "rgba(175,100,255,0.88)", glow: "rgba(160,90,255,0.26)"  },
  BLUE:   { bg: "#0C6F86", bgEnd: "#00FFD8", accent: "#00FFD8", isLight: false, frame: "rgba(70,155,255,0.88)",  glow: "rgba(60,140,255,0.24)"  },
  GREEN:  { bg: "#467C00", bgEnd: "#AFFE1E", accent: "#AFFE1E", isLight: false, frame: "rgba(60,210,120,0.88)",  glow: "rgba(50,200,110,0.22)"  },
  WHITE:  { bg: "#1D212D", bgEnd: "#1E222E", accent: "#94A3B8", isLight: true,  frame: "rgba(200,215,240,0.55)", glow: "rgba(200,215,240,0.12)" },
};

export function getTier(tier: string | undefined): TierTokens {
  const key = (tier ?? "WHITE").toUpperCase() as TierKey;
  return TIER_TOKENS[key] ?? TIER_TOKENS.WHITE;
}

export const CARD_LAYOUT = {
  nameStripTop:    73.5,
  nameStripHeight: 10.5,
  infoStripTop:    84,
  borderRadius:    18,
  borderWidth:     1.5,
  aspectRatio:     0.72,
} as const;

export const THEME = {
  palette: {
    green_primary:   "#36D46B",
    green_secondary: "#1FA94B",
    blue_primary:    "#3AA0FF",
    blue_secondary:  "#1D6DD7",
    black:           "#000000",
    white:           "#FFFFFF",
    gold:            "#FFB14A",
    bonus_gold:      "#FFEA86",
  },
  colors: {
    textPrimary:   "#EAF0FF",
    textMuted:     "rgba(255,255,255,0.40)",
    textDim:       "rgba(255,255,255,0.25)",
    surfaceStroke: "rgba(255,255,255,0.18)",
    surfaceFill:   "rgba(255,255,255,0.06)",
    bonusGold:     "#FFEA86",
    stampGold:     "#FFD700",
    stampBlue:     "#7DD3FC",
    accentGreen:   "#36D46B",
    accentBlue:    "#3AA0FF",
    accentRed:     "#ef4444",
  },
  button: {
    default: "linear-gradient(180deg, #FFB14A 0%, #FF7A2F 100%)",
    action: { borderRadius: 16 },
    multiplier: {
      active:   { bg: "rgba(100,180,255,0.22)" },
      inactive: { bg: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.16)" },
    },
  },
  bgBase:         "#070A12",
  bgSurface:      "#0A1020",
  bgCard:         "#070A12",
  cardBackBg:     "linear-gradient(160deg, #0E1628 0%, #080E1C 50%, #050810 100%)",
  cardBackBorder: "rgba(255,177,74,0.20)",
  cardBackR:      "rgba(255,177,74,0.35)",
  fontFamily:     "'Inter', system-ui, sans-serif",
  radiusCard:     18,
  radiusPanel:    16,
  radiusPill:     99,
  /** Wallet label row ↔ primary action button (GameBar footers; keep in sync across screens) */
  layout: {
    walletActionGapPx: 14,
  },
} as const;
