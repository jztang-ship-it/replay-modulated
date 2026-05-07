/**
 * football/scripts/processPlayerHeadshots.mjs
 *
 * Mode-dispatched, damage-aware background-removal pipeline for football
 * headshots.
 *
 * Reads:  football/public/players/<basePlayerId>.png       (originals — sacred, never modified)
 * Writes: football/public/players-processed/<basePlayerId>.png  (alpha-cut)
 * Writes: football/public/players-processed/_quality.json  (per-id quality flag)
 *
 * Why this is mode-dispatched (not a single algorithm)
 * ─────────────────────────────────────────────────────
 * The football source set is inconsistent — white-studio, grey-studio,
 * dark/pitch backdrops, and kit-coloured backdrops all coexist. A single
 * aggressive algorithm fixes the grey-studio cases but eats faces on
 * white-studio cases (commit 751f524 was the canary). A single
 * conservative algorithm leaves grey backdrops alone. Solution:
 * per-player mode in football/scripts/playerProcessingOverrides.mjs,
 * dispatched here.
 *
 * Modes
 * ─────
 *   whiteStudio       conservative: bright > 215 AND sat < 15 (or 8 with
 *                     preserveJersey:true). Edge-connected flood-fill
 *                     from a 1-pixel inset border. Won't eat skin or
 *                     coloured jerseys.
 *
 *   grayStudio        Martinez-fix algorithm. bright > 90 + sat < 35
 *                     with neutral-channel arm. 3-pixel inset seeds.
 *                     Eats more aggressively; ONLY for uniform grey
 *                     backdrops where subject is colourful/dark enough
 *                     to fence off interior neutrals.
 *
 *   darkStudio        bright < 100 AND sat < 35, edge-connected only,
 *                     3-pixel inset. For shots where bg is darker than
 *                     subject (blurry pitch behind a bright subject).
 *                     Conservative because it's edge-connected, so
 *                     interior dark hair/clothing stays opaque.
 *
 *   skipUseOriginal   delete any existing processed file. Resolver
 *                     serves the raw local image as-is.
 *
 *   manualBadCutout   delete any existing processed file. Resolver
 *                     uses fallback tile (no processed image used).
 *
 * Damage detection
 * ────────────────
 * Every successful processing pass runs the result through detectDamage()
 * before writing. The pass is REJECTED (no overwrite, no quality entry)
 * if any of:
 *
 *   - total transparent area > 75%               → "too-transparent"
 *   - center 40% face zone > 30% transparent     → "face-eaten"
 *
 * On rejection: the existing processed file is left alone, the player
 * is recorded in _quality.json with quality:"badCutout", and the
 * resolver will refuse to use the processed file.
 *
 * Quality JSON sidecar
 * ────────────────────
 * Output: football/public/players-processed/_quality.json
 *
 *   {
 *     "<id>": {
 *       "quality": "cleanCutout" | "badCutout" | "manualBadCutout" | "skipUseOriginal" | "unprocessed",
 *       "mode": "<mode used>",
 *       "pctTrans": <number>,
 *       "pctFaceTrans": <number>,
 *       "reason": "<damage-reason if applicable>"
 *     }
 *   }
 *
 * Read by the runtime resolver in shared/media/playerImages.ts (via a
 * statically-imported JSON sidecar that Vite ships with the SPA bundle).
 *
 * Originals are SACRED
 * ────────────────────
 * Nothing in this script ever writes to football/public/players/. The
 * originals are the source of truth. The processed dir is regeneratable.
 *
 * Usage
 * ─────
 *   node football/scripts/processPlayerHeadshots.mjs                  # process new only
 *   node football/scripts/processPlayerHeadshots.mjs --force          # re-process all (mode-aware)
 *   node football/scripts/processPlayerHeadshots.mjs --dry-run        # preview
 *   node football/scripts/processPlayerHeadshots.mjs --ids=6909,5503  # only listed ids
 *   node football/scripts/processPlayerHeadshots.mjs --feather=0      # disable 1-px feather
 *
 * Tuning flags (override per-mode defaults, applied to ALL modes for the run):
 *   --whiteSat=15 --whiteBright=215
 *   --whiteSatPreserve=8 --whiteBrightPreserve=230
 *   --graySat=35 --grayBright=120 --grayNeutralEps=18 --grayNeutralMinBright=90
 *   --darkSat=35 --darkBrightMax=100
 *   --grayInset=3 --darkInset=3 --whiteInset=1
 *   --damageMaxTransPct=75 --damageMaxFacePct=30
 */

