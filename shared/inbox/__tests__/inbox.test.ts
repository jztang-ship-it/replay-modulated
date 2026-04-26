// shared/inbox/__tests__/inbox.test.ts
// Logic tests for inbox.ts. Other functions are thin Supabase wrappers and are
// verified by manual smoke testing — only the count→number+1 logic warrants a test.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist-friendly mock — must come before importing the module under test.
const fromMock = vi.fn();
vi.mock('@shared/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: vi.fn(),
  },
}));

import { getSubmissionNumber } from '../inbox';

beforeEach(() => {
  fromMock.mockReset();
});

describe('getSubmissionNumber', () => {
  it('returns 1 when the user has zero prior submissions', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ count: 0, error: null }),
      }),
    });
    const n = await getSubmissionNumber('user-a');
    expect(n).toBe(1);
  });

  it('returns N+1 when the user has N prior submissions', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ count: 3, error: null }),
      }),
    });
    const n = await getSubmissionNumber('user-a');
    expect(n).toBe(4);
  });

  it('returns 1 on Supabase error (safe fallback)', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ count: null, error: new Error('boom') }),
      }),
    });
    const n = await getSubmissionNumber('user-a');
    expect(n).toBe(1);
  });
});
