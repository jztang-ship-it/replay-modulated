// src/ui/emotions/EmotionalEvaluator.ts

export type PerformanceTag = "ICE_COLD" | "COLD" | "OK" | "HOT" | "ON_FIRE" | "CAREER_NIGHT";
export type PulseStyle = "NEG" | "NEUTRAL" | "POS" | "JACKPOT";
export type DramaReason = "overperform" | "underperform" | "achievement" | null;

export type Badge = {
  id: string;
  icon: string;
  label: string;
  fp: number;
};

export type RevealableCard = {
  cardId: string;
  actualFp: number;
  projectedFp: number;
  tier?: string;
  badges: Badge[];
  slotIndex: number;
};

export const EMO_TIMING = {
  FLIP_FAST_MS: 180,
  FLIP_SLOW_MS: 420,
  FP_ROLL_FAST_MS: 200,
  FP_ROLL_SLOW_MS: 480,
  TENSION_PAUSE_MS: 100,
} as const;

// Tier rank — higher = reveals later
const TIER_RANK: Record<string, number> = {
  WHITE:  0,
  GREEN:  1,
  BLUE:   2,
  PURPLE: 3,
  ORANGE: 4,
};

function tierRank(tier?: string): number {
  return TIER_RANK[tier?.toUpperCase() ?? "WHITE"] ?? 0;
}

export type CardEmotion = {
  cardId: string;
  ratio: number;
  isDramatic: boolean;
  dramaReason: DramaReason;
  performanceTag: PerformanceTag;
  pulse: PulseStyle;
  flipMs: number;
  fpCountUpMs: number;
  orderScore: number;
};

function safeNum(v: any) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function evaluateCardEmotion(card: RevealableCard): CardEmotion {
  const proj = safeNum(card.projectedFp);
  const act  = safeNum(card.actualFp);
  const badges = Array.isArray(card.badges) ? card.badges : [];
  const badgeCount = badges.length;
  const rank = tierRank(card.tier);

  const ratio = proj > 0 ? act / proj : 1;

  let performanceTag: PerformanceTag = "OK";
  if (proj > 0) {
    if      (ratio >= 1.45) performanceTag = "CAREER_NIGHT";
    else if (ratio >= 1.25) performanceTag = "ON_FIRE";
    else if (ratio >= 1.12) performanceTag = "HOT";
    else if (ratio <= 0.65) performanceTag = "ICE_COLD";
    else if (ratio <= 0.85) performanceTag = "COLD";
  }

  let pulse: PulseStyle = "NEUTRAL";
  if      (performanceTag === "CAREER_NIGHT")                               pulse = "JACKPOT";
  else if (performanceTag === "ON_FIRE" || performanceTag === "HOT")        pulse = "POS";
  else if (performanceTag === "ICE_COLD" || performanceTag === "COLD")      pulse = "NEG";

  let isDramatic = false;
  let dramaReason: DramaReason = null;

  if (badgeCount > 0) {
    isDramatic = true;
    dramaReason = "achievement";
  } else if (proj > 0 && ratio > 1.3) {
    isDramatic = true;
    dramaReason = "overperform";
  } else if (proj > 0 && ratio < 0.7) {
    isDramatic = true;
    dramaReason = "underperform";
  }

  // Anchor cards (ORANGE/PURPLE) always get the slow dramatic flip
  const isAnchor = rank >= 3;
  const flipMs = (isDramatic || isAnchor) ? EMO_TIMING.FLIP_SLOW_MS : EMO_TIMING.FLIP_FAST_MS;
  const fpCountUpMs = (isDramatic || isAnchor) ? EMO_TIMING.FP_ROLL_SLOW_MS : EMO_TIMING.FP_ROLL_FAST_MS;

  // Order score: lower reveals first
  // Base: ratio (underperformers first)
  // Tier pushes anchors later (rank 0-4 adds 0-2.0)
  // Badges push later too
  const tierPush = rank * 0.5;
  const badgePush = badgeCount * 0.15;
  const orderScore = ratio + tierPush + badgePush;

  return {
    cardId: card.cardId,
    ratio,
    isDramatic,
    dramaReason,
    performanceTag,
    pulse,
    flipMs,
    fpCountUpMs,
    orderScore,
  };
}

export type EmotionOrderResult = {
  order: string[];
  flipMsMap: Map<string, number>;
  fpCountUpMsMap: Map<string, number>;
  performanceTagMap: Map<string, PerformanceTag>;
  pulseMap: Map<string, PulseStyle>;
};

export function evaluateEmotionOrder(cards: RevealableCard[]): EmotionOrderResult {
  const flipMsMap        = new Map<string, number>();
  const fpCountUpMsMap   = new Map<string, number>();
  const performanceTagMap = new Map<string, PerformanceTag>();
  const pulseMap         = new Map<string, PulseStyle>();

  const emotions = cards.map(evaluateCardEmotion);

  const order = [...emotions]
    .sort((a, b) => a.orderScore - b.orderScore)
    .map((e) => e.cardId);

  emotions.forEach((e) => {
    flipMsMap.set(e.cardId, e.flipMs);
    fpCountUpMsMap.set(e.cardId, e.fpCountUpMs);
    performanceTagMap.set(e.cardId, e.performanceTag);
    pulseMap.set(e.cardId, e.pulse);
  });

  return { order, flipMsMap, fpCountUpMsMap, performanceTagMap, pulseMap };
}