import sharp from "sharp";
import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { getProcessingOverride } from "./playerProcessingOverrides.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI flag plumbing ────────────────────────────────────────────────────
const argMap = new Map(
  process.argv.slice(2).map(a => {
    const eq = a.indexOf("=");
    return eq > 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [a, "true"];
  })
);
const opt = (k, fallback) => argMap.get(k) ?? fallback;
const intOpt = (k, fallback) => parseInt(opt(k, String(fallback)), 10);

const FORCE = argMap.has("--force");
const DRY_RUN = argMap.has("--dry-run");
const SKIP_MANIFEST = argMap.has("--skip-manifest");
// Feather defaults to 0 (no edge softening). The previous baseline run
// shipped with feather=0; enabling 1px morphological feather changes the
// alpha edge of every existing PNG and would churn bytes on every player
// for no visual win. Set --feather=1 explicitly to opt in.
const FEATHER = Math.max(0, intOpt("--feather", 0));

const ID_FILTER = (() => {
  const raw = opt("--ids", "");
  if (typeof raw !== "string" || raw === "" || raw === "true") return null;
  return new Set(raw.split(",").map(s => s.trim()).filter(Boolean));
})();

// Per-mode tunables (CLI flags can override).
//
// whiteStudio defaults match the pre-751f524 working baseline exactly
// (RGB-all>=215 OR (bright>225 AND sat<20), edge-only flood-fill, no
// feather) so unaffected players keep their existing pixel-perfect
// output. The Martinez-fix algorithm lives only on grayStudio (opt-in
// per id). preserveJersey tightens further to avoid eating near-white
// jerseys (Mbappé France white kit, Argentina jersey highlights).
const TUNE = {
  whiteStudio:        {
    rgbAll: intOpt("--whiteRgbAll", 215),
    sat:    intOpt("--whiteSat", 20),
    bright: intOpt("--whiteBright", 225),
    inset:  intOpt("--whiteInset", 1),
  },
  // Preserve mode raises the RGB-all and bright floors and tightens sat,
  // so any pixel that's "really really white" still goes (avoids visible
  // halo) but anything that could be a near-white jersey highlight stays.
  whiteStudioPreserve: {
    rgbAll: intOpt("--whiteRgbAllPreserve", 230),
    sat:    intOpt("--whiteSatPreserve", 10),
    bright: intOpt("--whiteBrightPreserve", 235),
    inset:  intOpt("--whiteInset", 1),
  },
  grayStudio: {
    sat:               intOpt("--graySat", 35),
    bright:            intOpt("--grayBright", 120),
    inset:             intOpt("--grayInset", 3),
    neutralEps:        intOpt("--grayNeutralEps", 18),
    neutralMinBright:  intOpt("--grayNeutralMinBright", 90),
  },
  darkStudio: {
    sat:       intOpt("--darkSat", 35),
    brightMax: intOpt("--darkBrightMax", 100),
    inset:     intOpt("--darkInset", 3),
  },
};

const DAMAGE = {
  maxTransPct: parseFloat(opt("--damageMaxTransPct", "75")),
  maxFacePct:  parseFloat(opt("--damageMaxFacePct", "30")),
};

const LOW_COVERAGE_PCT = 15;

const inputDir    = resolvePath(__dirname, "../public/players");
const outputDir   = resolvePath(__dirname, "../public/players-processed");
// _quality.json in public/ is purely for inspection/debugging — the
// runtime registry imports the JSON sidecar in src/data/ (Vite-bundled).
const qualityPathPublic = resolvePath(outputDir, "_quality.json");
const qualityPathSrc    = resolvePath(__dirname, "../src/data/playerProcessingQuality.json");
const manifestPath = resolvePath(__dirname, "../src/data/playerImageManifest.ts");

