/**
 * dealer.js — Server-side roster dealer for fantasy basketball.
 *
 * 6-player rosters, $250 salary cap, position-agnostic slot filling,
 * tier-biased game-log sampling.
 */

import { supabaseAdmin } from './supabaseServer.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SALARY_CAP = 250;
const ROSTER_SIZE = 6;
const MIN_SPEND = 244; // cap - 6
const MAX_ATTEMPTS = 100;

const TIER_THRESHOLDS = [
  { tier: 'RED',    min: 73 },
  { tier: 'ORANGE', min: 58 },
  { tier: 'PURPLE', min: 44 },
  { tier: 'BLUE',   min: 30 },
  { tier: 'GREEN',  min: 23 },
  { tier: 'WHITE',  min: 0  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function tierFromCost(cost) {
  for (const t of TIER_THRESHOLDS) {
    if (cost >= t.min) return t.tier;
  }
  return 'WHITE';
}

function totalCost(roster) {
  return roster.reduce((sum, p) => sum + p.cost, 0);
}

/**
 * Weighted random pick from `pool`, weight = cost^2.
 * Excludes any player whose id is in `excludeIds`.
 * Returns the picked player or null.
 */
function pickWeighted(pool, excludeIds, rnd) {
  const available = pool.filter(p => !excludeIds.has(p.id));
  if (!available.length) return null;
  const weights = available.map(p => p.cost * p.cost);
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rnd() * total;
  for (let i = 0; i < available.length; i++) {
    r -= weights[i];
    if (r <= 0) return available[i];
  }
  return available[available.length - 1];
}

function cheapestAvailable(pool, excludeIds, maxCost) {
  return pool
    .filter(p => !excludeIds.has(p.id) && p.cost <= maxCost)
    .sort((a, b) => a.cost - b.cost)[0] ?? null;
}

function isPremium(tier) {
  return tier === 'RED' || tier === 'ORANGE';
}

// ---------------------------------------------------------------------------
// 1. fetchPlayablePool
// ---------------------------------------------------------------------------

export async function fetchPlayablePool() {
  const { data, error } = await supabaseAdmin
    .from('players')
    .select('id, name, team, pos, cost')
    .eq('active', true);

  if (error) throw new Error(`fetchPlayablePool: ${error.message}`);

  return (data || []).map(p => ({
    id: p.id,
    name: p.name,
    team: p.team,
    position: p.pos || '',
    cost: Number(p.cost),
    tier: tierFromCost(Number(p.cost)),
  }));
}

// ---------------------------------------------------------------------------
// 2. generateRoster
// ---------------------------------------------------------------------------

export function generateRoster(pool, rnd) {
  if (pool.length < ROSTER_SIZE) return null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const roster = tryBuildRoster(pool, rnd);
    if (roster) return roster;
  }
  return null;
}

function tryBuildRoster(pool, rnd) {
  const usedIds = new Set();
  const roster = [];

  // --- Pick anchor: ORANGE+ player ($58+), weighted by salary^2 ---
  const anchorPool = pool.filter(p => p.cost >= 58);
  let anchor = null;
  if (anchorPool.length) {
    anchor = pickWeighted(anchorPool, usedIds, rnd);
  }
  if (!anchor) return null; // will retry

  usedIds.add(anchor.id);
  roster.push(anchor);

  // --- Fill remaining 5 slots ---
  const minCost = Math.min(...pool.map(p => p.cost));
  let budgetRemaining = SALARY_CAP - anchor.cost;

  for (let i = 1; i < ROSTER_SIZE; i++) {
    const slotsLeft = ROSTER_SIZE - roster.length;
    const maxForSlot = budgetRemaining - (slotsLeft - 1) * minCost;
    const candidates = pool.filter(
      p => !usedIds.has(p.id) && p.cost <= maxForSlot
    );
    const picked = candidates.length
      ? pickWeighted(candidates, usedIds, rnd)
      : cheapestAvailable(pool, usedIds, maxForSlot);
    if (!picked) return null; // can't fill — retry
    usedIds.add(picked.id);
    roster.push(picked);
    budgetRemaining -= picked.cost;
  }

  if (roster.length < ROSTER_SIZE) return null;

  // --- Cap enforcement ---
  enforceCapInPlace(roster, pool, usedIds, rnd);

  if (totalCost(roster) > SALARY_CAP) return null;

  // --- Anchor guarantee ---
  guaranteeAnchor(roster, pool, usedIds, rnd);

  // --- Min spend upgrade ---
  upgradeMinSpend(roster, pool, usedIds, rnd);

  // Final cap check after upgrades
  if (totalCost(roster) > SALARY_CAP) {
    enforceCapInPlace(roster, pool, usedIds, rnd);
  }

  if (totalCost(roster) > SALARY_CAP) return null;

  return roster.map(p => ({
    id: p.id,
    name: p.name,
    team: p.team,
    position: p.position,
    cost: p.cost,
    tier: p.tier,
  }));
}

function enforceCapInPlace(roster, pool, usedIds, rnd) {
  let guard = 0;
  while (totalCost(roster) > SALARY_CAP && guard++ < 200) {
    // Find most expensive non-anchor card to swap
    const swappable = roster
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !isPremium(c.tier))
      .sort((a, b) => b.c.cost - a.c.cost);

    const targets = swappable.length
      ? swappable
      : roster.map((c, i) => ({ c, i })).sort((a, b) => b.c.cost - a.c.cost);

    const { c: cur, i: idx } = targets[0];
    const currentTotal = totalCost(roster);
    const maxForSlot = SALARY_CAP - (currentTotal - cur.cost);

    const replacement = cheapestAvailable(pool, usedIds, maxForSlot);
    if (!replacement || replacement.cost >= cur.cost) break;

    usedIds.delete(cur.id);
    usedIds.add(replacement.id);
    roster[idx] = replacement;
  }
}

