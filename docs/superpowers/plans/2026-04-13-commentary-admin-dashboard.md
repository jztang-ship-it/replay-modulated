# Commentary Admin Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move commentary template management to Supabase as an internal workbench — browse, edit, veto, audit, and publish templates without touching code.

**Architecture:** Supabase table + 3 SQL views for monitoring. Three CLI tools: seed (static → Supabase), audit (grade + write stats back), publish (Supabase → static files). Zero runtime changes — composer still reads static `.ts` files.

**Tech Stack:** Supabase (postgres + studio UI), `@supabase/supabase-js` (already installed), `npx tsx` for CLI tools.

**Spec:** `docs/superpowers/specs/2026-04-13-commentary-admin-dashboard-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `basketball/src/tools/supabaseClient.ts` | Create | Shared Supabase client for CLI tools |
| `basketball/src/tools/setupSupabase.ts` | Create | Creates table, indexes, and views in Supabase |
| `basketball/src/tools/seedTemplates.ts` | Create | One-time migration: static .ts files → Supabase rows |
| `basketball/src/tools/commentaryAudit.ts` | Modify | Add `--source=supabase` flag, write stats back to DB |
| `basketball/src/tools/publishTemplates.ts` | Create | Export enabled Supabase templates → static .ts files |

---

### Task 1: Supabase Client

**Files:**
- Create: `basketball/src/tools/supabaseClient.ts`

- [ ] **Step 1: Create Supabase client module**

```typescript
/**
 * supabaseClient.ts — Shared Supabase client for CLI tools only.
 * Uses service role key from .env.local. Never imported by game code.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Load .env.local from project root
config({ path: new URL("../../../.env.local", import.meta.url).pathname });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local");
  process.exit(1);
}

export const supabase = createClient(url, key);
```

- [ ] **Step 2: Install dotenv if not present**

Run: `cd /Users/john/Desktop/ReplayMod && npm ls dotenv 2>/dev/null || npm install --save-dev dotenv`

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsc --noEmit basketball/src/tools/supabaseClient.ts`

- [ ] **Step 4: Commit**

```bash
git add basketball/src/tools/supabaseClient.ts
git commit -m "feat(admin): supabase client for CLI tools

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Database Setup Script

**Files:**
- Create: `basketball/src/tools/setupSupabase.ts`

This script creates the table, indexes, and views in Supabase. Run once per project.

- [ ] **Step 1: Create setup script**

```typescript
/**
 * setupSupabase.ts — Creates commentary_templates table, indexes, and views.
 * Run once: npx tsx basketball/src/tools/setupSupabase.ts
 */

import { supabase } from "./supabaseClient";

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS commentary_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport text NOT NULL,
  register text NOT NULL,
  story text NOT NULL,
  tone text NOT NULL,
  template text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  has_culture_ref boolean NOT NULL DEFAULT false,
  has_extreme_game boolean NOT NULL DEFAULT false,
  has_witty_ref boolean NOT NULL DEFAULT false,
  has_player_name boolean NOT NULL DEFAULT true,
  pass_count integer NOT NULL DEFAULT 0,
  fail_count integer NOT NULL DEFAULT 0,
  fire_count integer NOT NULL DEFAULT 0,
  fail_reasons text[] NOT NULL DEFAULT '{}',
  last_audit timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
`;

const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_templates_sport_enabled
  ON commentary_templates (sport, enabled);
CREATE INDEX IF NOT EXISTS idx_templates_lookup
  ON commentary_templates (sport, register, story, tone, enabled);
`;

