// Fixed on the free-play branch: never fall back to the mother's keyspace.
// This is logical isolation; storage and command allowances are shared.
export const FREE_PLAY_REDIS_PREFIX = 'replay-free-play:v1:';
export function redisKey(key: string): string {
  return FREE_PLAY_REDIS_PREFIX + key;
}
