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
 */
export function isRealName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = String(name).trim();
  if (trimmed.length < 2) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/^(player|guest|user)[_\s-]?\d*$/i.test(trimmed)) return false;
  if (/^(player|guest|user)_/i.test(trimmed)) return false;
  if (/[0-9a-f]{6,}/i.test(trimmed)) return false;
  return true;
}