const CREATE_STATS_VIEW = `
CREATE OR REPLACE VIEW commentary_stats AS
WITH enabled AS (
  SELECT * FROM commentary_templates WHERE enabled = true
),
total AS (
  SELECT sport, COUNT(*) as cnt FROM enabled GROUP BY sport
)
SELECT
  e.sport,
  e.tone,
  COUNT(*) as template_count,
  ROUND(COUNT(*)::numeric / t.cnt * 100, 1) as tone_pct,
  ROUND(COUNT(*) FILTER (WHERE has_culture_ref)::numeric / COUNT(*) * 100, 1) as culture_pct,
  ROUND(COUNT(*) FILTER (WHERE has_witty_ref)::numeric / COUNT(*) * 100, 1) as witty_pct,
  ROUND(COUNT(*) FILTER (WHERE has_extreme_game)::numeric / COUNT(*) * 100, 1) as extreme_pct,
  ROUND(COUNT(*) FILTER (WHERE has_player_name)::numeric / COUNT(*) * 100, 1) as player_name_pct,
  ROUND(AVG(pass_count)::numeric, 1) as avg_pass,
  ROUND(AVG(fail_count)::numeric, 1) as avg_fail,
  ROUND(AVG(fire_count)::numeric, 1) as avg_fire,
  COUNT(*) FILTER (WHERE register = 'win') as win_count,
  COUNT(*) FILTER (WHERE register = 'loss') as loss_count
FROM enabled e
JOIN total t ON t.sport = e.sport
GROUP BY e.sport, e.tone, t.cnt
ORDER BY e.sport, tone_pct DESC;
`;

const CREATE_STORY_STATS_VIEW = `
CREATE OR REPLACE VIEW commentary_story_stats AS
SELECT
  sport, register, story,
  COUNT(*) as template_count,
  ROUND(COUNT(*) FILTER (WHERE has_culture_ref)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as culture_pct,
  ROUND(COUNT(*) FILTER (WHERE has_witty_ref)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as witty_pct,
  ROUND(COUNT(*) FILTER (WHERE has_extreme_game)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as extreme_pct,
  ROUND(AVG(pass_count)::numeric, 1) as avg_pass,
  ROUND(AVG(fail_count)::numeric, 1) as avg_fail
FROM commentary_templates
WHERE enabled = true
GROUP BY sport, register, story
ORDER BY sport, register, template_count DESC;
`;

const CREATE_POOL_DEPTH_VIEW = `
CREATE OR REPLACE VIEW commentary_pool_depth AS
SELECT
  sport, register, story, tone,
  COUNT(*) as template_count,
  CASE WHEN COUNT(*) < 3 THEN 'THIN' WHEN COUNT(*) < 5 THEN 'OK' ELSE 'GOOD' END as pool_status
FROM commentary_templates
WHERE enabled = true
GROUP BY sport, register, story, tone
ORDER BY template_count ASC;
`;

async function main() {
  console.log("Setting up Supabase schema...");

  const queries = [
    { name: "table", sql: CREATE_TABLE },
    { name: "indexes", sql: CREATE_INDEXES },
    { name: "commentary_stats view", sql: CREATE_STATS_VIEW },
    { name: "commentary_story_stats view", sql: CREATE_STORY_STATS_VIEW },
    { name: "commentary_pool_depth view", sql: CREATE_POOL_DEPTH_VIEW },
  ];

  for (const { name, sql } of queries) {
    const { error } = await supabase.rpc("exec_sql", { query: sql }).maybeSingle();
    if (error) {
      // rpc may not exist — try raw SQL via postgrest
      const res = await supabase.from("_temp").select().limit(0); // test connection
      console.log(`  ⚠ Could not auto-run "${name}" — run this SQL manually in Supabase SQL Editor:`);
      console.log(sql);
      console.log("");
    } else {
      console.log(`  ✓ ${name}`);
    }
  }

  console.log("\nDone. If any queries failed, copy the SQL above into Supabase SQL Editor and run manually.");
}

main();
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsc --noEmit basketball/src/tools/setupSupabase.ts`

- [ ] **Step 3: Commit**

```bash
git add basketball/src/tools/setupSupabase.ts
git commit -m "feat(admin): supabase schema setup script — table, indexes, views

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

**Note:** The user will need to:
1. Create a Supabase project at app.supabase.com (or use existing)
2. Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to `.env.local`
3. Run `npx tsx basketball/src/tools/setupSupabase.ts` or paste the SQL into Supabase SQL Editor

