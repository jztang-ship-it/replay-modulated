/**
 * football/scripts/processPlayerHeadshots.mjs
 *
 * Removes white AND neutral-gray studio backgrounds from API-Football
 * headshots so the card's tier color shows through instead of a hard
 * rectangular backdrop.
 *
 * Reads:  football/public/players/<basePlayerId>.png       (originals)
 * Writes: football/public/players-processed/<basePlayerId>.png  (alpha-cut)
 *
 * Algorithm (flood-fill from edges, neutral-aware):
 *
 *   1. Build a per-pixel boolean "is-bg-candidate" map. A pixel is a
 *      background CANDIDATE if it looks like an unsaturated studio tone:
 *
 *        saturation < --sat (default 35, % scale 0-100)
 *        AND (
 *           brightness > --bright (default 120, max(R,G,B) on 0-255)
 *           OR (
 *              brightness >= --neutralMinBright (default 90)
 *              AND |R-G| < --neutralEps (default 18)
 *              AND |G-B| < --neutralEps
 *           )
 *        )
 *
 *      This catches:
 *        - pure white (sat=0, bright=255)
 *        - off-white / cream (sat<5, bright>240)
 *        - light grey (sat<10, bright 200-240)
 *        - MID grey / studio backdrops (sat<10, bright 90-180)
 *          ← THIS is the case the previous detector missed (e.g.
 *          Martinez ID 6909 had a backdrop at rgb≈100,100,102, sat≈2,
 *          bright=102, which was below the old 225 brightness cutoff).
 *
 *      The neutralMinBright floor is what stops the flood-fill from
 *      eating dark facial hair / beards (sat<35, channels nearly
 *      equal, bright 40-80) when those pixels touch the photo border.
 *
 *      Saturation is computed as ((max-min)/max)*100 on 0-100 scale
 *      (HSV "S" * 100). Brightness is max(R,G,B) on 0-255 scale.
 *
 *   2. Flood-fill from the image edges THROUGH bg-candidate pixels.
 *      Seed set: every pixel on the four borders (y=0, y=H-1, x=0,
 *      x=W-1) PLUS every pixel inside a 3-pixel inset border (rows
 *      0..2, H-3..H-1; cols 0..2, W-3..W-1). The inset border seeds
 *      handle JPEG/PNG compression noise that pushes the literal edge
 *      pixel just outside the threshold while a few pixels in are
 *      clearly background.
 *
 *      4-connected flood-fill propagates from those seeds through any
 *      neighbour that is also a bg-candidate. Final result: every pixel
 *      that is BOTH (a) edge-connected AND (b) a bg-candidate.
 *
 *      Bright OR neutral pixels INSIDE the subject (forehead highlight,
 *      grey beard, white teeth, neutral-toned face) are NOT removed —
 *      they aren't reachable from any edge through a continuous run of
 *      bg-candidate pixels because the subject's saturated/coloured
 *      hair/skin/jersey wraps around them.
 *
 *   3. Optional 1-pixel alpha feather on the silhouette boundary using
 *      a hard 3x3 morphological dilation (NOT a gaussian blur — gaussian
 *      blur on a single-channel raw buffer in sharp produces
 *      horizontal-stripe artifacts; we avoid it by default). The feather
 *      converts the alpha edge from a hard 0/255 step into a 1-pixel
 *      mid-alpha ring, removing the jaggy single-pixel staircase. The
 *      interior remains 255 and the bulk-background remains 0.
 *
 *   4. Write the mask as the PNG's alpha channel. Save into
 *      football/public/players-processed/. Originals untouched.
 *
 * Per-image output:
 *   ✓ <input> → <output>  XX.X% transparent / YY.Y% opaque  bg=rgb(...)
 *   ⚠ <input>             low coverage (X.X% < 15%) — bg may still show
 *
 * Usage:
 *   node football/scripts/processPlayerHeadshots.mjs                 # new only
 *   node football/scripts/processPlayerHeadshots.mjs --force         # re-process all
 *   node football/scripts/processPlayerHeadshots.mjs --dry-run       # preview
 *   node football/scripts/processPlayerHeadshots.mjs --ids=6909,5503 # only listed ids
 *   node football/scripts/processPlayerHeadshots.mjs --bright=110    # tune brightness floor
 *   node football/scripts/processPlayerHeadshots.mjs --sat=30        # tune saturation cap
 *   node football/scripts/processPlayerHeadshots.mjs --neutralEps=20 # tune neutrality eps
 *   node football/scripts/processPlayerHeadshots.mjs --feather=0     # disable 1px feather
 *
 * Tuning notes:
 *   --sat (default 35, percent 0-100)
 *     Maximum saturation for a pixel to be considered background. 35%
 *     comfortably covers studio greys (sat ~0-15) and slightly-tinted
 *     studio backdrops, while staying below typical skin (sat 30-50)
 *     and most jersey colors (sat 40+). NOTE: a few light-blue jerseys
 *     (e.g. England kit) can hover around sat 35-40 — flood-fill from
 *     edges is the safety net there: even if a jersey pixel passes the
 *     candidate test, it won't be removed unless edge-connected.
 *   --bright (default 120, on 0-255)
 *     Brightness floor for the "light enough to read as background" arm
 *     of the predicate. The OR with the neutral-channel check means a
 *     dark neutral gray (bright < 120 but R≈G≈B) still qualifies, so
 *     this floor only matters for pixels that are bright AND slightly
 *     more saturated.
 *   --neutralEps (default 18)
 *     Channel-difference cap for the "all channels nearly equal" test.
 *     Catches truly neutral grays at any brightness.
 *   --feather (default 1)
 *     Width in pixels of the 1-px alpha feather ring at the silhouette.
 *     Set to 0 to disable. Implemented as a binary morphology pass, NOT
 *     a gaussian blur (gaussian blur on raw buffers in sharp 0.34
 *     produces visible horizontal stripes).
 *
 * Updates the manifest's `processed: true` flag for each image
 * successfully processed. Preserves apiFootballId + local fields untouched.
 */

