import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted, so we use vi.hoisted to define mocks that the factory can reference
const { mockKv } = vi.hoisted(() => {
  const mockKv = {
    get: vi.fn(),
    set: vi.fn(),
  };
  return { mockKv };
});

vi.mock('@vercel/kv', () => ({ kv: mockKv }));

import handler from '../bonus-pool.ts';

// ---------------------------------------------------------------------------
// Helpers to build minimal VercelRequest / VercelResponse mocks
// ---------------------------------------------------------------------------
function makeReq(
  method: string,
  query: Record<string, string> = {},
  body: unknown = undefined,
): any {
  return { method, query, body };
}

function makeRes() {
  const res: any = {};
  res.setHeader = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET ?sport=basketball  → 200, returns pool
// ---------------------------------------------------------------------------
describe('GET ?sport=basketball', () => {
  it('returns 200 with pool value from KV', async () => {
    mockKv.get.mockResolvedValue(1500);

    const req = makeReq('GET', { sport: 'basketball' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ pool: 1500 });
    expect(mockKv.get).toHaveBeenCalledWith('bonus_pool:basketball');
  });

  it('returns 200 with SEED when KV returns null', async () => {
    mockKv.get.mockResolvedValue(null);

    const req = makeReq('GET', { sport: 'basketball' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ pool: 1000 });
  });
});

// ---------------------------------------------------------------------------
// GET ?sport=football (missing competition) → 400
// ---------------------------------------------------------------------------
describe('GET ?sport=football (no competition)', () => {
  it('returns 400 with error mentioning competition required', async () => {
    const req = makeReq('GET', { sport: 'football' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBeTruthy();
    expect(body.error.toLowerCase()).toMatch(/competition required/);
    expect(mockKv.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET ?sport=football&competition=world_cup → 200, uses scoped KV key
// ---------------------------------------------------------------------------
describe('GET ?sport=football&competition=world_cup', () => {
  it('returns 200 with pool from bonus_pool:football:world_cup', async () => {
    mockKv.get.mockResolvedValue(2500);

    const req = makeReq('GET', { sport: 'football', competition: 'world_cup' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ pool: 2500 });
    expect(mockKv.get).toHaveBeenCalledWith('bonus_pool:football:world_cup');
  });
});

// ---------------------------------------------------------------------------
// GET ?sport=football&competition=epl → 400, unsupported competition
// ---------------------------------------------------------------------------
describe('GET ?sport=football&competition=epl', () => {
  it('returns 400 with unsupported competition error', async () => {
    const req = makeReq('GET', { sport: 'football', competition: 'epl' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBeTruthy();
    expect(body.error.toLowerCase()).toMatch(/unsupported competition/);
    expect(mockKv.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET ?sport=worldcup → 400, no longer supported
// ---------------------------------------------------------------------------
describe('GET ?sport=worldcup', () => {
  it('returns 400 with unsupported sport error', async () => {
    const req = makeReq('GET', { sport: 'worldcup' });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBeTruthy();
    expect(body.error.toLowerCase()).toMatch(/unsupported sport/);
    expect(mockKv.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST contribute — basketball (no competition)
// ---------------------------------------------------------------------------
describe('POST contribute basketball', () => {
  it('adds amount to pool and returns updated value', async () => {
    mockKv.get
      .mockResolvedValueOnce(1000)  // readPool before write
      .mockResolvedValueOnce(1050); // readPool after write
    mockKv.set.mockResolvedValue('OK');

    const req = makeReq('POST', {}, { sport: 'basketball', action: 'contribute', amount: 50 });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockKv.set).toHaveBeenCalledWith('bonus_pool:basketball', 1050);
    expect(res.json).toHaveBeenCalledWith({ pool: 1050 });
  });
});

// ---------------------------------------------------------------------------
// POST contribute — football with competition
// ---------------------------------------------------------------------------
describe('POST contribute football world_cup', () => {
  it('uses scoped key bonus_pool:football:world_cup', async () => {
    mockKv.get
      .mockResolvedValueOnce(2000)  // readPool before write
      .mockResolvedValueOnce(2100); // readPool after write
    mockKv.set.mockResolvedValue('OK');

    const req = makeReq('POST', {}, {
      sport: 'football',
      competition: 'world_cup',
      action: 'contribute',
      amount: 100,
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockKv.set).toHaveBeenCalledWith('bonus_pool:football:world_cup', 2100);
    expect(res.json).toHaveBeenCalledWith({ pool: 2100 });
  });
});