---

### Task 3: Seed Script (static files → Supabase)

**Files:**
- Create: `basketball/src/tools/seedTemplates.ts`

- [ ] **Step 1: Create seed script**

```typescript
/**
 * seedTemplates.ts — One-time migration: static template banks → Supabase.
 * Run: npx tsx basketball/src/tools/seedTemplates.ts
 */

import { supabase } from "./supabaseClient";
import { BASKETBALL_TEMPLATES } from "../../../shared/commentary/templateBank.basketball";
import { BASEBALL_TEMPLATES } from "../../../shared/commentary/templateBank.baseball";
import type { CommentaryTemplate } from "../../../shared/commentary/types";

const NAME_TOKENS = ["{name}", "{last}", "{nick}", "{first}", "{nick2}"];

interface TemplateRow {
  sport: string;
  register: string;
  story: string;
  tone: string;
  template: string;
  enabled: boolean;
  has_player_name: boolean;
  has_culture_ref: boolean;
  has_extreme_game: boolean;
  has_witty_ref: boolean;
}

function flattenBank(sport: string, bank: CommentaryTemplate[]): TemplateRow[] {
  const rows: TemplateRow[] = [];
  for (const entry of bank) {
    for (const tmpl of entry.templates) {
      const hasPlayerName = NAME_TOKENS.some(t => tmpl.includes(t));
      rows.push({
        sport,
        register: entry.register,
        story: entry.story,
        tone: entry.tone,
        template: tmpl,
        enabled: true,
        has_player_name: hasPlayerName,
        has_culture_ref: false,  // Tag manually in Supabase Studio
        has_extreme_game: false,
        has_witty_ref: entry.tone === "culture_wry",  // Auto-tag wry tone as witty
      });
    }
  }
  return rows;
}

async function main() {
  console.log("Seeding templates to Supabase...\n");

  const basketballRows = flattenBank("basketball", BASKETBALL_TEMPLATES);
  const baseballRows = flattenBank("baseball", BASEBALL_TEMPLATES);
  const allRows = [...basketballRows, ...baseballRows];

  console.log(`  Basketball: ${basketballRows.length} templates`);
  console.log(`  Baseball:   ${baseballRows.length} templates`);
  console.log(`  Total:      ${allRows.length} templates\n`);

  // Insert in batches of 100
  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < allRows.length; i += 100) {
    const batch = allRows.slice(i, i + 100);
    const { data, error } = await supabase
      .from("commentary_templates")
      .upsert(batch, {
        onConflict: "sport,register,story,tone,template",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      console.error(`  ✗ Batch ${i}-${i + batch.length}: ${error.message}`);
      // If upsert fails due to missing unique constraint, try insert
      const { error: insertError } = await supabase
        .from("commentary_templates")
        .insert(batch);
      if (insertError) {
        console.error(`  ✗ Insert fallback failed: ${insertError.message}`);
      } else {
        inserted += batch.length;
      }
    } else {
      inserted += data?.length ?? batch.length;
    }
  }

  console.log(`  ✓ Inserted: ${inserted}`);
  console.log(`  ⊘ Skipped (duplicates): ${skipped}`);
  console.log("\nDone. Open Supabase Studio to browse and tag templates.");
}

main();
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsc --noEmit basketball/src/tools/seedTemplates.ts`

- [ ] **Step 3: Commit**

