// shared/utils/deriveDisplayName.ts
//
// Phase 5b piece 1 — auth surface unification (2026-05-29, doc lock 2caa7a3).
// Resolves a usable display name from a freshly-authenticated Supabase user,
// regardless of provider. Used by the unified RegisterModal (challenge
// context) to populate the name field post-auth without forcing the user to
// type their name again.
//
// Fallback chain:
//   1. user_metadata.full_name  — Google profile name (provider-populated)
//   2. user_metadata.name       — alternative Google / OIDC metadata field
//   3. email local-part         — email-auth users with no provider metadata
//   4. getNickname() placeholder — the auto-mint nickname (random adj+noun)
//
// Returning the localStorage placeholder is the absolute last resort —
// callers should treat this as "the user did not contribute a real name"
// and prompt for an edit. NameCaptureModal's `isRealName` guard catches
// these and surfaces them as "anonymous" upstream.

import type { User } from "@supabase/supabase-js";
import { getNickname } from "@shared/utils/playerIdentity";

export function deriveDisplayName(user: User | null): string {
  if (!user) return "";
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (fullName) return fullName;
  const name = typeof meta.name === "string" ? meta.name.trim() : "";
  if (name) return name;
  if (user.email) {
    const localPart = user.email.split("@")[0]?.trim();
    if (localPart) return localPart;
  }
  return getNickname();
}
