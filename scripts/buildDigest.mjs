#!/usr/bin/env node
/**
 * scripts/buildDigest.mjs — project digest zip for reasoning Claude handoffs.
 *
 * Walks the tree, includes TS sources + key JSON + CLAUDE.md + package.json
 * files + branch state + a generated _index.md. Skips node_modules, dist,
 * build, .next, snapshots, binaries, lock files, source maps, and test files
 * (set INCLUDE_TESTS=1 to keep tests).
 *
 * Output: replaymod-digest-{branch}-{YYYYMMDD-HHMM}.zip at repo root.
 * Gitignored. Recreate whenever branch state changes during a session.
 *
 * Usage:
 *   npm run digest
 *   INCLUDE_TESTS=1 npm run digest
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
process.chdir(REPO_ROOT);

const INCLUDE_TESTS = process.env.INCLUDE_TESTS === "1";

// ── What to include ────────────────────────────────────────────────────────
const SOURCE_ROOTS = ["shared", "basketball/src", "football/src", "baseball/src"];
const SINGLE_FILES = [
  "CLAUDE.md",
  "package.json",
  "basketball/package.json",
  "baseball/package.json",
  "football/package.json",
  "worldcup/package.json",
];
// Probed in order; whichever exists is included.
const DECISIONS_CANDIDATES = [
  "docs/replaymod-design-decisions.md",
  "docs/DECISIONS.md",
  "docs/decisions.md",
  "docs/architecture.md",
  "docs/launch/HANDOVER.md",
];
// Per-sport JSON config worth including (threshold tables, etc.).
const SPORT_JSON_GLOBS = [
  "basketball/src/data/winThresholds.json",
  "basketball/public/data/winThresholds.json",
  "baseball/src/data/winThresholds.json",
  "baseball/public/data/winThresholds.json",
  "football/src/data/winThresholds.json",
  "football/public/data/winThresholds.json",
];

// ── What to skip ───────────────────────────────────────────────────────────
const EXCLUDE_DIRS = new Set([
  "node_modules", "dist", "build", ".next", ".git", ".vite", ".vercel",
  "coverage", ".turbo", "__snapshots__",
]);
const EXCLUDE_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".avif",
  ".mp3", ".wav", ".ogg", ".m4a", ".mp4", ".mov", ".webm",
  ".ttf", ".woff", ".woff2", ".otf", ".eot",
  ".map", ".snap",
  ".zip", ".tar", ".gz",
]);
const EXCLUDE_FILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);

const isTestPath = rel =>
  /(^|\/)__tests__\//.test(rel) || /\.test\.(t|j)sx?$/.test(rel) || /\.spec\.(t|j)sx?$/.test(rel);

function shouldInclude(rel) {
  const base = path.basename(rel);
  const ext = path.extname(rel);
  if (EXCLUDE_FILES.has(base)) return false;
  if (EXCLUDE_EXTS.has(ext)) return false;
  if (base.endsWith(".min.js")) return false;
  if (!INCLUDE_TESTS && isTestPath(rel)) return false;
  return true;
}

function walk(rootRel, out = []) {
  const full = path.join(REPO_ROOT, rootRel);
  if (!fs.existsSync(full)) return out;
  for (const e of fs.readdirSync(full, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const sub = path.join(rootRel, e.name);
    if (e.isDirectory()) walk(sub, out);
    else if (e.isFile() && shouldInclude(sub)) out.push(sub);
  }
  return out;
}

// ── Description extraction (for _index.md) ─────────────────────────────────
function extractDescription(rel) {
  const full = path.join(REPO_ROOT, rel);
  try {
    const content = fs.readFileSync(full, "utf8");
    const m = content.match(/\/\*\*([\s\S]*?)\*\//);
    if (m) {
      let cleaned = m[1]
        .replace(/^\s*\*\s?/gm, "")  // strip leading "* " from each line
        .trim();
      // Drop the first line if it's just a file path (with or without
      // trailing em-dash). Common pattern: "shared/foo/bar.ts" then blank
      // line then description.
      const firstLine = cleaned.split("\n", 1)[0];
      if (/^[\w@./\-]+\.(ts|tsx|mjs|js)\s*[—–\-:]?\s*$/.test(firstLine.trim())) {
        cleaned = cleaned.slice(firstLine.length).trim();
      }
      // Also strip any inline path-dash prefix that survived
      cleaned = cleaned.replace(/^[\w@./\-]+\.(ts|tsx|mjs|js)\s*[—–\-:]\s*/, "");
      // Collapse paragraphs; take first non-empty paragraph
      const para = (cleaned.split(/\n\s*\n/).find(p => p.trim()) ?? "");
      const desc = para.replace(/\s+/g, " ").trim();
      if (!desc) return "";
      // Cap to first two sentences (period-delimited), then to ~200 chars.
      const sentences = desc.match(/[^.!?]+[.!?]+/g);
      const twoSent = sentences ? sentences.slice(0, 2).join("").trim() : desc;
      return twoSent.length > 200 ? twoSent.slice(0, 199) + "…" : twoSent;
    }
    // Match `// comment` but reject `/// directive`. The negative lookahead
    // rules out three-or-more slashes (triple-slash reference directives).
    const single = content.match(/^\/\/(?!\/)\s*(.+)$/m);
    if (single) return single[1].trim();
  } catch {}
  return "";
}