import sharp from "sharp";
import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const argMap = new Map(
  process.argv.slice(2).map(a => {
    const eq = a.indexOf("=");
    return eq > 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [a, "true"];
  })
);
const opt = (k, fallback) => argMap.get(k) ?? fallback;

// New tunables: see header docstring for the full rationale.
//
// Predicate: a pixel is a background CANDIDATE if
//   sat < SAT_THRESHOLD AND
//   ( bright >= BRIGHT_THRESHOLD
//     OR ( bright >= NEUTRAL_MIN_BRIGHT
//          AND |R-G| < NEUTRAL_EPS
//          AND |G-B| < NEUTRAL_EPS ) )
//
// SAT scale: 0..100 (HSV-S * 100).  BRIGHT scale: 0..255 (max(R,G,B)).
//
// NEUTRAL_MIN_BRIGHT (default 90) is a floor on the "neutral channels"
// arm. Without it, dark grayscale tones (hair, eyebrows, beards,
// pupils) qualify (sat < 35, channels nearly equal) and — when they
// touch the photo border — get flood-filled into the background.
// Concrete failure mode: Bellingham's beard pixels at brightness
// 40-80 with neutral channels would leak via the white-bg gaps
// between beard strands, leaving black speckles in the cutout.
//
// 90 is below the lightest studio greys we've measured (Martinez
// 6909 sits at brightness 100-119 in the bulk of the backdrop, with
// only 4 outlier pixels in the 80-89 bucket on the top row) and
// safely above typical hair/beard tones (~40-80).
//
// Loosening to ~60 eats facial hair; tightening to ~110 can leave a
// thin halo on darker studio backdrops.
const SAT_THRESHOLD = parseInt(opt("--sat", "35"), 10);
const BRIGHT_THRESHOLD = parseInt(opt("--bright", "120"), 10);
const NEUTRAL_EPS = parseInt(opt("--neutralEps", "18"), 10);
const NEUTRAL_MIN_BRIGHT = parseInt(opt("--neutralMinBright", "90"), 10);
// Inset depth for edge-seeded flood-fill (in pixels). The fill is seeded
// at every pixel within INSET of any image border, not just the literal
// 1-pixel edge — this absorbs JPEG/PNG compression noise that bumps
// border pixels just outside the candidate predicate while pixels a
// few rows in are clearly background.
const INSET = Math.max(1, parseInt(opt("--inset", "3"), 10));
// 1-px alpha feather (NOT gaussian blur — see header docstring).  Set
// to 0 to disable the feather entirely.
const FEATHER = Math.max(0, parseInt(opt("--feather", "1"), 10));
const FORCE = argMap.has("--force");
const DRY_RUN = argMap.has("--dry-run");
const SKIP_MANIFEST = argMap.has("--skip-manifest");
// Optional id filter: --ids=6909,5503,...
const ID_FILTER = (() => {
  const raw = opt("--ids", "");
  if (typeof raw !== "string" || raw === "" || raw === "true") return null;
  return new Set(raw.split(",").map(s => s.trim()).filter(Boolean));
})();
// User-spec warn threshold: warn if transparent < 15% of total pixels.
const LOW_COVERAGE_PCT = 15;

