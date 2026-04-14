import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted, so we use vi.hoisted to define mocks that the factory can reference
const { mockKv, mockPipeline } = vi.hoisted(() => {
  const mockPipeline = {
    get: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    exec: vi.fn(),
  };

  const mockKv = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    scan: vi.fn(),
    pipeline: vi.fn(() => mockPipeline),
  };

  return { mockKv, mockPipeline };
});

vi.mock('@vercel/kv', () => ({ kv: mockKv }));

import {
  consumeHand,
  storePendingHand,
  findPendingHand,
  cacheResult,
  getCachedResult,
} from '../_lib-hand/kv.ts';

beforeEach(() => {
  vi.clearAllMocks();
  mockKv.pipeline.mockReturnValue(mockPipeline);
  mockPipeline.get.mockReturnThis();
  mockPipeline.del.mockReturnThis();
});

// ---------------------------------------------------------------------------
// consumeHand
// ---------------------------------------------------------------------------
describe('consumeHand', () => {
  it('returns hand data and deletes key atomically via pipeline', async () => {
    const handData = { cards: ['A', 'K', 'Q'], userId: 'u1' };
    mockPipeline.exec.mockResolvedValue([handData, 1]);

    const result = await consumeHand('u1', 'h1');

    expect(mockKv.pipeline).toHaveBeenCalledOnce();
    expect(mockPipeline.get).toHaveBeenCalledWith('hand:u1:h1');
    expect(mockPipeline.del).toHaveBeenCalledWith('hand:u1:h1');
    expect(mockPipeline.exec).toHaveBeenCalledOnce();
    expect(result).toEqual(handData);
  });

  it('returns null if hand not found', async () => {
    mockPipeline.exec.mockResolvedValue([null, 0]);

    const result = await consumeHand('u1', 'missing');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// storePendingHand
// ---------------------------------------------------------------------------
describe('storePendingHand', () => {
  it('calls kv.set with correct key and TTL 300', async () => {
    const handData = { cards: ['A', 'K', 'Q'] };
    mockKv.set.mockResolvedValue('OK');

    await storePendingHand('u2', 'h2', handData);

    expect(mockKv.set).toHaveBeenCalledWith('hand:u2:h2', handData, { ex: 300 });
  });
});

// ---------------------------------------------------------------------------
// findPendingHand
// ---------------------------------------------------------------------------
describe('findPendingHand', () => {
  it('returns hand data when a matching key exists', async () => {
    const handData = { cards: ['J', '10', '9'] };
    mockKv.scan.mockResolvedValue([0, ['hand:u3:h3']]);
    mockKv.get.mockResolvedValue(handData);

    const result = await findPendingHand('u3');

    expect(mockKv.scan).toHaveBeenCalledWith(0, { match: 'hand:u3:*', count: 1 });
    expect(mockKv.get).toHaveBeenCalledWith('hand:u3:h3');
    expect(result).toEqual(handData);
  });

  it('returns null when no keys found', async () => {
    mockKv.scan.mockResolvedValue([0, []]);

    const result = await findPendingHand('u3');

    expect(result).toBeNull();
    expect(mockKv.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// cacheResult
// ---------------------------------------------------------------------------
describe('cacheResult', () => {
  it('calls kv.set with result key and TTL 90', async () => {
    const resultData = { tier: 'STARTER', payout: 150 };
    mockKv.set.mockResolvedValue('OK');

    await cacheResult('h4', resultData);

    expect(mockKv.set).toHaveBeenCalledWith('result:h4', resultData, { ex: 90 });
  });
});

// ---------------------------------------------------------------------------
// getCachedResult
// ---------------------------------------------------------------------------
describe('getCachedResult', () => {
  it('returns the cached result when present', async () => {
    const resultData = { tier: 'MVP', payout: 800 };
    mockKv.get.mockResolvedValue(resultData);

    const result = await getCachedResult('h5');

    expect(mockKv.get).toHaveBeenCalledWith('result:h5');
    expect(result).toEqual(resultData);
  });

  it('returns null if not cached', async () => {
    mockKv.get.mockResolvedValue(null);

    const result = await getCachedResult('h5');

    expect(result).toBeNull();
  });
});
