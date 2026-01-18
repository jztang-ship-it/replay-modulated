export type SeedMode = "FIXED" | "TIME" | "SESSION";

export function hashStringToSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h ^= c;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

export function computeSeed(mode: SeedMode, fixedSeed: number = 12345, sessionId: string = "session"): number {
  if (mode === "FIXED") {
    return fixedSeed >>> 0;
  }
  if (mode === "SESSION") {
    return hashStringToSeed(sessionId);
  }
  // TIME
  return (Date.now() >>> 0);
}
