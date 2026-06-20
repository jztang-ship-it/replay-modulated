/**
 * api/__tests__/migration-014-boss-sender.test.ts
 *
 * Phase 2 (boss delivery consumer), Commit 1. Static assertion over the
 * 014_boss_sender.sql migration text.
 *
 * Why a SQL-text test and not a live RLS test: the entire api test suite
 * mocks supabaseAdmin at the module boundary (see challenge-attempt.test.ts)
 * — there is no live Postgres in CI, so the brief's "anon insert rejected /
 * service-role insert succeeds" behavior can't execute here. This test pins
 * the migration's *shape* instead: the additive boss columns, the partial
 * unique index on instance_key, and — per the build instruction — the
 * nullable-created_by relaxation and the re-tightened insert policy asserted
 * AS A UNIT (the DROP NOT NULL is only safe BECAUSE the policy is tightened
 * in the same migration; testing them separately would let one regress
 * without the other and miss the actual RLS hole).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SQL = readFileSync(
  resolve(__dirname, "../../supabase/migrations/014_boss_sender.sql"),
  "utf8",
);

// Whitespace-insensitive contains: collapse runs of whitespace so multi-line
// SQL statements match a single-line needle.
function sqlContains(haystack: string, needle: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
  return norm(haystack).includes(norm(needle));
}

describe("migration 014_boss_sender — additive boss columns", () => {
  it("adds sender_kind as NOT NULL DEFAULT 'player' (legacy rows read as player)", () => {
    expect(sqlContains(SQL, "ADD COLUMN IF NOT EXISTS sender_kind text NOT NULL DEFAULT 'player'")).toBe(true);
  });

  it("adds the instance_key natural key and the boss provenance columns", () => {
    expect(sqlContains(SQL, "ADD COLUMN IF NOT EXISTS instance_key text")).toBe(true);
    expect(sqlContains(SQL, "ADD COLUMN IF NOT EXISTS boss_identity_id text")).toBe(true);
    expect(sqlContains(SQL, "ADD COLUMN IF NOT EXISTS boss_bank_version text")).toBe(true);
    expect(sqlContains(SQL, "ADD COLUMN IF NOT EXISTS tough_day boolean")).toBe(true);
  });

  it("creates the partial unique index on instance_key (humans stay NULL, exempt)", () => {
    expect(sqlContains(SQL, "CREATE UNIQUE INDEX IF NOT EXISTS uq_shared_challenges_instance_key")).toBe(true);
    expect(sqlContains(SQL, "ON public.shared_challenges (instance_key) WHERE instance_key IS NOT NULL")).toBe(true);
  });
});

describe("migration 014_boss_sender — nullable + tightened-check as a UNIT", () => {
  // These two are deliberately one test: the DROP NOT NULL is only safe
  // because the insert policy is re-tightened in the same migration. If
  // either half is missing the unit fails, which is exactly the RLS hole
  // the brief calls out.
  it("relaxes created_by to nullable AND re-tightens the human insert policy together", () => {
    const dropsNotNull = sqlContains(
      SQL,
      "ALTER TABLE public.shared_challenges ALTER COLUMN created_by DROP NOT NULL",
    );
    const tightensPolicy = sqlContains(
      SQL,
      "WITH CHECK (created_by = auth.uid() AND auth.uid() IS NOT NULL)",
    );
    // Asserted as a combination — both must be present in the same migration.
    expect({ dropsNotNull, tightensPolicy }).toEqual({
      dropsNotNull: true,
      tightensPolicy: true,
    });
  });

  it("replaces (not merely adds) the prior insert policy so the loose check can't linger", () => {
    expect(sqlContains(SQL, 'DROP POLICY IF EXISTS "challenges: authenticated insert"')).toBe(true);
    expect(sqlContains(SQL, 'CREATE POLICY "challenges: authenticated insert"')).toBe(true);
  });
});
