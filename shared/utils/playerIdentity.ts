/**
 * shared/utils/playerIdentity.ts — Auto-generated nicknames for leaderboard.
 * Uses rm_uid from analytics as the canonical player identity.
 */

const ADJECTIVES = ["Cobra","Stealth","Phantom","Iron","Thunder","Neon","Shadow","Golden","Rapid","Clutch"];
const NOUNS = ["Hoops","Draft","Moves","Court","Bench","Swish","Paint","Press","Post","Drive"];

export function getOrCreateNickname(): string {
  const key = "replaymod_nickname";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const name = `${adj}${noun}_${num}`;
  localStorage.setItem(key, name);
  return name;
}

export function setNickname(name: string): void {
  const trimmed = name.trim().slice(0, 20);
  if (trimmed.length < 2) return;
  localStorage.setItem("replaymod_nickname", trimmed);
}

export function getNickname(): string {
  return localStorage.getItem("replaymod_nickname") ?? getOrCreateNickname();
}

export function getPlayerUid(): string {
  return localStorage.getItem("rm_uid") ?? "";
}