console.log("─".repeat(72));
console.log(`Mode dispatch: per-player overrides (default: whiteStudio)`);
console.log(`whiteStudio:        rgb-all>=${TUNE.whiteStudio.rgbAll} OR (sat<${TUNE.whiteStudio.sat} AND bright>${TUNE.whiteStudio.bright}), inset=${TUNE.whiteStudio.inset}`);
console.log(`whiteStudio+preserve: rgb-all>=${TUNE.whiteStudioPreserve.rgbAll} OR (sat<${TUNE.whiteStudioPreserve.sat} AND bright>${TUNE.whiteStudioPreserve.bright})`);
console.log(`grayStudio:         sat<${TUNE.grayStudio.sat}, bright>${TUNE.grayStudio.bright}, neutralEps=${TUNE.grayStudio.neutralEps}, neutralMinBright=${TUNE.grayStudio.neutralMinBright}, inset=${TUNE.grayStudio.inset}`);
console.log(`darkStudio:         sat<${TUNE.darkStudio.sat}, bright<${TUNE.darkStudio.brightMax}, inset=${TUNE.darkStudio.inset}`);
console.log(`Damage rejection:   pctTrans>${DAMAGE.maxTransPct}% OR faceZoneTrans>${DAMAGE.maxFacePct}%`);
console.log(`Feather:            ${FEATHER === 0 ? "DISABLED" : `${FEATHER}px morphological`}`);
console.log(`Mode:               ${DRY_RUN ? "DRY RUN" : "WRITE"}${FORCE ? " (force re-process)" : ""}${ID_FILTER ? `  ids=${[...ID_FILTER].join(",")}` : ""}`);
console.log(`Input:              ${inputDir}`);
console.log(`Output:             ${outputDir}`);
console.log("─".repeat(72));