function describeFallback(rel) {
  const base = path.basename(rel);
  const ext = path.extname(rel);
  if (base === "package.json") return "Package manifest.";
  if (base.endsWith(".d.ts")) return "Type declarations.";
  if (ext === ".json") return "Configuration / data file.";
  if (ext === ".md") return "Documentation.";
  if (ext === ".css") return "Stylesheet.";
  if (ext === ".ts" || ext === ".tsx") return "TypeScript source.";
  if (ext === ".mjs" || ext === ".js") return "JavaScript source.";
  return "";
}

// ── Group files by section for the index ───────────────────────────────────
// Use exact dirname so each subdirectory gets its own table — clearer than
// the manual case-list we tried first. Root-level files all roll up to "_root".
function groupKey(rel) {
  const dir = path.dirname(rel);
  return dir === "." ? "_root" : dir;
}

// ── Build manifest ─────────────────────────────────────────────────────────
const manifest = new Set();
for (const f of SINGLE_FILES) {
  if (fs.existsSync(path.join(REPO_ROOT, f))) manifest.add(f);
}
for (const f of SPORT_JSON_GLOBS) {
  if (fs.existsSync(path.join(REPO_ROOT, f))) manifest.add(f);
}
for (const cand of DECISIONS_CANDIDATES) {
  if (fs.existsSync(path.join(REPO_ROOT, cand))) {
    manifest.add(cand);
    break; // include first match only
  }
}
for (const root of SOURCE_ROOTS) {
  for (const f of walk(root)) manifest.add(f);
}
const files = [...manifest].sort();

// ── Branch state ───────────────────────────────────────────────────────────
function git(cmd) {
  try { return execSync(`git ${cmd}`, { encoding: "utf8" }).trim(); }
  catch (e) { return `(git ${cmd} failed: ${e.message.split("\n")[0]})`; }
}
const branch = git("branch --show-current") || "detached";
const branchSafe = branch.replace(/[\/\\\s]+/g, "-");
const branchTxt = [
  "# Branch state",
  "",
  `## git branch --show-current`,
  branch,
  "",
  `## git log --oneline main..HEAD`,
  git("log --oneline main..HEAD"),
  "",
  `## git status --short`,
  git("status --short"),
].join("\n") + "\n";

// ── Index markdown ─────────────────────────────────────────────────────────
const groups = new Map();
for (const rel of files) {
  const g = groupKey(rel);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(rel);
}

const indexLines = [];
indexLines.push("# Project digest — file index");
indexLines.push("");
indexLines.push(`Branch: \`${branch}\`  •  Files: ${files.length}  •  Tests: ${INCLUDE_TESTS ? "included" : "excluded"}`);
indexLines.push("");
indexLines.push("Hand-curated guide to the codebase. Two-sentence descriptions are extracted from each file's leading JSDoc when present.");
indexLines.push("");
indexLines.push("Top-level layout:");
indexLines.push("- `shared/` — sport-agnostic infrastructure (engines, components, utils, commentary, etc.). Imported by every SPA via the `@shared` alias.");
indexLines.push("- `basketball/`, `baseball/`, `football/`, `worldcup/` — independent Vite + React SPAs, one per sport. Each has its own `package.json` and adapter wiring.");
indexLines.push("- `docs/` — design specs, plans, calibration runbooks.");
indexLines.push("- See `CLAUDE.md` at digest root for the full project guide.");
indexLines.push("");

const sortedGroups = [...groups.keys()].sort();
for (const g of sortedGroups) {
  indexLines.push(`## ${g}`);
  indexLines.push("");
  indexLines.push("| file | description |");
  indexLines.push("| --- | --- |");
  for (const rel of groups.get(g)) {
    const desc = extractDescription(rel) || describeFallback(rel);
    const cell = desc.replace(/\|/g, "\\|").replace(/\n/g, " ");
    indexLines.push(`| \`${path.basename(rel)}\` | ${cell} |`);
  }
  indexLines.push("");
}
const indexMd = indexLines.join("\n") + "\n";

// ── Stage files in a temp directory + zip ──────────────────────────────────
const now = new Date();
const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}` +
  `-${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
const zipName = `replaymod-digest-${branchSafe}-${ts}.zip`;
const zipPath = path.join(REPO_ROOT, zipName);

const stageDir = fs.mkdtempSync(path.join(REPO_ROOT, ".digest-stage-"));
try {
  fs.writeFileSync(path.join(stageDir, "_branch.txt"), branchTxt);
  fs.writeFileSync(path.join(stageDir, "_index.md"), indexMd);
  for (const rel of files) {
    const dest = path.join(stageDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, rel), dest);
  }
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`zip -r -q "${zipPath}" .`, { cwd: stageDir });
} finally {
  fs.rmSync(stageDir, { recursive: true, force: true });
}

const bytes = fs.statSync(zipPath).size;
const mb = (bytes / (1024 * 1024)).toFixed(2);
console.log(`Wrote ${zipName}  (${files.length} files, ${mb} MB)`);
console.log(`Branch: ${branch}`);
console.log(`Tests:  ${INCLUDE_TESTS ? "included" : "excluded — set INCLUDE_TESTS=1 to include"}`);
