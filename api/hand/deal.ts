import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from 'crypto';
import { verifyAuth } from '../_lib-hand/auth';
import { supabaseAdmin } from '../_lib-hand/supabaseServer';
import { fetchPlayablePool, generateRoster, pickBiasedLog } from '../_lib-hand/dealer';
import { findPendingHand, storePendingHand } from '../_lib-hand/kv';
import { isFtueEligible, FTUE_DEAL_ROSTER, FTUE_DRAW_CARDS } from '../_lib-hand/ftue';
import { getProtectionConfig, selectBestCandidate } from '../_lib-hand/protection';
import { calculateScore } from '../_lib-hand/scoring';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VALID_MULTIPLIERS = [1, 2, 5, 10];
const BASE_BET = 10;
const MIN_BALANCE_FLOOR = 10;
const HAND_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sendError = (res, status, code, message) =>
  res.status(status).json({ error: code, message });

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
  console.log("=== ENV CHECK ===")
  console.log("SUPABASE KEY EXISTS:", !!process.env.SUPABASE_SERVICE_ROLE_KEY)
  console.log("KV URL EXISTS:", !!process.env.KV_REST_API_URL)
  console.log("KV TOKEN EXISTS:", !!process.env.KV_REST_API_TOKEN)
  // 1. POST only
  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'POST required');
  }

  // 2. Auth
  const { user, error: authErr } = await verifyAuth(req);
  if (authErr) {
    return sendError(res, authErr.status, 'UNAUTHORIZED', authErr.message);
  }
  const userId = user.id;

  // 3. Validate betMultiplier
  const betMultiplier = Number(req.body?.betMultiplier ?? 1);
  if (!VALID_MULTIPLIERS.includes(betMultiplier)) {
    return sendError(res, 400, 'INVALID_BET', `betMultiplier must be one of ${VALID_MULTIPLIERS.join(', ')}`);
  }
  const betAmount = BASE_BET * betMultiplier;

  // 4. Read player_state
  const { data: stateRow, error: stateErr } = await supabaseAdmin
    .from('player_state')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (stateErr) {
    return sendError(res, 500, 'DEAL_FAILED', 'Failed to read player state');
  }

  const playerState = stateRow || { balance: 100000, hands_played: 0, ftue_completed: false };
  let balance = playerState.balance ?? 100000;

  // 5. Balance floor
  if (balance < MIN_BALANCE_FLOOR) {
    balance = MIN_BALANCE_FLOOR;
    await supabaseAdmin
      .from('player_state')
      .upsert({ id: userId, balance: MIN_BALANCE_FLOOR }, { onConflict: 'id' });
  }

  // 6. Balance check
  if (balance < betAmount) {
    return sendError(res, 400, 'INSUFFICIENT_BALANCE', `Need ${betAmount} but have ${balance}`);
  }

  // 7. Check existing pending hand
  try {
    const existing = await findPendingHand(userId);
    if (existing) {
      return res.status(409).json({
        error: 'HAND_EXISTS',
        message: 'You already have a pending hand',
        handId: existing.handId,
      });
    }
  } catch (kvErr) {
    console.error('[deal] KV read failed:', kvErr);
    return sendError(res, 500, 'KV_UNAVAILABLE', 'Could not check pending hands');
  }

  // 8. Determine mode
  const isFtue = isFtueEligible(playerState);
  const protectionConfig = !isFtue ? getProtectionConfig(playerState.hands_played) : null;
  const isProtected = !!protectionConfig;
  const mode = isFtue ? 'FTUE' : isProtected ? 'PROTECTED' : 'NORMAL';

  // RNG
  const rnd = mulberry32(Date.now() ^ Math.floor(Math.random() * 1e9));

  // 9. Generate hand
  let roster;

  try {
    if (isFtue) {
      // FTUE: use scripted roster directly
      roster = FTUE_DEAL_ROSTER.map((card) => ({
        playerId: card.basePlayerId,
        name: card.name,
        team: card.team,
        position: card.position,
        salary: card.salary,
        tier: card.tier,
        logData: card.statLine,
      }));
    } else {
      // Fetch pool for protected & normal modes
      const pool = await fetchPlayablePool();
      if (!pool || pool.length < 6) {
        return sendError(res, 500, 'POOL_EMPTY', 'Not enough active players');
      }

      if (isProtected) {
        // Protected: generate multiple candidates, pick best
        const { maxCandidates, floor } = protectionConfig;
        const candidates = [];

        for (let c = 0; c < maxCandidates; c++) {
          const gen = generateRoster(pool, rnd);
          if (!gen) continue;

          // Pick biased log for each player and calculate total FP
          const rosterWithLogs = [];
          let totalFp = 0;

          for (const player of gen) {
            const log = await pickBiasedLog(player.id, player.tier, rnd);
            const scoreResult = log ? calculateScore(log) : { score: 0 };
            totalFp += scoreResult.score;
            rosterWithLogs.push({
              playerId: player.id,
              name: player.name,
              team: player.team,
              position: player.position,
              salary: player.cost,
              tier: player.tier,
              logData: log,
            });
          }

          candidates.push({ totalFp, roster: rosterWithLogs });
        }

        if (!candidates.length) {
          return sendError(res, 500, 'DEAL_FAILED', 'Could not generate any valid roster');
        }

        const best = selectBestCandidate(candidates, floor);
        roster = best.roster;
      } else {
        // Normal: single roster generation
        const gen = generateRoster(pool, rnd);
        if (!gen) {
          return sendError(res, 500, 'DEAL_FAILED', 'Could not generate a valid roster');
        }

        roster = [];
        for (const player of gen) {
          const log = await pickBiasedLog(player.id, player.tier, rnd);
          roster.push({
            playerId: player.id,
            name: player.name,
            team: player.team,
            position: player.position,
            salary: player.cost,
            tier: player.tier,
            logData: log,
          });
        }
      }
    }
  } catch (dealErr) {
    console.error('[deal] Generation failed:', dealErr);
    return sendError(res, 500, 'DEAL_FAILED', 'Hand generation failed');
  }

  // 11. Generate handId
  const handId = crypto.randomUUID();

  // 12. Generate seed
  const seed = crypto.randomUUID();

  // 13. Store in KV
  const now = new Date();
  const handData = {
    version: 2,
    handId,
    userId,
    betMultiplier,
    betAmount,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + HAND_TTL_MS).toISOString(),
    seed,
    debug: false,
    consumed: false,
    isFtue,
    isProtected,
    protectionLevel: protectionConfig?.level ?? null,
    mode,
    roster,
  };

  if (isFtue) {
    handData.ftueDrawCards = FTUE_DRAW_CARDS;
  }

  try {
    await storePendingHand(userId, handId, handData);
  } catch (kvErr) {
    console.error('[deal] KV store failed:', kvErr);
    return sendError(res, 500, 'KV_UNAVAILABLE', 'Could not store pending hand');
  }

  // 14. Log
  console.log(`[deal] userId=${userId} handId=${handId} mode=${mode} bet=${betAmount}`);

  // 15. Response
  const cards = roster.map((entry, i) => ({
    slot: i,
    playerId: entry.playerId,
    name: entry.name,
    team: entry.team,
    position: entry.position,
    salary: entry.salary,
    tier: entry.tier,
  }));

  return res.status(200).json({
    handId,
    cards,
    balance,
    betAmount,
  });
}