if (!existsSync(inputDir)) {
  console.error(`ERROR: Input dir does not exist. Run buildPlayerImageManifest.mjs first.`);
  process.exit(1);
}
if (!DRY_RUN && !existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

// ── Quality sidecar load (so a partial run can preserve other entries) ───
// Prefer the src/ copy (canonical, Vite-bundled). Fall back to public/ if
// only that exists (e.g. transition from a pre-refactor pipeline state).
let quality = {};
const existingQualitySrc = existsSync(qualityPathSrc) ? qualityPathSrc
  : existsSync(qualityPathPublic) ? qualityPathPublic
  : null;
if (existingQualitySrc) {
  try {
    quality = JSON.parse(readFileSync(existingQualitySrc, "utf8"));
  } catch (err) {
    console.warn(`WARN: existing quality JSON couldn't be parsed (${err.message}); starting fresh.`);
    quality = {};
  }
}

const files = readdirSync(inputDir).filter(f => f.endsWith(".png"));
console.log(`Found ${files.length} PNGs in input dir.\n`);

let processed = 0;
let skipped = 0;
let rejected = 0;
let failed = 0;
let unprocessedDeleted = 0;
const processedIds = new Set();

for (const file of files) {
  const basePlayerId = file.replace(/\.png$/, "");
  const inputPath = resolvePath(inputDir, file);
  const outputPath = resolvePath(outputDir, file);

  if (ID_FILTER && !ID_FILTER.has(basePlayerId)) continue;

  const override = getProcessingOverride(basePlayerId);
  const mode = override.mode;

  // ── Bypass modes: don't process, ensure no stale processed file ────────
  if (mode === "skipUseOriginal" || mode === "manualBadCutout") {
    if (existsSync(outputPath) && !DRY_RUN) {
      try { unlinkSync(outputPath); unprocessedDeleted += 1; }
      catch (err) { console.warn(`WARN: couldn't delete ${outputPath}: ${err.message}`); }
    }
    quality[basePlayerId] = { quality: mode === "manualBadCutout" ? "manualBadCutout" : "skipUseOriginal", mode };
    console.log(`◌ ${file}: mode=${mode} → resolver will use fallback`);
    continue;
  }

  if (!FORCE && existsSync(outputPath) && quality[basePlayerId]?.quality === "cleanCutout") {
    skipped += 1;
    processedIds.add(basePlayerId);
    continue;
  }

  try {
    const result = await processOne({ inputPath, basePlayerId, mode, override });
    if (!result) { failed += 1; continue; }

    const damage = detectDamage(result.mask, result.W, result.H, DAMAGE);
    const stats = {
      mode,
      pctTrans: +damage.pctTrans.toFixed(2),
      pctFaceTrans: +damage.pctFaceTrans.toFixed(2),
    };

    if (!damage.ok) {
      // REJECT — don't overwrite. Mark as badCutout so the resolver
      // refuses the processed file even if it exists from a prior run.
      console.warn(`✗ ${file}  mode=${mode}  REJECTED (${damage.reason})  ${stats.pctTrans}% trans / ${stats.pctFaceTrans}% face`);
      quality[basePlayerId] = { quality: "badCutout", reason: damage.reason, ...stats };
      rejected += 1;
      continue;
    }

    const lowCoverage = stats.pctTrans < LOW_COVERAGE_PCT;
    const tag = lowCoverage ? "⚠" : "✓";
    const note = lowCoverage ? `  (low coverage < ${LOW_COVERAGE_PCT}% — bg may still show)` : "";
    const line = `${tag} ${file}  mode=${mode}  ${stats.pctTrans}% trans / ${stats.pctFaceTrans}% face  bg=rgb(${result.avgR},${result.avgG},${result.avgB})${note}`;
    if (lowCoverage) console.warn(line); else console.log(line);

    if (DRY_RUN) {
      processed += 1;
      processedIds.add(basePlayerId);
      continue;
    }

    // Apply optional 1-pixel morphological feather (NOT gaussian blur).
    let alphaBuffer = result.mask;
    if (FEATHER > 0) alphaBuffer = featherMask(result.mask, result.W, result.H, FEATHER);

    // Composite alpha into RGBA buffer and write.
    const out = Buffer.from(result.data);
    for (let i = 0; i < result.totalPixels; i++) {
      out[i * 4 + 3] = alphaBuffer[i];
    }
    await sharp(out, { raw: { width: result.W, height: result.H, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(outputPath);

    quality[basePlayerId] = { quality: "cleanCutout", ...stats };
    processed += 1;
    processedIds.add(basePlayerId);
  } catch (err) {
    console.log(`✗ ${file}: ${err.message}`);
    failed += 1;
  }
}

// ── Write quality sidecar (canonical to src/, mirror to public/) ────────
if (!DRY_RUN) {
  const sortedKeys = Object.keys(quality).sort((a, b) => Number(a) - Number(b));
  const sorted = Object.fromEntries(sortedKeys.map(k => [k, quality[k]]));
  const json = JSON.stringify(sorted, null, 2) + "\n";
  writeFileSync(qualityPathSrc, json, "utf8");
  writeFileSync(qualityPathPublic, json, "utf8");
  console.log(`Wrote quality sidecar:\n  ${qualityPathSrc}\n  ${qualityPathPublic}`);
}

console.log("\n" + "─".repeat(60));
console.log(`Processed: ${processed}, skipped (clean cache): ${skipped}, REJECTED (damaged): ${rejected}, failed: ${failed}, fallback-cleared: ${unprocessedDeleted}`);

// ── Manifest sync (unchanged from original logic) ────────────────────────
if (DRY_RUN) {
  console.log("[DRY RUN] Manifest not updated.");
  process.exit(0);
}
if (SKIP_MANIFEST) {
  console.log("[--skip-manifest] Manifest not updated.");
  process.exit(0);
}
if (processedIds.size === 0) {
  console.log("No images to flag in manifest.");
  process.exit(0);
}

let manifestSrc;
try {
  manifestSrc = readFileSync(manifestPath, "utf8");
} catch (err) {
  console.error(`ERROR: Couldn't read manifest at ${manifestPath}: ${err.message}`);
  process.exit(1);
}

let manifestChanged = 0;
const newSrc = manifestSrc.replace(
  /("(\d+)"):\s*\{([^}]*)\}/g,
  (full, keyPart, id, inside) => {
    if (!processedIds.has(id)) return full;
    if (/processed:\s*true/.test(inside)) return full;
    manifestChanged += 1;
    const trimmed = inside.trim().replace(/,\s*$/, "");
    return `${keyPart}: { ${trimmed}, processed: true }`;
  }
);

if (newSrc !== manifestSrc) {
  writeFileSync(manifestPath, newSrc, "utf8");
  console.log(`Wrote manifest: flagged ${manifestChanged} entries with processed: true`);
} else {
  console.log("Manifest already in sync.");
}

// ─────────────────────────────────────────────────────────────────────────
// Algorithm dispatch
// ─────────────────────────────────────────────────────────────────────────

/**
 * Process one image according to mode. Returns:
 *   { mask, data, W, H, totalPixels, avgR, avgG, avgB }  on success
 *   null                                                  on dispatch failure
 *
 * Each mode implements the "is this pixel a bg-candidate" predicate; the
 * outer flood-fill from edges is shared.
 */
async function processOne({ inputPath, basePlayerId, mode, override }) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 4) {
    console.log(`✗ ${basePlayerId}: unexpected channel count ${info.channels}`);
    return null;
  }

  const W = info.width;
  const H = info.height;
  const totalPixels = W * H;
  const isCand = new Uint8Array(totalPixels);

  // Build per-pixel candidate map by mode.
  let inset = 1;
  if (mode === "whiteStudio") {
    const t = override.preserveJersey ? TUNE.whiteStudioPreserve : TUNE.whiteStudio;
    inset = t.inset;
    fillWhiteCandidates(data, isCand, totalPixels, t);
  } else if (mode === "grayStudio") {
    const t = TUNE.grayStudio;
    inset = t.inset;
    fillGrayCandidates(data, isCand, totalPixels, t);
  } else if (mode === "darkStudio") {
    const t = TUNE.darkStudio;
    inset = t.inset;
    fillDarkCandidates(data, isCand, totalPixels, t.sat, t.brightMax);
  } else {
    console.log(`✗ ${basePlayerId}: unknown mode "${mode}"`);
    return null;
  }

  // Shared flood-fill from edge inset.
  const isBackground = floodFillFromEdges(isCand, W, H, inset);

  // Build mask + bg-color stats.
  const mask = Buffer.alloc(totalPixels);
  let bgPixels = 0;
  let bgR = 0, bgG = 0, bgB = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (isBackground[i]) {
      mask[i] = 0;
      bgPixels += 1;
      const off = i * 4;
      bgR += data[off];
      bgG += data[off + 1];
      bgB += data[off + 2];
    } else {
      mask[i] = 255;
    }
  }
  const avgR = bgPixels === 0 ? 0 : Math.round(bgR / bgPixels);
  const avgG = bgPixels === 0 ? 0 : Math.round(bgG / bgPixels);
  const avgB = bgPixels === 0 ? 0 : Math.round(bgB / bgPixels);

  return { mask, data, W, H, totalPixels, avgR, avgG, avgB };
}

