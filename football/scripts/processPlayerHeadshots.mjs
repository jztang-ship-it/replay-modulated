/**
 * football/scripts/processPlayerHeadshots.mjs
 *
 * Removes white/near-white backgrounds from API-Football headshots so the
 * card's tier color shows through instead of a hard white rectangle.
 *
 * Reads:  football/public/players/<basePlayerId>.png       (originals)
 * Writes: football/public/players-processed/<basePlayerId>.png  (alpha-cut)
 *
 * Algorithm (flood-fill from edges):
 *
 *   1. Build a per-pixel boolean "is-bg-color" map:
 *        true if R/G/B all > --rgb (default 215) — pure & near-white
 *        OR  brightness > --bright (default 210) AND saturation < --sat
 *            (default 45) — off-white / light grey
 *      Where brightness = max(R,G,B) and saturation = (max-min)/max * 100.
 *
 *   2. Flood-fill from all four image edges through bg-color pixels.
 *      Only pixels CONNECTED through the bg-color region to the edge are
 *      flagged as actual background. Bright pixels INSIDE the face or
 *      jersey (forehead highlights, light jersey colors) stay opaque
 *      because they're not connected to the edge through a continuous
 *      bg-color path.
 *
 *      This is a meaningful improvement over the old per-pixel threshold:
 *      a forehead highlight and a studio backdrop can be the same brightness,
 *      but only one is connected to the image border. Flood-fill keeps the
 *      face intact while still removing the entire background.
 *
 *   3. Light gaussian-blur the alpha mask (--feather, default 2px) for a
 *      soft anti-aliased silhouette.
 *
 *   4. Write the mask as the PNG's alpha channel. Save into
 *      football/public/players-processed/. Originals untouched.
 *
 * The flood-fill makes the thresholds safe to loosen — broader background
 * detection no longer eats face pixels, since interior bright spots are
 * never edge-connected.
 *
 * Per-image output:
 *   ✓ <input> → <output>  XX.X% transparent
 *   ⚠ <input>             low coverage (X.X%) — may still show white
 *
 * Usage:
 *   node football/scripts/processPlayerHeadshots.mjs                 # new only
 *   node football/scripts/processPlayerHeadshots.mjs --force         # re-process all
 *   node football/scripts/processPlayerHeadshots.mjs --dry-run       # preview
 *   node football/scripts/processPlayerHeadshots.mjs --rgb=220       # tune RGB cutoff
 *   node football/scripts/processPlayerHeadshots.mjs --bright=205    # tune brightness cutoff
 *   node football/scripts/processPlayerHeadshots.mjs --sat=50        # tune saturation cutoff
 *   node football/scripts/processPlayerHeadshots.mjs --feather=1.5   # tune edge softness
 *
 * Tuning:
 *   --rgb (default 215)
 *     Catches pure white and slight off-white via R/G/B all-above check.
 *     Lower = catches more light tones. Higher = stricter.
 *   --bright (default 225) + --sat (default 20)
 *     Catches off-white / light-grey studio backdrops via brightness +
 *     low-saturation. STRICT defaults: anything brighter than 225 AND
 *     less saturated than 20% — only true studio greys. Catches all
 *     studio-shot backgrounds without flagging colored jerseys (sat
 *     usually 25+) or skin tones (sat 30-50).
 *     If a colored studio backdrop is leaving a halo → override per-run
 *     with --bright=210 --sat=45, but ONLY if the player has no
 *     edge-touching colored content (e.g. a teal/light-blue jersey that
 *     reaches the photo edge will get cut into).
 *     If face looks patchy → raise --bright (225 → 235).
 *   --feather (default 0)
 *     Gaussian blur on the alpha mask. DEFAULT IS 0 because sharp's
 *     blur on a single-channel raw buffer produces horizontal-stripe
 *     artifacts. The source PNG's natural anti-aliasing makes blur
 *     unnecessary in practice. Override only if you specifically want
 *     extra-soft edges and accept the artifact risk.
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

const RGB_THRESHOLD = parseInt(opt("--rgb", opt("--threshold", "215")), 10);
// Default --bright=225 / --sat=20 is INTENTIONALLY STRICT.
//
// Earlier defaults (--bright=210 --sat=45) were too loose: light-blue
// jerseys (e.g. Bellingham's England kit at ~140/200/230 → brightness
// 230, saturation 39%) qualified as background candidates. When such a
// jersey extended to the photo's bottom edge, the edge-seeded flood-fill
// would flood through the jersey, cutting holes into the player.
//
// Saturation 20 cleanly separates studio backdrops (sat ~5-10) from
// jersey/skin (sat 25+). Brightness 225 keeps us catching off-white
// studio greys but not the brighter saturated jersey tones.
//
// If a player's photo has a colored studio backdrop AND no edge-touching
// colored content elsewhere, override per-run with looser values:
//   --bright=210 --sat=45
const BRIGHT_THRESHOLD = parseInt(opt("--bright", "225"), 10);
const SAT_THRESHOLD = parseInt(opt("--sat", "20"), 10);
// Feather DEFAULT IS 0 — see large note below.
//
// Originally we gaussian-blurred the binary alpha mask (0/255) so the
// silhouette would have soft anti-aliased edges. In practice, sharp's
// blur applied to a single-channel raw buffer produced visible
// horizontal-stripe artifacts in the output alpha — confirmed by the
// audit script (auditProcessedHeadshots.mjs).
//
// Why no blur is fine: the source API-Football PNGs already have
// anti-aliased edges (photo-grade alpha boundaries). The pixels at
// the boundary between subject and background sit at intermediate
// RGB values that don't pass the bg-color threshold but are close
// enough to look smooth. The cutout boundary inherits the source
// photo's natural anti-aliasing — no additional blur needed.
//
// Override with --feather=N if you specifically need soft edges (and
// accept the stripe risk for your use case).
const FEATHER = parseFloat(opt("--feather", "0"));
const FORCE = argMap.has("--force");
const DRY_RUN = argMap.has("--dry-run");
const SKIP_MANIFEST = argMap.has("--skip-manifest");
// Warning threshold: any image below this transparency % gets a ⚠ prefix
// in the per-image log so it can be visually inspected.
const LOW_COVERAGE_PCT = 5;

const inputDir = resolvePath(__dirname, "../public/players");
const outputDir = resolvePath(__dirname, "../public/players-processed");
const manifestPath = resolvePath(__dirname, "../src/data/playerImageManifest.ts");

console.log("─".repeat(60));
console.log(`Algorithm:        flood-fill from edges through bg-color pixels`);
console.log(`RGB threshold:    R/G/B all > ${RGB_THRESHOLD} marks pixel as bg-color`);
console.log(`Bright+Sat:       brightness > ${BRIGHT_THRESHOLD} AND saturation < ${SAT_THRESHOLD} marks pixel as bg-color`);
console.log(`Feather:          ${FEATHER}px gaussian blur on alpha mask${FEATHER === 0 ? " (DISABLED — uses source PNG's natural anti-aliasing)" : ""}`);
console.log(`Low-coverage warn: < ${LOW_COVERAGE_PCT}% transparent → ⚠ flagged`);
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

    // Step 2: build per-pixel "is bg-color" boolean map. Flood-fill in the
    // next step will pick a subset of these — pixels actually connected to
    // the image edge through a continuous bg-color region.
    const isBgColor = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];

      // Respect pre-existing transparency — already-transparent stays bg.
      if (a === 0) {
        isBgColor[i] = 1;
        continue;
      }

      // Rule 1: pure-white / very near-white.
      const ruleRgb = r >= RGB_THRESHOLD && g >= RGB_THRESHOLD && b >= RGB_THRESHOLD;
      if (ruleRgb) {
        isBgColor[i] = 1;
        continue;
      }

      // Rule 2: bright + low-saturation (off-white / light grey).
      const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
      if (max >= BRIGHT_THRESHOLD) {
        const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
        const sat = max === 0 ? 0 : ((max - min) / max) * 100;
        if (sat < SAT_THRESHOLD) {
          isBgColor[i] = 1;
        }
      }
    }

    // Step 3: flood-fill from the four image edges through bg-color pixels.
    // Only pixels reachable from an edge through a continuous bg-color path
    // are marked as actual background. Bright pixels INSIDE the face/jersey
    // (forehead highlights, light jersey tones) are not edge-connected and
    // stay opaque.
    //
    // Stack-based 4-connected flood fill (avoids recursion limits on large
    // images). Uses a typed array for the visited set so the inner loop is
    // tight.
    const isBackground = new Uint8Array(totalPixels);
    const stack = [];

    // Seed from top + bottom edges.
    for (let x = 0; x < W; x++) {
      for (const y of [0, H - 1]) {
        const idx = y * W + x;
        if (isBgColor[idx] && !isBackground[idx]) {
          isBackground[idx] = 1;
          stack.push(idx);
        }
      }
    }
    // Seed from left + right edges.
    for (let y = 0; y < H; y++) {
      for (const x of [0, W - 1]) {
        const idx = y * W + x;
        if (isBgColor[idx] && !isBackground[idx]) {
          isBackground[idx] = 1;
          stack.push(idx);
        }
      }
    }

    while (stack.length > 0) {
      const idx = stack.pop();
      const x = idx % W;
      const y = (idx - x) / W;
      // 4 neighbors
      if (x > 0)     { const n = idx - 1; if (isBgColor[n] && !isBackground[n]) { isBackground[n] = 1; stack.push(n); } }
      if (x < W - 1) { const n = idx + 1; if (isBgColor[n] && !isBackground[n]) { isBackground[n] = 1; stack.push(n); } }
      if (y > 0)     { const n = idx - W; if (isBgColor[n] && !isBackground[n]) { isBackground[n] = 1; stack.push(n); } }
      if (y < H - 1) { const n = idx + W; if (isBgColor[n] && !isBackground[n]) { isBackground[n] = 1; stack.push(n); } }
    }

    // Step 4: build the alpha mask. 0 = transparent (edge-connected bg),
    // 255 = opaque (subject + any interior bright spots).
    const mask = Buffer.alloc(totalPixels);
    let bgPixels = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (isBackground[i]) {
        mask[i] = 0;
        bgPixels += 1;
      } else {
        mask[i] = 255;
      }
    }
    const bgPct = ((bgPixels / totalPixels) * 100).toFixed(1);
    const lowCoverage = parseFloat(bgPct) < LOW_COVERAGE_PCT;

    const verbInput  = `players/${file}`;
    const verbOutput = `players-processed/${file}`;
    const tag = lowCoverage ? "⚠" : "✓";
    const note = lowCoverage ? " (low coverage — may still show white)" : "";

    if (DRY_RUN) {
      console.log(`${tag} ${verbInput} → ${verbOutput}  ${bgPct}% transparent${note}`);
      continue;
    }

    // Step 5: feather the mask via a gaussian blur. Smooths the silhouette
    // so the cutout doesn't have a jaggy aliased edge.
    let alphaBuffer;
    if (FEATHER > 0) {
      alphaBuffer = await sharp(mask, {
        raw: { width: W, height: H, channels: 1 },
      })
        .blur(FEATHER)
        .raw()
        .toBuffer();
    } else {
      alphaBuffer = mask;
    }

    // Step 6: write the (possibly-blurred) mask back as the image's alpha
    // channel.
    for (let i = 0; i < totalPixels; i++) {
      data[i * 4 + 3] = alphaBuffer[i];
    }

    // Step 7: re-encode to PNG.
    await sharp(data, {
      raw: { width: W, height: H, channels: 4 },
    })
      .png({ compressionLevel: 9 })
      .toFile(outputPath);

    console.log(`${tag} ${verbInput} → ${verbOutput}  ${bgPct}% transparent${note}`);
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
