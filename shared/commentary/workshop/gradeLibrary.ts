/**
 * gradeLibrary.ts — Batch-grade the production commentary library.
 *
 * Reports: auto-rejected lines, coverage gaps, distribution stats.
 *
 * Usage: npx tsx shared/commentary/workshop/gradeLibrary.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { autoReject } from "./scoringRubric";
import type { CommentaryLine, CommentaryLibrary } from "../types";
import { getActiveArchetypes } from "../archetypes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIBRARY_DIR = path.join(__dirname, "../libraries");

function gradeLibrary(sport: string): void {
  const filePath = path.join(LIBRARY_DIR, `${sport}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`No library found for ${sport}`);
    return;
  }

  const library: CommentaryLibrary = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const activeArchetypes = getActiveArchetypes();

  console.log(`\n═══ ${sport.toUpperCase()} LIBRARY GRADE ═══\n`);

  let totalLines = 0;
  let enabledLines = 0;
  let rejectedLines = 0;
  const archetypeCoverage: Record<string, { total: number; byTone: Record<string, number> }> = {};

  for (const [archetype, lines] of Object.entries(library)) {
    archetypeCoverage[archetype] = { total: lines.length, byTone: {} };
    for (const line of lines) {
      totalLines++;
      if (line.enabled) enabledLines++;

      const t = line.tone;
      archetypeCoverage[archetype].byTone[t] = (archetypeCoverage[archetype].byTone[t] ?? 0) + 1;

      const reasons = autoReject(line.template);
      if (reasons.length > 0) {
        rejectedLines++;
        console.log(`  ✗ [${line.id}] ${archetype}/${line.tone}: ${reasons.join(", ")}`);
        console.log(`    "${line.template.slice(0, 80)}..."`);
      }
    }
  }

  console.log(`\n── Coverage Report ──\n`);
  const tones = ["hype", "warm", "culture_wry", "observational", "analytical", "deadpan"];
  for (const arch of activeArchetypes) {
    const cov = archetypeCoverage[arch];
    if (!cov) {
      console.log(`  ⚠ ${arch}: NO LINES (empty archetype)`);
      continue;
    }
    const gaps = tones.filter(t => (cov.byTone[t] ?? 0) < 2);
    if (gaps.length > 0) {
      console.log(`  △ ${arch} (${cov.total} lines): needs more for: ${gaps.join(", ")}`);
    } else {
      console.log(`  ✓ ${arch}: ${cov.total} lines, all tones covered`);
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`  Total lines:    ${totalLines}`);
  console.log(`  Enabled:        ${enabledLines}`);
  console.log(`  Auto-rejected:  ${rejectedLines}`);
  console.log(`  Archetypes:     ${Object.keys(archetypeCoverage).length} / ${activeArchetypes.length} active`);
}

gradeLibrary("basketball");