function guaranteeAnchor(roster, pool, usedIds, rnd) {
  const hasPremium = roster.some(c => isPremium(c.tier));
  if (hasPremium) return;

  // Try to upgrade a non-premium card to ORANGE+
  const headroom = () => SALARY_CAP - totalCost(roster);

  const swappable = roster
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !isPremium(c.tier))
    .sort((a, b) => b.c.cost - a.c.cost);

  for (const { c, i } of swappable) {
    const budget = c.cost + headroom();
    const upgrades = pool.filter(
      p => (!usedIds.has(p.id) || p.id === c.id) &&
           p.cost >= 58 && p.cost <= budget
    );
    if (!upgrades.length) continue;
    const excl = new Set([...usedIds].filter(id => id !== c.id));
    const picked = pickWeighted(upgrades, excl, rnd) ?? upgrades[0];
    usedIds.delete(c.id);
    usedIds.add(picked.id);
    roster[i] = picked;
    return;
  }

  // Fallback: ensure at least 2 PURPLE
  let purpleCount = roster.filter(c => c.tier === 'PURPLE' || isPremium(c.tier)).length;
  for (const { c, i } of swappable) {
    if (purpleCount >= 2) break;
    if (c.tier === 'PURPLE') continue;
    const budget = c.cost + headroom();
    const upgrades = pool.filter(
      p => (!usedIds.has(p.id) || p.id === c.id) &&
           p.cost >= 44 && p.cost < 58 && p.cost <= budget
    );
    if (!upgrades.length) continue;
    const excl = new Set([...usedIds].filter(id => id !== c.id));
    const picked = pickWeighted(upgrades, excl, rnd) ?? upgrades[0];
    usedIds.delete(c.id);
    usedIds.add(picked.id);
    roster[i] = picked;
    purpleCount++;
  }
}

function upgradeMinSpend(roster, pool, usedIds, rnd) {
  let spend = totalCost(roster);
  if (spend >= MIN_SPEND) return;

  const sorted = roster
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.cost - b.c.cost);

  for (const { c, i } of sorted) {
    if (spend >= MIN_SPEND) break;
    const gap = Math.min(MIN_SPEND - spend, SALARY_CAP - spend);
    if (gap <= 0) break;
    const upgrades = pool
      .filter(p =>
        (!usedIds.has(p.id) || p.id === c.id) &&
        p.cost > c.cost &&
        p.cost <= c.cost + gap
      )
      .sort((a, b) => b.cost - a.cost);
    if (!upgrades.length) continue;
    const excl = new Set([...usedIds].filter(id => id !== c.id));
    const picked = pickWeighted(upgrades, excl, rnd) ?? upgrades[0];
    usedIds.delete(c.id);
    usedIds.add(picked.id);
    spend += picked.cost - c.cost;
    roster[i] = picked;
  }
}

// ---------------------------------------------------------------------------
// 3. redrawRoster
// ---------------------------------------------------------------------------

