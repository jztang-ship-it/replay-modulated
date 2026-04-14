import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from './lib/auth.js';
import { supabaseAdmin } from './lib/supabaseServer.js';
import { consumeHand, getCachedResult, cacheResult } from './lib/kv.js';
import { fetchPlayablePool, redrawRoster, pickBiasedLog, fetchGameLogById } from './lib/dealer.js';
import { calculateScore, resolveTier, calculatePayout, isWin } from './lib/scoring.js';

const sendError = (res: VercelResponse, status: number, code: string, message: string) =>
  res.status(status).json({ error: code, message });

const TIER_ORDER = ['BUST', 'ROOKIE', 'STARTER', 'ALL_STAR', 'MVP', 'LEGEND'];
const TIER_THRESHOLDS = { ROOKIE: 190, STARTER: 205, ALL_STAR: 225, MVP: 235, LEGEND: 255 };

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. POST only
  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'POST required');
  }

  // 2. Auth
  const { user, error: authErr } = await verifyAuth(req);
  if (authErr) {
    const status = authErr.message === 'Missing token' ? 401 : 401;
    const code = authErr.message === 'Missing token' ? 'MISSING_TOKEN' : 'INVALID_TOKEN';
    return sendError(res, status, code, authErr.message);
  }
  const userId = user.id;

  // 3. Parse request
  const { handId, heldIndices } = req.body || {};

  if (!handId || typeof handId !== 'string') {
    return sendError(res, 400, 'INVALID_HAND_ID', 'handId is required and must be a string');
  }

  if (!Array.isArray(heldIndices)) {
    return sendError(res, 400, 'INVALID_HELD_INDICES', 'heldIndices must be an array');
  }

  // Validate: unique integers 0-5
  const seen = new Set();
  for (const idx of heldIndices) {
    if (!Number.isInteger(idx) || idx < 0 || idx > 5) {
      return sendError(res, 400, 'INVALID_HELD_INDICES', 'Each heldIndex must be an integer 0-5');
    }
    if (seen.has(idx)) {
      return sendError(res, 400, 'INVALID_HELD_INDICES', 'heldIndices must contain unique values');
    }
    seen.add(idx);
  }

  // 4. Idempotency — check cached result
  let cached: any;
  try {
    cached = await getCachedResult(handId);
  } catch (kvErr: unknown) {
    console.error('[draw] KV getCachedResult failed:', kvErr);
    return sendError(res, 500, 'KV_UNAVAILABLE', 'Could not check cached results');
  }
  if (cached) {
    return res.status(200).json(cached);
  }

  // 5. Atomic consume
  let hand: any;
  try {
    hand = await consumeHand(userId, handId);
  } catch (kvErr: unknown) {
    console.error('[draw] KV consumeHand failed:', kvErr);
    return sendError(res, 500, 'KV_UNAVAILABLE', 'Could not consume hand from KV');
  }
  if (!hand) {
    return sendError(res, 410, 'HAND_EXPIRED', 'Hand not found or already consumed');
  }

  // 6. User binding
  if (hand.userId !== userId) {
    return sendError(res, 403, 'USER_MISMATCH', 'This hand belongs to another user');
  }

  // 7. Build final roster (6 cards)
  const finalRoster = [];

  if (hand.isFtue && hand.ftueDrawCards) {
    // FTUE mode: held slots keep from hand.roster, non-held use ftueDrawCards
    for (let i = 0; i < 6; i++) {
      if (heldIndices.includes(i)) {
        finalRoster.push({ ...hand.roster[i], wasHeld: true });
      } else {
        finalRoster.push({ ...hand.ftueDrawCards[i], wasHeld: false });
      }
    }
  } else {
    // Normal / Protected mode
    const currentRoster = hand.roster.map((c) => ({
      id: c.playerId,
      name: c.name,
      team: c.team,
      position: c.position,
      cost: c.salary,
      tier: c.tier,
    }));

    const pool = await fetchPlayablePool();
    const rnd = mulberry32(Date.now());
    const newRoster = redrawRoster(currentRoster, heldIndices, pool, rnd);

    for (let i = 0; i < 6; i++) {
      const isHeld = heldIndices.includes(i);
      if (isHeld) {
        // Keep original card with its logData
        finalRoster.push({ ...hand.roster[i], wasHeld: true });
      } else {
        // New card — pick a biased log
        const player = newRoster[i];
        const logData = await pickBiasedLog(player.id, player.tier, rnd);
        finalRoster.push({
          playerId: player.id,
          name: player.name,
          team: player.team,
          position: player.position,
          salary: player.cost,
          tier: player.tier,
          logData,
          wasHeld: false,
        });
      }
    }
  }

  // 8. Resolve each card (all 6)
  let totalFp = 0;
  let topScorer = { name: '', fp: 0 };
  let badgeCount = 0;
  const resolvedCards = [];

  for (let i = 0; i < 6; i++) {
    const card = finalRoster[i] as any;
    const stats = card.logData || card.statLine || {};
    const { score, badges } = calculateScore(stats);

    totalFp += score;
    badgeCount += badges.length;

    if (score > topScorer.fp) {
      topScorer = { name: card.name, fp: score };
    }

    resolvedCards.push({
      slot: i,
      position: card.position,
      wasHeld: heldIndices.includes(i),
      player: {
        playerId: card.playerId || card.basePlayerId,
        name: card.name,
        team: card.team,
        salary: card.salary,
        tier: card.tier,
      },
      stats: {
        pts: Number(stats.pts || 0),
        reb: Number(stats.reb || 0),
        ast: Number(stats.ast || 0),
        stl: Number(stats.stl || 0),
        blk: Number(stats.blk || 0),
        turnovers: Number(stats.turnovers || 0),
        min: Number(stats.min || 0),
        gameDate: stats.game_date || stats.gameDate || null,
        matchup: stats.matchup || null,
      },
      fp: score,
      dailyBonus: 0,
      badges: badges.map((b: any) => ({ id: b.id, icon: b.icon, label: b.label, fp: b.fp })),
    });
  }

  // Round totalFp to 1 decimal
  totalFp = Math.round(totalFp * 10) / 10;

  // 9. Determine tier and payout
  const { tier, multiplier, color } = resolveTier(totalFp);
  const basePayout = calculatePayout(multiplier, hand.betAmount);
  const win = isWin(tier);

  // 10. Transactional state update via RPC
  const rosterIds = finalRoster.map((c) => c.playerId);
  const finalRosterJson = JSON.stringify(
    finalRoster.map((c) => ({
      playerId: c.playerId,
      name: c.name,
      team: c.team,
      position: c.position,
      salary: c.salary,
      tier: c.tier,
    }))
  );
  const scoresJson = JSON.stringify(
    resolvedCards.map((c) => ({
      playerId: c.player.playerId,
      fp: c.fp,
      badges: c.badges,
    }))
  );

  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('resolve_hand', {
    p_user_id: userId,
    p_hand_id: hand.handId,
    p_bet_amount: hand.betAmount,
    p_base_payout: basePayout,
    p_is_win: win,
    p_roster_ids: rosterIds,
    p_final_roster: finalRosterJson,
    p_scores: scoresJson,
    p_total_fp: totalFp,
    p_tier: tier,
    p_seed: hand.seed,
    p_is_ftue: hand.isFtue || false,
    p_is_protected: hand.isProtected || false,
  });

  if (rpcError) {
    console.error('[draw] RPC resolve_hand failed:', rpcError);
    return sendError(res, 500, 'RESOLUTION_FAILED', 'Hand resolution failed');
  }

  // 11. Near-miss commentary
  let nearMiss = null;
  const tierIdx = TIER_ORDER.indexOf(tier);
  if (tierIdx < TIER_ORDER.length - 1) {
    const nextTier = TIER_ORDER[tierIdx + 1];
    const gap = Math.round((TIER_THRESHOLDS[nextTier] - totalFp) * 10) / 10;
    if (gap > 0 && gap <= 10) {
      nearMiss = { nextTier, gap };
    }
  }

  // 12. Build response
  const response = {
    version: 'v2',
    handId: hand.handId,
    serverTimestamp: new Date().toISOString(),
    mode: hand.mode,
    summary: {
      totalFp,
      tier,
      tierColor: color,
      betAmount: hand.betAmount,
      basePayout,
      streakCount: rpcResult.streak,
      streakMultiplier: rpcResult.streakMultiplier,
      finalPayout: rpcResult.finalPayout,
      netGain: rpcResult.finalPayout - hand.betAmount,
      newBalance: rpcResult.balance,
      isWin: win,
    },
    finalRoster: finalRoster.map((c) => c.playerId),
    cards: resolvedCards,
    commentary: {
      tierName: tier,
      totalFp,
      topScorer,
      badgeCount,
      nearMiss,
    },
  };

  // 13. Cache result (90s TTL)
  try {
    await cacheResult(handId, response);
  } catch (kvErr) {
    console.error('[draw] cacheResult failed:', kvErr);
    // Non-fatal — continue
  }

  // 14. Async leaderboard insert for MVP+ (fire-and-forget)
  if (totalFp >= 235) {
    supabaseAdmin
      .from('leaderboard')
      .insert({
        user_id: userId,
        hand_id: hand.handId,
        total_fp: totalFp,
        tier,
        roster_ids: rosterIds,
        created_at: new Date().toISOString(),
      })
      .then(() => {})
      .catch((err) => console.error('[draw] leaderboard:', err));
  }

  // 15. Log
  console.log(
    `[draw] userId=${userId} handId=${hand.handId} totalFp=${totalFp} tier=${tier} basePayout=${basePayout} streak=${rpcResult.streak} streakMult=${rpcResult.streakMultiplier} finalPayout=${rpcResult.finalPayout} balance=${rpcResult.balance}`
  );

  // 16. Return response
  return res.status(200).json(response);
}