const inputDir = resolvePath(__dirname, "../public/players");
const outputDir = resolvePath(__dirname, "../public/players-processed");
const manifestPath = resolvePath(__dirname, "../src/data/playerImageManifest.ts");

console.log("─".repeat(72));
console.log(`Algorithm:         flood-fill from edges (+${INSET}px inset) through bg-candidate pixels`);
console.log(`Predicate:         sat < ${SAT_THRESHOLD}%`);
console.log(`                   AND ( bright > ${BRIGHT_THRESHOLD}/255  OR  ( bright >= ${NEUTRAL_MIN_BRIGHT}/255 AND |R-G|<${NEUTRAL_EPS} AND |G-B|<${NEUTRAL_EPS} ) )`);
console.log(`Feather:           ${FEATHER === 0 ? "DISABLED (hard 0/255 alpha)" : `${FEATHER}px morphological feather`}`);
console.log(`Low-coverage warn: < ${LOW_COVERAGE_PCT}% transparent → ⚠ flagged`);
console.log(`Mode:              ${DRY_RUN ? "DRY RUN" : "WRITE"}${FORCE ? " (force re-process)" : ""}${ID_FILTER ? `  ids=${[...ID_FILTER].join(",")}` : ""}`);
console.log(`Input:             ${inputDir}`);
console.log(`Output:            ${outputDir}`);
console.log("─".repeat(72));

