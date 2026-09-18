import { beforeEach, expect, it, vi } from 'vitest';
const { kv, data } = vi.hoisted(() => {
  const data = new Map<string, number>();
  return { data, kv: {
    eval: vi.fn(async (_script: string, keys: string[]) => {
      const next = (data.get(keys[0]) ?? 0) + 1;
      data.set(keys[0], next); return next;
    }),
    incrby: vi.fn(async (key: string, value: number) => data.set(key, (data.get(key) ?? 0) + value)),
    expire: vi.fn().mockResolvedValue(1),
    zadd: vi.fn().mockResolvedValue(1),
  }};
});
vi.mock('@vercel/kv', () => ({ kv }));
import { quota } from '../hand/_lib/security.js';
import analytics from '../analytics.js';
import { recordModelScore, recordRecentPhrase, getPrimaryModel } from '../_lib/router/kvStore.js';
beforeEach(() => { vi.clearAllMocks(); data.clear(); });
it('starts an independent quota without resetting or consuming the mother quota', async () => {
  data.set('security:v2:same-user', 99);
  expect(await quota('same-user', 1, 60)).toBe(true);
  expect(await quota('same-user', 1, 60)).toBe(false);
  expect(data.get('security:v2:same-user')).toBe(99);
  expect(kv.eval.mock.calls[0][1]).toEqual(['replay-free-play:v1:security:v2:same-user']);
});
it('still fails closed when Redis is unavailable', async () => {
  kv.eval.mockRejectedValueOnce(new Error('unavailable'));
  await expect(quota('same-user', 1, 60)).rejects.toThrow('unavailable');
});
it('analytics counters, user sets and expiry only target the free-play namespace', async () => {
  const day = new Date().toISOString().slice(0, 10);
  data.set(`gameplay:hands_dealt:${day}`, 42);
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await analytics({ method: 'POST', body: { feature: 'gameplay', action: 'hand_dealt', userId: 'test', props: { user_status: 'new' } } } as any, res);
  expect(res.status).toHaveBeenCalledWith(200);
  for (const fn of [kv.incrby, kv.expire, kv.zadd]) {
    expect(fn).toHaveBeenCalled();
    for (const [key] of fn.mock.calls) expect(key).toMatch(/^replay-free-play:v1:/);
  }
  expect(data.get(`gameplay:hands_dealt:${day}`)).toBe(42);
});
it('router reads and pipeline writes are isolated even with the mother router namespace', async () => {
  const pipe: any = {};
  for (const method of ['hincrby', 'hincrbyfloat', 'lpush', 'ltrim']) pipe[method] = vi.fn().mockReturnValue(pipe);
  pipe.exec = vi.fn().mockResolvedValue([]);
  const client: any = { pipeline: () => pipe, get: vi.fn().mockResolvedValue(null) };
  await getPrimaryModel(client, 'replaymod', 'claude-haiku-4-5', 'MVP');
  await recordModelScore(client, 'replaymod', 'claude-haiku-4-5', { composite: 1 } as any, 'MVP');
  await recordRecentPhrase(client, 'replaymod', 'phrase');
  for (const fn of [client.get, pipe.hincrby, pipe.hincrbyfloat, pipe.lpush, pipe.ltrim]) {
    expect(fn).toHaveBeenCalled();
    for (const [key] of fn.mock.calls) expect(key).toMatch(/^replay-free-play:v1:replaymod:/);
  }
});
