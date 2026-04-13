# Commentary Admin Dashboard — Design Spec

**Date:** 2026-04-13
**Project:** ReplayMod
**Status:** Draft — pending user review

---

## 1. Problem

Commentary templates live in static TypeScript files. To edit, add, or veto a template you have to open the source code, find the right array entry, make the change, and redeploy. There's no way to:

- See quality stats per template (pass/fail rates, how often each fires)
- Quickly toggle a bad template off without deleting it
- Monitor the content mix (% culture, % witty, % by tone)
- Add new templates without touching code

## 2. Solution

Use **Supabase as an internal workbench** for managing templates. Supabase Studio (the built-in table editor at app.supabase.com) is the admin UI — no custom frontend needed.

**Key principle:** Supabase is never touched at runtime. The composer keeps reading from static `.ts` files. Supabase is purely for editing and quality monitoring. A publish script exports Supabase → static files when you're ready to ship changes.

---

## 3. Architecture

```
Runtime (user-facing):   Composer → static .ts files (no change)
Admin (internal):        Supabase Studio → browse/edit/add/veto templates
Audit (internal):        CLI → runs scenarios against Supabase templates → writes stats back
Publish (when ready):    CLI → pulls enabled templates from Supabase → overwrites static .ts files → commit + deploy
```

### Workflow

1. Open Supabase Studio, browse templates
2. Add new templates, toggle `enabled` on/off, edit text, add notes
3. Run audit: `npx tsx tools/commentaryAudit.ts --source=supabase`
4. Check stats in Supabase Studio — pass rates, tone distribution, content mix
5. Fix flagged templates, re-audit until satisfied
6. Publish: `npx tsx tools/publishTemplates.ts`
7. Commit the updated static `.ts` files, deploy

### Zero runtime cost

- No Supabase queries during gameplay
- No KV cache needed
- No API routes needed
- Static files are the runtime source of truth
- Supabase is the editing/QA source of truth

### Fallback

Static `.ts` files always exist and always work. If Supabase is empty, down, or you never run the publish script, the game runs exactly as it does today.

---

## 4. Data Model

### Table: `commentary_templates`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid (PK) | gen_random_uuid() | Row ID |
| `sport` | text | — | "basketball", "baseball" |
| `register` | text | — | "win", "loss" |
| `story` | text | — | "star_went_off", "star_delivered", "star_quiet_win", "clean_win", "star_no_showed", "star_cold", "everyone_flat" |
| `tone` | text | — | "hype", "warm", "culture_wry", "observational", "analytical", "deadpan" |
| `template` | text | — | The template string with tokens ({name}, {last}, {nick}, {pts}, {opp}, etc.) |
| `enabled` | boolean | true | Soft disable — vetoed templates stay in DB but don't fire |
| `has_culture_ref` | boolean | false | References player culture content (nicknames, history, personality) |
| `has_extreme_game` | boolean | false | References record-level or historic performance |
| `has_witty_ref` | boolean | false | Has Inside the NBA / smartass energy |
| `has_player_name` | boolean | true | Uses a player name token ({name}, {last}, {nick}, {first}) |
| `pass_count` | int | 0 | Audit: how many scenarios this template passed |
| `fail_count` | int | 0 | Audit: how many scenarios this template failed |
| `fire_count` | int | 0 | Audit: how many times this template was selected |
| `fail_reasons` | text[] | {} | Audit: array of failure reasons from last run |
| `last_audit` | timestamptz | null | When the audit last ran against this template |
| `created_at` | timestamptz | now() | Row creation time |
| `notes` | text | null | Your notes — why vetoed, ideas for improvement |

### Indexes

- `idx_templates_sport_enabled` on `(sport, enabled)` — the publish query
- `idx_templates_lookup` on `(sport, register, story, tone, enabled)` — the audit lookup

### SQL View: `commentary_stats`

Read-only view showing content mix percentages across all enabled templates:

```sql
CREATE OR REPLACE VIEW commentary_stats AS
WITH enabled AS (
  SELECT * FROM commentary_templates WHERE enabled = true
),
total AS (
  SELECT sport, COUNT(*) as cnt FROM enabled GROUP BY sport
)
SELECT
  e.sport,
  -- Tone distribution
  e.tone,
  COUNT(*) as template_count,
  ROUND(COUNT(*)::numeric / t.cnt * 100, 1) as tone_pct,
  -- Content tags
  ROUND(COUNT(*) FILTER (WHERE has_culture_ref)::numeric / COUNT(*) * 100, 1) as culture_pct,
  ROUND(COUNT(*) FILTER (WHERE has_witty_ref)::numeric / COUNT(*) * 100, 1) as witty_pct,
  ROUND(COUNT(*) FILTER (WHERE has_extreme_game)::numeric / COUNT(*) * 100, 1) as extreme_pct,
  ROUND(COUNT(*) FILTER (WHERE has_player_name)::numeric / COUNT(*) * 100, 1) as player_name_pct,
  -- Quality
  ROUND(AVG(pass_count)::numeric, 1) as avg_pass,
  ROUND(AVG(fail_count)::numeric, 1) as avg_fail,
  ROUND(AVG(fire_count)::numeric, 1) as avg_fire,
  -- Pool depth
  COUNT(*) FILTER (WHERE register = 'win') as win_count,
  COUNT(*) FILTER (WHERE register = 'loss') as loss_count
FROM enabled e
JOIN total t ON t.sport = e.sport
GROUP BY e.sport, e.tone, t.cnt
ORDER BY e.sport, tone_pct DESC;

-- Per-story breakdown
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
```

