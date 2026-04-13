// shared/utils/playerIdentity.ts

/** Auth UID set by AuthProvider when Supabase resolves */
let _authUid: string | null = null;

/** Called by AuthProvider when Supabase user resolves. Do not call from elsewhere. */
export function setAuthUid(uid: string | null): void {
  _authUid = uid;
}

/** UID priority: Supabase user.id → localStorage rm_uid → generate new */
export function getPlayerUid(): string {
  if (_authUid) return _authUid;
  const key = "rm_uid";
  let uid = localStorage.getItem(key);
  if (!uid) {
    uid = "u_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    localStorage.setItem(key, uid);
  }
  return uid;
}

export function getNickname(): string {
  return localStorage.getItem("replaymod_nickname") ?? getOrCreateNickname();
}

export function setNickname(name: string): void {
  localStorage.setItem("replaymod_nickname", name);
}

export function getSessionId(): string {
  let id = localStorage.getItem("rm_session_id");
  if (!id) {
    id = Math.random().toString(36).slice(2, 12);
    localStorage.setItem("rm_session_id", id);
  }
  return id;
}

// ── Random nickname generator ──────────────────────────────────────────────
const ADJECTIVES = [
  "Shadow","Phantom","Iron","Golden","Silent","Swift","Cosmic","Neon",
  "Thunder","Crimson","Blazing","Stealth","Frost","Rogue","Electric",
  "Turbo","Viper","Storm","Cyber","Titan","Lunar","Onyx","Delta",
];
const NOUNS = [
  "Hoops","Dunk","Clutch","Swish","Rebound","Fadeaway","Crossover",
  "Alley","Buzzer","Layup","Jumper","Slam","Court","Triple","Press",
];

function getOrCreateNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const nick = `${adj}${noun}_${num}`;
  localStorage.setItem("replaymod_nickname", nick);
  return nick;
}