if (!existsSync(inputDir)) {
  console.error(`ERROR: Input dir does not exist. Run buildPlayerImageManifest.mjs first to download originals.`);
  process.exit(1);
}
if (!DRY_RUN && !existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

const files = readdirSync(inputDir).filter(f => f.endsWith(".png"));
console.log(`Found ${files.length} PNGs in input dir.\n`);

let processed = 0;
let skipped = 0;
let failed = 0;
const processedIds = new Set();

for (const file of files) {
  const basePlayerId = file.replace(/\.png$/, "");
  const inputPath = resolvePath(inputDir, file);
  const outputPath = resolvePath(outputDir, file);

  if (ID_FILTER && !ID_FILTER.has(basePlayerId)) {
    continue;
  }

  if (!FORCE && existsSync(outputPath)) {
    skipped += 1;
    processedIds.add(basePlayerId);
    continue;
  }

  try {
    // Step 1: load original as RGBA.
    const { data, info } = await sharp(inputPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels !== 4) {
      console.log(`✗ ${file}: unexpected channel count ${info.channels}`);
      failed += 1;
      continue;
    }

    const W = info.width;
    const H = info.height;
    const totalPixels = W * H;

    // Step 2: build per-pixel "is bg-candidate" boolean map. Flood-fill
    // in the next step will pick a subset of these — pixels actually
    // connected to the image edge through a continuous bg-candidate
    // region.
    //
    // Predicate (user spec): sat < SAT_THRESHOLD AND
    //   (bright > BRIGHT_THRESHOLD OR (|R-G|<NEUTRAL_EPS && |G-B|<NEUTRAL_EPS))
    //
    // Already-transparent input pixels carry over as candidates.
    const isCand = new Uint8Array(totalPixels);
    // Track running average background color across pixels eventually
    // marked as REAL background (after flood-fill). We compute that
    // sum below in step 4. Here we just walk pixels.
    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];

      if (a === 0) {
        isCand[i] = 1;
        continue;
      }

      const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const sat = max === 0 ? 0 : ((max - min) / max) * 100;
      if (sat >= SAT_THRESHOLD) continue;

      const bright = max;
      const neutralChannels =
        bright >= NEUTRAL_MIN_BRIGHT &&
        Math.abs(r - g) < NEUTRAL_EPS &&
        Math.abs(g - b) < NEUTRAL_EPS;
      if (bright > BRIGHT_THRESHOLD || neutralChannels) {
        isCand[i] = 1;
      }
    }

    // Step 3: flood-fill from the four image edges + a 3-pixel inset
    // border, through bg-candidate pixels. Pixels reachable from the
    // edge region through a continuous bg-candidate path become real
    // background. Saturated/coloured pixels (face, hair, jersey) act
    // as a fence around any interior neutral pixels (eye whites, grey
    // beard, white teeth, neutral skin tones), so those stay opaque.
    //
    // Stack-based 4-connected fill. Uses a typed array for visited so
    // the inner loop is tight.
    const isBackground = new Uint8Array(totalPixels);
    const stack = [];
    let seedCount = 0;

    const seed = (x, y) => {
      const idx = y * W + x;
      if (isCand[idx] && !isBackground[idx]) {
        isBackground[idx] = 1;
        stack.push(idx);
        seedCount += 1;
      }
    };

    // Seed from every pixel within INSET rows of the top/bottom border
    // and INSET columns of the left/right border. Compression noise
    // often pushes the literal edge pixel just outside the predicate
    // while pixels a row or two in are clearly background — seeding
    // the inset captures that.
    const inset = Math.min(INSET, Math.floor(Math.min(W, H) / 2));
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

    // Step 4: build the binary alpha mask AND collect debug stats.
    // 0 = transparent (edge-connected bg), 255 = opaque.
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
    const opaquePixels = totalPixels - bgPixels;
    const bgPct = (bgPixels / totalPixels) * 100;
    const opaquePct = (opaquePixels / totalPixels) * 100;
    const avgR = bgPixels === 0 ? 0 : Math.round(bgR / bgPixels);
    const avgG = bgPixels === 0 ? 0 : Math.round(bgG / bgPixels);
    const avgB = bgPixels === 0 ? 0 : Math.round(bgB / bgPixels);
    const lowCoverage = bgPct < LOW_COVERAGE_PCT;

    // Step 5: optional 1-pixel morphological feather. Convert any
    // OPAQUE pixel that has at least one TRANSPARENT 4-neighbour into
    // a mid-alpha edge pixel (value 128). This produces a 1-pixel
    // anti-aliased ring at the silhouette boundary without any
    // gaussian blur, so it can't introduce horizontal-stripe
    // artifacts. Repeated FEATHER times.
    //
    // Pure binary morphology in Uint8Array — no sharp.blur() call.
    let alphaBuffer = mask;
    if (FEATHER > 0) {
      const out = Buffer.from(mask);
      for (let pass = 0; pass < FEATHER; pass++) {
        // Read from `out`, write to `next`, then copy back.
        const next = Buffer.from(out);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const idx = y * W + x;
            if (out[idx] !== 255) continue; // only soften opaque pixels
            // 4-neighbour: if any neighbour is fully transparent, this
            // pixel is on the silhouette boundary.
            let touchesBg = false;
            if (x > 0     && out[idx - 1] === 0) touchesBg = true;
            else if (x < W - 1 && out[idx + 1] === 0) touchesBg = true;
            else if (y > 0     && out[idx - W] === 0) touchesBg = true;
            else if (y < H - 1 && out[idx + W] === 0) touchesBg = true;
            if (touchesBg) next[idx] = 128;
          }
        }
        out.set(next);
      }
      alphaBuffer = out;
    }

    const verbInput  = `players/${file}`;
    const verbOutput = `players-processed/${file}`;
    const tag = lowCoverage ? "⚠" : "✓";
    const summary = `${bgPct.toFixed(1)}% transparent / ${opaquePct.toFixed(1)}% opaque  bg=rgb(${avgR},${avgG},${avgB})  seeds=${seedCount}`;
    const note = lowCoverage ? "  (low coverage < 15% — bg may still show)" : "";
    const line = `${tag} ${verbInput} → ${verbOutput}  ${summary}${note}`;
    if (lowCoverage) console.warn(line); else console.log(line);

    if (DRY_RUN) {
      continue;
    }

    // Step 6: write the alpha buffer back as the image's alpha channel.
    for (let i = 0; i < totalPixels; i++) {
      data[i * 4 + 3] = alphaBuffer[i];
    }

    // Step 7: re-encode to PNG.
    await sharp(data, {
      raw: { width: W, height: H, channels: 4 },
    })
      .png({ compressionLevel: 9 })
      .toFile(outputPath);

    processed += 1;
    processedIds.add(basePlayerId);
  } catch (err) {
    console.log(`✗ ${file}: ${err.message}`);
    failed += 1;
  }
}

console.log("\n" + "─".repeat(60));
console.log(`Processed: ${processed}, skipped: ${skipped}, failed: ${failed}`);

// ── Manifest sync ──────────────────────────────────────────────────────────
//
// For every image successfully processed, set `processed: true` on the
// matching manifest entry. Preserves the existing apiFootballId + local
// fields untouched. Idempotent — running twice is a no-op.

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

// Walk the manifest's `"<id>": { ... }` entries and rewrite each one whose
// id is in processedIds, adding `processed: true` if it isn't already there.
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