### SQL View: `commentary_pool_depth`

Flags thin pools — any (sport, register, story, tone) combination with fewer than 3 enabled templates:

```sql
CREATE OR REPLACE VIEW commentary_pool_depth AS
SELECT
  sport, register, story, tone,
  COUNT(*) as template_count,
  CASE WHEN COUNT(*) < 3 THEN 'THIN' WHEN COUNT(*) < 5 THEN 'OK' ELSE 'GOOD' END as pool_status
FROM commentary_templates
WHERE enabled = true
GROUP BY sport, register, story, tone
ORDER BY template_count ASC;
```

---

## 5. CLI Tools

### 5a. `tools/seedTemplates.ts` — One-time migration

Reads the current static template bank files, inserts every template as a row in Supabase. Run once to populate the database.

**Input:** `templateBank.basketball.ts`, `templateBank.baseball.ts`
**Output:** Rows in `commentary_templates` table
**Logic:**
- Parse each `CommentaryTemplate` entry
- Each string in the `templates[]` array becomes one row
- Auto-detect `has_player_name` by checking if template contains `{name}`, `{last}`, `{nick}`, `{first}`, `{nick2}`
- `has_culture_ref`, `has_witty_ref`, `has_extreme_game` default to false — you tag these manually in Supabase Studio after seeding
- Skip duplicates (check by template text + sport + register + story + tone)

**Run:** `npx tsx tools/seedTemplates.ts`

### 5b. `tools/commentaryAudit.ts` — Updated with Supabase source

The existing audit tool gets a `--source=supabase` flag. When set:

- Pulls all enabled templates from Supabase (instead of importing static files)
- Builds a temporary in-memory template bank
- Runs the same scenario generator + grader
- After grading, writes back to each template row: `pass_count`, `fail_count`, `fire_count`, `fail_reasons`, `last_audit`
- Prints the same CLI report as before

**Default (no flag):** Runs against static files as today — backward compatible.

**Run:** `npx tsx tools/commentaryAudit.ts --source=supabase`

### 5c. `tools/publishTemplates.ts` — Export Supabase → static files

Pulls all `enabled = true` templates from Supabase, groups by (sport, register, story, tone), and overwrites the static `.ts` files.

**Logic:**
- Query: `SELECT * FROM commentary_templates WHERE enabled = true ORDER BY sport, register, story, tone`
- Group into the `CommentaryTemplate[]` array format
- Write `templateBank.basketball.ts` and `templateBank.baseball.ts`
- Print summary: "Published 85 basketball templates, 78 baseball templates"

**Run:** `npx tsx tools/publishTemplates.ts`

---

## 6. Supabase Setup

### Project creation

Create a new Supabase project (or use existing if one exists). Add to `.env.local`:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...  # service role key for CLI tools (NOT anon key)
```

The service role key is only used by CLI tools running locally. It never touches the frontend or Vercel deployment. The game itself has zero Supabase dependencies.

### Supabase client

A small shared client for CLI tools only:

```typescript
// tools/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);
```

---

## 7. What You See in Supabase Studio

### Templates table view

Filter by `sport = basketball AND tone = culture_wry` to see all wry basketball templates. Columns visible:

- `template` — the actual text
- `enabled` — toggle on/off
- `has_culture_ref` / `has_witty_ref` / `has_extreme_game` — content tags (editable)
- `tone` — visible and filterable
- `story` — visible and filterable
- `pass_count` / `fail_count` / `fire_count` — quality stats from last audit
- `fail_reasons` — why it failed (if it did)
- `notes` — your annotations

### Stats view

The `commentary_stats` view shows:
- Tone distribution per sport (is culture_wry at 35%? is hype at the right level?)
- Content mix (what % of templates have culture refs? witty refs? extreme game?)
- Quality averages (avg pass/fail per tone)

### Pool depth view

The `commentary_pool_depth` view flags:
- Any (sport, register, story, tone) combo with < 3 templates marked "THIN"
- Tells you exactly where to add more content

---

## 8. File Architecture

```
tools/
  supabaseClient.ts        — NEW: shared Supabase client for CLI tools
  seedTemplates.ts          — NEW: one-time migration from static files → Supabase
  publishTemplates.ts       — NEW: export Supabase → static .ts files
  commentaryAudit.ts        — MODIFIED: add --source=supabase flag + write stats back

shared/commentary/
  templateBank.basketball.ts — EXISTING: still the runtime source, now also publishable from Supabase
  templateBank.baseball.ts   — EXISTING: same
  templateBank.ts            — EXISTING: no changes
  composeCommentary.ts       — EXISTING: no changes (still reads static files)
```

---

## 9. Out of Scope

- **Custom admin UI** — Supabase Studio is the UI. No React admin page.
- **Runtime Supabase queries** — the composer never touches Supabase. Static files only at runtime.
- **Production logging** — which templates fire for real users. Future enhancement.
- **LLM-assisted template generation** — future. Would plug into this system by writing new rows to Supabase with `enabled = false` for review.
- **Auto-publish on Supabase change** — manual publish via CLI. Could add a webhook later.