// whiteStudio: TWO-rule predicate matching the pre-751f524 baseline.
//   Rule 1 — RGB-all: r >= rgbAll AND g >= rgbAll AND b >= rgbAll
//                     (fires on near-white pure pixels even if sat is
//                     a touch high due to JPEG noise)
//   Rule 2 — Bright+sat: max(r,g,b) >= bright AND sat < satCap
//                     (catches off-white / light grey at slightly lower
//                     channel values where rgbAll wouldn't fire)
// Either rule alone is enough to mark the pixel as a candidate.
//
// preserveJersey raises both the rgbAll floor and the bright/sat caps,
// so near-white jerseys (Argentina light blue, Mbappé France kit) stay
// opaque while pure-bright bg still goes.
function fillWhiteCandidates(data, isCand, totalPixels, t) {
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    const a = data[off + 3];
    if (a === 0) { isCand[i] = 1; continue; }
    const r = data[off], g = data[off + 1], b = data[off + 2];
    if (r >= t.rgbAll && g >= t.rgbAll && b >= t.rgbAll) { isCand[i] = 1; continue; }
    const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (max < t.bright) continue;
    const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const sat = max === 0 ? 0 : ((max - min) / max) * 100;
    if (sat < t.sat) isCand[i] = 1;
  }
}

// grayStudio: Martinez-fix. brightness > floor + sat < cap, with a
// "neutral channels" arm to catch mid-grey backdrops at lower brightness
// where R≈G≈B but the brightness OR check would miss them.
function fillGrayCandidates(data, isCand, totalPixels, t) {
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    const a = data[off + 3];
    if (a === 0) { isCand[i] = 1; continue; }
    const r = data[off], g = data[off + 1], b = data[off + 2];
    const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const sat = max === 0 ? 0 : ((max - min) / max) * 100;
    if (sat >= t.sat) continue;
    const bright = max;
    const neutralChannels =
      bright >= t.neutralMinBright &&
      Math.abs(r - g) < t.neutralEps &&
      Math.abs(g - b) < t.neutralEps;
    if (bright > t.bright || neutralChannels) isCand[i] = 1;
  }
}

// darkStudio: bright < BRIGHT_MAX AND sat < SAT. For shots where the bg
// is darker than the subject. Edge-connectedness (in floodFillFromEdges)
// means dark interior pixels (hair, beard, dark clothing inside the
// silhouette) are NOT removed unless reachable from the border through
// a continuous dark region.
function fillDarkCandidates(data, isCand, totalPixels, satCap, brightMax) {
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    const a = data[off + 3];
    if (a === 0) { isCand[i] = 1; continue; }
    const r = data[off], g = data[off + 1], b = data[off + 2];
    const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const sat = max === 0 ? 0 : ((max - min) / max) * 100;
    if (sat < satCap && max < brightMax) isCand[i] = 1;
  }
}

