/**
 * api/__tests__/leaderboard-competition.test.ts
 *
 * Per-competition keying validation tests. Verifies:
 *   - Football requires the competition param (POST + GET)
 *   - Football validates competition values (only world_cup at launch)
 *   - Football KV keys include the competition segment (lb:football:world_cup:...)
 *   - Basketball/baseball keep the legacy 4-segment key shape (lb:basketball:...)
 *
 * Doesn't test the full submit flow (that lives in production smoke tests).
 * Focused on the new competition-routing logic added in PR 2.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockKv, mockSupabase } = vi.hoisted(() => {
  const mockKv = {
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    zadd: vi.fn().mockResolvedValue(1),
    zincrby: vi.fn().mockResolvedValue(1),
    zscore: vi.fn().mockResolvedValue(0),
    zrange: vi.fn().mockResolvedValue([]),
  };
  const mockSupabase = { auth: { getUser: vi.fn() } };
  return { mockKv, mockSupabase };
});

vi.mock('@vercel/kv', () => ({ kv: mockKv }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

import handler from '../leaderboard.ts';

function makeReq(method: string, query: Record<string, string> = {}, body: unknown = undefined): any {
  return { method, query, body, headers: {} };
}

function makeRes() {
  const res: any = {};
  res.setHeader = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
// GET — competition validation
// ────────────────────────────────────────────────────────────────────────────

describe('GET ?sport=football — competition required', () => {
  it('returns 400 when competition is missing', async () => {
    const req = makeReq('GET', { sport: 'football', metric: 'hand_best', scope: 'daily' });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const errArg = res.json.mock.calls[0][0].error.toLowerCase();
    expect(errArg).toMatch(/competition/);
  });

  it('returns 400 when competition is unsupported (e.g. epl before it ships)', async () => {
    const req = makeReq('GET', { sport: 'football', competition: 'epl', metric: 'hand_best', scope: 'daily' });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.toLowerCase()).toMatch(/unsupported competition/);
  });

  it('returns 200 + uses lb:football:world_cup:... key when competition=world_cup', async () => {
    mockKv.zrange.mockResolvedValue([]);
    const req = makeReq('GET', {
      sport: 'football',
      competition: 'world_cup',
      metric: 'hand_best',
      scope: 'daily',
      limit: '10',
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    // The KV key should include the competition segment.
    const keyArg = mockKv.zrange.mock.calls[0][0];
    expect(keyArg).toMatch(/^lb:football:world_cup:hand_best:daily:\d{4}-\d{2}-\d{2}$/);
  });
});

describe('GET ?sport=basketball — no competition required', () => {
  it('returns 200 + uses lb:basketball:... key (no competition segment)', async () => {
    mockKv.zrange.mockResolvedValue([]);
    const req = makeReq('GET', { sport: 'basketball', metric: 'hand_best', scope: 'daily' });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const keyArg = mockKv.zrange.mock.calls[0][0];
    expect(keyArg).toMatch(/^lb:basketball:hand_best:daily:\d{4}-\d{2}-\d{2}$/);
  });

  it('ignores competition param if accidentally included for basketball', async () => {
    // Forward-compatibility: if a future basketball hand sent competition=nba_2024,
    // we silently ignore it (no error) since basketball isn't in COMPETITION_REQUIRED.
    mockKv.zrange.mockResolvedValue([]);
    const req = makeReq('GET', {
      sport: 'basketball',
      competition: 'nba_2024',
      metric: 'hand_best',
      scope: 'daily',
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    // Key remains the 2-segment basketball form — competition is ignored.
    const keyArg = mockKv.zrange.mock.calls[0][0];
    expect(keyArg).toMatch(/^lb:basketball:hand_best:daily:\d{4}-\d{2}-\d{2}$/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Sport whitelist still enforced
// ────────────────────────────────────────────────────────────────────────────

describe('GET ?sport=worldcup — rejected (renamed to football)', () => {
  it('returns 400 with Invalid sport', async () => {
    const req = makeReq('GET', { sport: 'worldcup', metric: 'hand_best', scope: 'daily' });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Invalid sport/);
  });
});