```bash
git add basketball/src/tools/seedTemplates.ts
git commit -m "feat(admin): seed script — migrate static templates to Supabase

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Update Audit Tool with Supabase Source

**Files:**
- Modify: `basketball/src/tools/commentaryAudit.ts`

The existing audit reads from static imports. Add a `--source=supabase` flag that:
1. Pulls enabled templates from Supabase
2. Builds an in-memory template bank
3. Runs the same grader
4. Writes pass_count, fail_count, fire_count, fail_reasons, last_audit back to each row

- [ ] **Step 1: Read the current audit tool**

Read: `basketball/src/tools/commentaryAudit.ts` — understand the current structure before modifying.

- [ ] **Step 2: Add Supabase source mode**

Add at the top of the file, after existing imports:

```typescript
import { supabase } from "./supabaseClient";
```

Add a flag parser before `main()`:

```typescript
const USE_SUPABASE = process.argv.includes("--source=supabase");
```

Add a function to load templates from Supabase and temporarily override the template bank:

```typescript
interface SupabaseTemplate {
  id: string;
  sport: string;
  register: string;
  story: string;
  tone: string;
  template: string;
}

async function loadSupabaseTemplates(): Promise<SupabaseTemplate[]> {
  const { data, error } = await supabase
    .from("commentary_templates")
    .select("id, sport, register, story, tone, template")
    .eq("enabled", true);

  if (error) {
    console.error("Failed to load templates from Supabase:", error.message);
    process.exit(1);
  }
  return data ?? [];
}

async function writeAuditStats(
  templateStats: Map<string, { pass: number; fail: number; fire: number; reasons: string[] }>,
): Promise<void> {
  const now = new Date().toISOString();
  let updated = 0;

  for (const [id, stats] of templateStats) {
    const { error } = await supabase
      .from("commentary_templates")
      .update({
        pass_count: stats.pass,
        fail_count: stats.fail,
        fire_count: stats.fire,
        fail_reasons: [...new Set(stats.reasons)].slice(0, 20),
        last_audit: now,
      })
      .eq("id", id);

    if (!error) updated++;
  }
  console.log(`\nWrote audit stats to ${updated} template rows in Supabase.`);
}
```

Modify `main()` to:
1. If `USE_SUPABASE`, load templates from Supabase, monkey-patch the template bank lookup to use them, and after grading call `writeAuditStats()`
2. Track per-template stats (which template ID produced which message, was it pass/fail)

The exact modifications depend on the current structure of `main()` — read it first, then integrate. The key changes:

- Before generating scenarios, if `USE_SUPABASE`: load templates, build a lookup map keyed by `${sport}|${register}|${story}|${tone}` → template strings with IDs
- After grading each scenario, record which template ID was used and whether it passed
- After all scenarios, call `writeAuditStats()`

- [ ] **Step 3: Test with static source (backward compat)**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsx basketball/src/tools/commentaryAudit.ts`
Expected: Same output as before — 100% pass, no Supabase involved.

- [ ] **Step 4: Commit**

```bash
git add basketball/src/tools/commentaryAudit.ts
git commit -m "feat(admin): audit tool supports --source=supabase with stats writeback

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Publish Script (Supabase → static files)

**Files:**
- Create: `basketball/src/tools/publishTemplates.ts`

- [ ] **Step 1: Create publish script**

```typescript
/**
 * publishTemplates.ts — Export enabled Supabase templates → static .ts files.
 * Run: npx tsx basketball/src/tools/publishTemplates.ts
 */

import { supabase } from "./supabaseClient";
import { writeFileSync } from "fs";
import { resolve } from "path";

interface TemplateRow {
  sport: string;
  register: string;
  story: string;
  tone: string;
  template: string;
}

interface GroupedEntry {
  register: string;
  story: string;
  tone: string;
  templates: string[];
}