// 4-connected flood-fill from a configurable inset border. Pixels are
// marked background only when both (a) candidate AND (b) reachable from
// the edge through a continuous candidate region.
function floodFillFromEdges(isCand, W, H, insetDepth) {
  const isBackground = new Uint8Array(W * H);
  const stack = [];
  const seed = (x, y) => {
    const idx = y * W + x;
    if (isCand[idx] && !isBackground[idx]) {
      isBackground[idx] = 1;
      stack.push(idx);
    }
  };

  const inset = Math.min(Math.max(1, insetDepth), Math.floor(Math.min(W, H) / 2));
  for (let dy = 0; dy < inset; dy++) {
    for (let x = 0; x < W; x++) {
      seed(x, dy);
      seed(x, H - 1 - dy);
    }
  }
  for (let dx = 0; dx < inset; dx++) {
    for (let y = 0; y < H; y++) {
      seed(dx, y);
      seed(W - 1 - dx, y);
    }
  }

  while (stack.length > 0) {
    const idx = stack.pop();
    const x = idx % W;
    const y = (idx - x) / W;
    if (x > 0)     { const n = idx - 1; if (isCand[n] && !isBackground[n]) { isBackground[n] = 1; stack.push(n); } }
    if (x < W - 1) { const n = idx + 1; if (isCand[n] && !isBackground[n]) { isBackground[n] = 1; stack.push(n); } }
    if (y > 0)     { const n = idx - W; if (isCand[n] && !isBackground[n]) { isBackground[n] = 1; stack.push(n); } }
    if (y < H - 1) { const n = idx + W; if (isCand[n] && !isBackground[n]) { isBackground[n] = 1; stack.push(n); } }
  }
  return isBackground;
}

// 1-pixel morphological feather. Each pass converts every fully-opaque
// pixel that has at least one fully-transparent 4-neighbour into a
// mid-alpha (128) edge pixel. NOT gaussian blur (gaussian on raw
// single-channel buffers in sharp 0.34 produces horizontal stripes).
function featherMask(mask, W, H, passes) {
  let out = Buffer.from(mask);
  for (let pass = 0; pass < passes; pass++) {
    const next = Buffer.from(out);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (out[idx] !== 255) continue;
        let touchesBg = false;
        if (x > 0          && out[idx - 1] === 0) touchesBg = true;
        else if (x < W - 1 && out[idx + 1] === 0) touchesBg = true;
        else if (y > 0     && out[idx - W] === 0) touchesBg = true;
        else if (y < H - 1 && out[idx + W] === 0) touchesBg = true;
        if (touchesBg) next[idx] = 128;
      }
    }
    out = next;
  }
  return out;
}

/**
 * Damage detector. Returns { ok, reason, pctTrans, pctFaceTrans }.
 *
 * Rejection criteria:
 *   - pctTrans > maxTransPct          → "too-transparent" (whole subject eaten)
 *   - face zone pctTrans > maxFacePct → "face-eaten" (center of image gone)
 */
function detectDamage(mask, W, H, opts) {
  const total = W * H;
  let trans = 0;
  for (let i = 0; i < total; i++) if (mask[i] === 0) trans += 1;
  const pctTrans = (trans / total) * 100;

  // Center 40% rectangle of the image — rough approximation of where
  // the face/upper-body sits. If too much of this is transparent the
  // subject has been eaten.
  const cx0 = Math.floor(W * 0.3), cx1 = Math.floor(W * 0.7);
  const cy0 = Math.floor(H * 0.3), cy1 = Math.floor(H * 0.7);
  let faceTrans = 0, faceTotal = 0;
  for (let y = cy0; y < cy1; y++) {
    for (let x = cx0; x < cx1; x++) {
      faceTotal += 1;
      if (mask[y * W + x] === 0) faceTrans += 1;
    }
  }
  const pctFaceTrans = faceTotal === 0 ? 0 : (faceTrans / faceTotal) * 100;

  if (pctTrans > opts.maxTransPct) {
    return { ok: false, reason: "too-transparent", pctTrans, pctFaceTrans };
  }
  if (pctFaceTrans > opts.maxFacePct) {
    return { ok: false, reason: "face-eaten", pctTrans, pctFaceTrans };
  }
  return { ok: true, pctTrans, pctFaceTrans };
}
