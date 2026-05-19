/**
 * isRealName — heuristic for whether a captured display name is a real
 * thing a human typed, or a placeholder/generic string we shouldn't put
 * on share surfaces.
 *
 * Returns false for:
 *   - Player_*, Guest_*, User_* prefixes (case-insensitive)
 *   - any 6+ run of hex chars (rm_uid suffixes, ID leaks)
 *   - pure digits
 *   - length < 2 after trimming
 *   - any name ending with `_<digits>` — catches the auto-generated
 *     nickname pattern (CrimsonSwish_8753, ShadowHoops_1234, …) that the
 *     client mints for anonymous users. Real names virtually never end
 *     in an underscore-digit block, so this is a safe rejection.
 *   - anything where everything after a final underscore is purely
 *     numeric (broader form of the above, e.g. `Mike_Coach_42`).
 */
export function isRealName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = String(name).trim();
  if (trimmed.length < 2) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/^(player|guest|user)[_\s-]?\d*$/i.test(trimmed)) return false;
  if (/^(player|guest|user)_/i.test(trimmed)) return false;
  if (/[0-9a-f]{6,}/i.test(trimmed)) return false;
  if (/_\d+$/.test(trimmed)) return false;
  const lastUnderscore = trimmed.lastIndexOf("_");
  if (lastUnderscore > 0 && /^\d+$/.test(trimmed.slice(lastUnderscore + 1))) return false;
  return true;
}