export function redrawRoster(currentRoster, heldIndices, pool, rnd) {
  const heldSet = new Set(heldIndices);
  const result = [...currentRoster];
  const usedIds = new Set();

  // Lock held cards
  for (let i = 0; i < ROSTER_SIZE; i++) {
    if (heldSet.has(i)) {
      usedIds.add(result[i].id);
    }
  }

  const heldSalary = currentRoster.reduce(
    (sum, c, i) => heldSet.has(i) ? sum + c.cost : sum, 0
  );
  let budgetRemaining = SALARY_CAP - heldSalary;
  const minCost = Math.min(...pool.map(p => p.cost));

  let openSlots = ROSTER_SIZE - heldSet.size;

  for (let i = 0; i < ROSTER_SIZE; i++) {
    if (heldSet.has(i)) continue;
    const maxForSlot = budgetRemaining - (openSlots - 1) * minCost;
    const candidates = pool.filter(
      p => !usedIds.has(p.id) && p.cost <= maxForSlot
    );
    const picked = candidates.length
      ? pickWeighted(candidates, usedIds, rnd)
      : cheapestAvailable(pool, usedIds, maxForSlot);
    if (!picked) {
      // Fallback: cheapest unused player
      const fallback = pool
        .filter(p => !usedIds.has(p.id))
        .sort((a, b) => a.cost - b.cost)[0];
      if (fallback) {
        usedIds.add(fallback.id);
        budgetRemaining -= fallback.cost;
        openSlots--;
        result[i] = { ...fallback };
        continue;
      }
      break;
    }
    usedIds.add(picked.id);
    budgetRemaining -= picked.cost;
    openSlots--;
    result[i] = { ...picked };
  }

  // Cap enforcement on non-held slots only
  let guard = 0;
  while (totalCost(result) > SALARY_CAP && guard++ < 200) {
    const swappable = result
      .map((c, i) => ({ c, i }))
      .filter(({ i }) => !heldSet.has(i))
      .sort((a, b) => b.c.cost - a.c.cost);
    if (!swappable.length) break;
    const { c: cur, i: idx } = swappable[0];
    const currentTotal = totalCost(result);
    const maxForSlot = SALARY_CAP - (currentTotal - cur.cost);
    const replacement = cheapestAvailable(pool, usedIds, maxForSlot);
    if (!replacement || replacement.cost >= cur.cost) break;
    usedIds.delete(cur.id);
    usedIds.add(replacement.id);
    result[idx] = replacement;
  }

  return result.map(p => ({
    id: p.id,
    name: p.name,
    team: p.team,
    position: p.position,
    cost: p.cost,
    tier: p.tier,
  }));
}

// ---------------------------------------------------------------------------
// 4. pickBiasedLog
// ---------------------------------------------------------------------------

const STAT_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk', 'fg3m'];

export async function pickBiasedLog(playerId, tier, rnd) {
  const { data, error } = await supabaseAdmin
    .from('game_logs')
    .select('*')
    .eq('player_id', playerId);

  if (error) throw new Error(`pickBiasedLog: ${error.message}`);
  if (!data || !data.length) return null;

  // Filter out junk logs
  const valid = data.filter(log => {
    if (Number(log.min || 0) < 10) return false;
    const statSum = STAT_KEYS.reduce((s, k) => s + Number(log[k] || 0), 0);
    return statSum > 0;
  });

  if (!valid.length) return null;

  // Sort best-first by total stat sum
  valid.sort((a, b) => {
    const sumA = STAT_KEYS.reduce((s, k) => s + Number(a[k] || 0), 0);
    const sumB = STAT_KEYS.reduce((s, k) => s + Number(b[k] || 0), 0);
    return sumB - sumA;
  });

  // Tier-biased window (start%, end%) of sorted array
  let start, end;
  const t = (tier || '').toUpperCase();
  if (t === 'RED' || t === 'ORANGE') {
    start = 0; end = 0.4;
  } else if (t === 'PURPLE') {
    start = 0; end = 0.55;
  } else if (t === 'BLUE') {
    start = 0.2; end = 0.7;
  } else if (t === 'GREEN') {
    start = 0.3; end = 0.8;
  } else {
    // WHITE
    start = 0.4; end = 1.0;
  }

  const lo = Math.floor(start * valid.length);
  const hi = Math.max(lo + 1, Math.ceil(end * valid.length));
  const window = valid.slice(lo, hi);

  return window[Math.floor(rnd() * window.length)];
}

// ---------------------------------------------------------------------------
// 5. fetchGameLogById
// ---------------------------------------------------------------------------

export async function fetchGameLogById(logId) {
  const { data, error } = await supabaseAdmin
    .from('game_logs')
    .select('*')
    .eq('id', logId)
    .single();

  if (error) return null;
  return data;
}