async function main() {
  console.log("Publishing templates from Supabase...\n");

  const { data, error } = await supabase
    .from("commentary_templates")
    .select("sport, register, story, tone, template")
    .eq("enabled", true)
    .order("sport")
    .order("register")
    .order("story")
    .order("tone");

  if (error) {
    console.error("Failed to load templates:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as TemplateRow[];

  // Group by sport, then by (register, story, tone)
  const bySport: Record<string, GroupedEntry[]> = {};

  for (const row of rows) {
    if (!bySport[row.sport]) bySport[row.sport] = [];
    const sport = bySport[row.sport];
    let entry = sport.find(
      e => e.register === row.register && e.story === row.story && e.tone === row.tone,
    );
    if (!entry) {
      entry = { register: row.register, story: row.story, tone: row.tone, templates: [] };
      sport.push(entry);
    }
    entry.templates.push(row.template);
  }

  // Write each sport's file
  const sharedDir = resolve(import.meta.dirname, "../../../shared/commentary");

  for (const [sport, entries] of Object.entries(bySport)) {
    const varName = sport.toUpperCase() + "_TEMPLATES";
    const lines: string[] = [
      `/**`,
      ` * templateBank.${sport}.ts — Auto-generated from Supabase.`,
      ` * DO NOT EDIT MANUALLY — changes will be overwritten by publishTemplates.ts`,
      ` * Generated: ${new Date().toISOString()}`,
      ` */`,
      ``,
      `import type { CommentaryTemplate } from "./types";`,
      ``,
      `export const ${varName}: CommentaryTemplate[] = [`,
    ];

    for (const entry of entries) {
      const templatesStr = entry.templates
        .map(t => `    ${JSON.stringify(t)},`)
        .join("\n");
      lines.push(`  { register: ${JSON.stringify(entry.register)}, story: ${JSON.stringify(entry.story)}, tone: ${JSON.stringify(entry.tone)}, templates: [`);
      lines.push(templatesStr);
      lines.push(`  ]},`);
    }

    lines.push(`];`);
    lines.push(``);

    const filePath = resolve(sharedDir, `templateBank.${sport}.ts`);
    writeFileSync(filePath, lines.join("\n"), "utf-8");
    console.log(`  ✓ ${sport}: ${entries.reduce((s, e) => s + e.templates.length, 0)} templates → ${filePath}`);
  }

  console.log("\nDone. Review the changes, run the audit, then commit and deploy.");
}

main();
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsc --noEmit basketball/src/tools/publishTemplates.ts`

- [ ] **Step 3: Commit**

```bash
git add basketball/src/tools/publishTemplates.ts
git commit -m "feat(admin): publish script — export Supabase templates to static .ts files

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: End-to-End Test

This task verifies the full workflow. Requires Supabase credentials in `.env.local`.

- [ ] **Step 1: Run setup script**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsx basketball/src/tools/setupSupabase.ts`

If the RPC method doesn't work, copy the SQL from the script output into Supabase SQL Editor and run manually.

- [ ] **Step 2: Run seed script**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsx basketball/src/tools/seedTemplates.ts`

Expected output:
```
Seeding templates to Supabase...

  Basketball: ~90 templates
  Baseball:   ~80 templates
  Total:      ~170 templates

  ✓ Inserted: ~170
```

- [ ] **Step 3: Verify in Supabase Studio**

Open app.supabase.com → your project → Table Editor → `commentary_templates`. Verify:
- Rows exist with correct sport, register, story, tone, template values
- `enabled` is true for all
- `has_player_name` is auto-detected
- `has_witty_ref` is true for culture_wry tone entries

- [ ] **Step 4: Run audit with Supabase source**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsx basketball/src/tools/commentaryAudit.ts --source=supabase`

Expected: Same pass rate as static audit (~100%). Audit stats written back to Supabase.

- [ ] **Step 5: Verify stats in Supabase Studio**

Check `commentary_templates` table — `pass_count`, `fail_count`, `fire_count`, `last_audit` should be populated.

Check `commentary_stats` view — tone distribution percentages visible.

Check `commentary_pool_depth` view — any THIN pools flagged.

- [ ] **Step 6: Test publish round-trip**

Run: `cd /Users/john/Desktop/ReplayMod && npx tsx basketball/src/tools/publishTemplates.ts`

Expected: Static files overwritten. Run `git diff` to confirm the files changed (format may differ slightly from hand-written originals but content should match).

Run audit against static files to verify they still pass: `cd /Users/john/Desktop/ReplayMod && npx tsx basketball/src/tools/commentaryAudit.ts`

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(admin): commentary admin dashboard — full Supabase workflow verified

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
