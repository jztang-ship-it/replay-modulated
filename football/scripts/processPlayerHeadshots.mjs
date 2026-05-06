/**
 * football/scripts/processPlayerHeadshots.mjs
 *
 * Removes white/near-white backgrounds from API-Football headshots so the
 * card's tier color shows through instead of a hard white rectangle.
 *
 * Reads:  football/public/players/<basePlayerId>.png       (originals)
 * Writes: football/public/players-processed/<basePlayerId>.png  (alpha-cut)
 *
 * Background detection (per pixel):
 *   A pixel is treated as background if EITHER:
 *     1. R > RGB_THRESHOLD AND G > RGB_THRESHOLD AND B > RGB_THRESHOLD
 *        (catches pure white and very near-white)
 *     2. brightness > BRIGHT_THRESHOLD AND saturation < SAT_THRESHOLD
 *        (catches off-white / light-grey studio backgrounds that the
 *        first check misses, while preserving colorful skin/fabric pixels)
 *   Brightness here is max(R,G,B), saturation is HSV-style:
 *     sat = (max - min) / max * 100   (0–100 scale)
 *
 *   Why both checks: high-RGB alone misses light-grey backgrounds (e.g.
 *   180/180/180 — clearly background but R/G/B not > 225). The brightness
 *   + saturation check covers those without affecting saturated colors
 *   like skin tones (which sit around saturation 30-50) or jersey colors
 *   (saturation 60+).
 *
 * Pipeline per PNG:
 *   1. Load as RGBA via sharp.
 *   2. Build a binary mask: 0 for background pixels, 255 for subject.
 *   3. Light gaussian-blur the mask for soft anti-aliased edges.
 *   4. Write the blurred mask back as the image's alpha channel.
 *   5. Save into football/public/players-processed/.
 *
 * Originals are NEVER overwritten — players/ is the source-of-truth
 * backup, players-processed/ is the alpha-cut output.
 *
 * Usage:
 *   node football/scripts/processPlayerHeadshots.mjs                 # new only
 *   node football/scripts/processPlayerHeadshots.mjs --force         # re-process all
 *   node football/scripts/processPlayerHeadshots.mjs --dry-run       # preview
 *   node football/scripts/processPlayerHeadshots.mjs --rgb=220       # tune RGB cutoff
 *   node football/scripts/processPlayerHeadshots.mjs --bright=220    # tune brightness cutoff
 *   node football/scripts/processPlayerHeadshots.mjs --sat=25        # tune saturation cutoff
 *   node football/scripts/processPlayerHeadshots.mjs --feather=2     # tune edge softness
 *
 * Tuning:
 *   --rgb (default 225)
 *     Pure-white catch. Higher = stricter (only true white). Lower = also
 *     catches light off-whites at the cost of possibly fading bright skin
 *     highlights (foreheads, cheeks under direct light).
 *   --bright (default 220) + --sat (default 25)
 *     Off-white / grey-bg catch. Pixels brighter than --bright AND less
 *     saturated than --sat become transparent. Skin tones sit around
 *     sat 30-50 so are safe. Jersey colors sit higher.
 *     If grey halos remain → drop --bright a bit.
 *     If skin highlights fade → raise --bright.
 *   --feather (default 2)
 *     Gaussian blur radius on the alpha mask. 0 = hard edge (possibly
 *     jagged). 2 = clean anti-aliased edge. 4+ = visibly soft halo.
 *
 * Updates the manifest's `processed: true` flag for each image
 * successfully processed, so the runtime resolver can pick the alpha-cut
 * version. Preserves apiFootballId + local fields untouched.
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

const RGB_THRESHOLD = parseInt(opt("--rgb", opt("--threshold", "225")), 10);
const BRIGHT_THRESHOLD = parseInt(opt("--bright", "220"), 10);
const SAT_THRESHOLD = parseInt(opt("--sat", "25"), 10);
const FEATHER = parseFloat(opt("--feather", "2"));
const FORCE = argMap.has("--force");
const DRY_RUN = argMap.has("--dry-run");
const SKIP_MANIFEST = argMap.has("--skip-manifest");

const inputDir = resolvePath(__dirname, "../public/players");
const outputDir = resolvePath(__dirname, "../public/players-processed");
const manifestPath = resolvePath(__dirname, "../src/data/playerImageManifest.ts");

console.log("─".repeat(60));
console.log(`RGB threshold:    R/G/B all > ${RGB_THRESHOLD} → transparent`);
console.log(`Bright+Sat:       brightness > ${BRIGHT_THRESHOLD} AND saturation < ${SAT_THRESHOLD} → transparent`);
console.log(`Feather:          ${FEATHER}px gaussian blur on alpha mask`);
console.log(`Mode:             ${DRY_RUN ? "DRY RUN" : "WRITE"}${FORCE ? " (force re-process)" : ""}`);
console.log(`Input:            ${inputDir}`);
console.log(`Output:           ${outputDir}`);
console.log("─".repeat(60));

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

  if (!FORCE && existsSync(outputPath)) {
    skipped += 1;
    processedIds.add(basePlayerId);
    continue;
  }

  process.stdout.write(`  ${file} → `);

  try {
    // Step 1: load original as RGBA.
    const { data, info } = await sharp(inputPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels !== 4) {
      console.log(`✗ unexpected channel count ${info.channels}`);
      failed += 1;
      continue;
    }

    const totalPixels = info.width * info.height;

    // Step 2: build a binary alpha mask. 0 = background pixel (becomes
    // transparent), 255 = subject pixel (stays opaque).
    //
    // Two-rule background detection — see file header for the rationale.
    const mask = Buffer.alloc(totalPixels);
    let bgPixels = 0;
    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      // Respect any pre-existing alpha — don't make transparent pixels opaque.
      const a = data[offset + 3];

      // Rule 1: high R/G/B (pure-white catch).
      const ruleRgb = r >= RGB_THRESHOLD && g >= RGB_THRESHOLD && b >= RGB_THRESHOLD;

      // Rule 2: bright AND low-saturation (off-white / light-grey catch).
      // brightness = max channel; saturation = (max - min) / max * 100.
      let ruleBrightSat = false;
      if (!ruleRgb) {
        const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
        if (max >= BRIGHT_THRESHOLD) {
          const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
          const sat = max === 0 ? 0 : ((max - min) / max) * 100;
          ruleBrightSat = sat < SAT_THRESHOLD;
        }
      }

      const isBackground = ruleRgb || ruleBrightSat || a === 0;
      mask[i] = isBackground ? 0 : 255;
      if (isBackground) bgPixels += 1;
    }
    const bgPct = ((bgPixels / totalPixels) * 100).toFixed(1);

    if (DRY_RUN) {
      console.log(`would convert ${bgPct}% of pixels to transparent`);
      continue;
    }

    // Step 3: feather the mask via a gaussian blur. This smooths the
    // silhouette so the cutout doesn't have a jaggy aliased edge.
    let alphaBuffer;
    if (FEATHER > 0) {
      alphaBuffer = await sharp(mask, {
        raw: { width: info.width, height: info.height, channels: 1 },
      })
        .blur(FEATHER)
        .raw()
        .toBuffer();
    } else {
      alphaBuffer = mask;
    }

    // Step 4: write the (possibly-blurred) mask back as the image's alpha
    // channel. Walk the RGBA buffer and replace each alpha byte with the
    // corresponding mask value.
    for (let i = 0; i < totalPixels; i++) {
      data[i * 4 + 3] = alphaBuffer[i];
    }

    // Step 5: re-encode to PNG.
    await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png({ compressionLevel: 9 })
      .toFile(outputPath);

    console.log(`✓ ${bgPct}% transparent`);
    processed += 1;
    processedIds.add(basePlayerId);
  } catch (err) {
    console.log(`✗ ${err.message}`);
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
