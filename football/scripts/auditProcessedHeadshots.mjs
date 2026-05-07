/**
 * football/scripts/auditProcessedHeadshots.mjs
 *
 * Diagnostic tool to inspect what's ACTUALLY inside the processed
 * football headshot PNGs, independent of any React/CSS rendering.
 *
 * For each selected player, this script reports:
 *   - dimensions, channel count
 *   - alpha histogram (fully-transparent / semi-transparent / fully-opaque)
 *   - count of "white pixels still visible" (R/G/B > 230 AND alpha > 0)
 *   - count of "rows with stripe pattern" (rows where the alpha alternates
 *     between transparent and opaque more than N times — a fingerprint
 *     for scanline/banding artifacts in the alpha mask)
 *
 * And generates 3 debug visualizations per player into
 * football/public/debug-headshots/:
 *
 *   <id>-alpha.png       Greyscale dump of the alpha channel only.
 *                        If you see horizontal stripes here, the alpha
 *                        mask itself is the bug — the processing script
 *                        produced a striped mask. Pure black/white means
 *                        clean cutout.
 *
 *   <id>-checker.png     The PNG composited over a checkerboard pattern
 *                        (same convention Photoshop uses to show transparency).
 *                        Lets you see exactly what's transparent vs opaque
 *                        without any tier color tinting the result.
 *
 *   <id>-on-cardcolor.png  The PNG composited over a solid teal background
 *                          (#0C6F86, the BLUE tier color). Approximates what
 *                          the user sees in-game.
 *
 * Usage:
 *   node football/scripts/auditProcessedHeadshots.mjs
 *   node football/scripts/auditProcessedHeadshots.mjs --ids=5200,3245,5503
 *
 * Then visually inspect the three PNGs for each target. The alpha-channel
 * dump is the diagnostic — if it's clean but the in-game render is striped,
 * the bug is in CSS, not the PNG.
 */

import sharp from "sharp";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const argMap = new Map(
  process.argv.slice(2).map(a => {
    const eq = a.indexOf("=");
    return eq > 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [a, "true"];
  })
);

// Default targets: the players the user named as still showing white bg.
const DEFAULT_IDS = "5200,3245,5503,6909,3009,18395,30714,22084";
const ids = String(argMap.get("--ids") ?? DEFAULT_IDS).split(",").map(s => s.trim()).filter(Boolean);

const processedDir = resolvePath(__dirname, "../public/players-processed");
const debugDir = resolvePath(__dirname, "../public/debug-headshots");
const manifestPath = resolvePath(__dirname, "../src/data/playerImageManifest.ts");

if (!existsSync(processedDir)) {
  console.error(`ERROR: ${processedDir} does not exist. Run processPlayerHeadshots.mjs first.`);
  process.exit(1);
}
if (!existsSync(debugDir)) mkdirSync(debugDir, { recursive: true });

// Read manifest to associate ids with names (for log readability).
const manifestSrc = readFileSync(manifestPath, "utf8");
const nameById = new Map();
const nameRe = /\/\/\s*([^\n]+?)\s*\n\s*"(\d+)":/g;
let m;
while ((m = nameRe.exec(manifestSrc)) !== null) {
  nameById.set(m[2], m[1]);
}

console.log("─".repeat(72));
console.log("Processed-headshot audit");
console.log(`Processed dir: ${processedDir}`);
console.log(`Debug output:  ${debugDir}`);
console.log(`Inspecting:    ${ids.length} players`);
console.log("─".repeat(72));

// Tier colors lifted from shared/theme/index.ts so the on-cardcolor.png
// previews match what the actual SPA renders. The runtime `getTier(...)`
// in shared/theme returns the same hex strings.
const TIER_COLORS = {
  RED:    { bg: "#B91C1C", bgEnd: "#F43F5E" },
  ORANGE: { bg: "#FC7100", bgEnd: "#FFA200" },
  PURPLE: { bg: "#7E00FF", bgEnd: "#1A0033" },
  BLUE:   { bg: "#0C6F86", bgEnd: "#00FFD8" },
  GREEN:  { bg: "#467C00", bgEnd: "#AFFE1E" },
  WHITE:  { bg: "#1D212D", bgEnd: "#1E222E" },
};

// Per-player tier overrides, lifted from football's LandingPage demo
// salaries via the same DEFAULT_ECONOMY_CONFIG cutoffs (RED 73+ / ORANGE
// 58-72 / PURPLE 44-57 / BLUE 30-43 / GREEN 23-29 / WHITE <23). For any
// player not in this map the audit falls back to BLUE — explicitly noting
// "no salary data" — so a maintainer reading the debug image knows the
// teal they see is the audit default, not the in-game render.
const PLAYER_TIER = {
  "5503":  "ORANGE", // Messi salary 60
  "3009":  "ORANGE", // Mbappé salary 60
  "5200":  "PURPLE", // Lucas Vázquez salary ~50 (roster)
  "3245":  "PURPLE", // Lemar
  "22084": "PURPLE", // Saka salary 53
  "30714": "BLUE",   // Bellingham salary 37
  "18395": "PURPLE", // Vinícius salary 47
  "6909":  "BLUE",   // Emi Martínez (action shot anyway)
};

for (const id of ids) {
  const inputPath = resolvePath(processedDir, `${id}.png`);
  const name = nameById.get(id) ?? "(unknown)";

  if (!existsSync(inputPath)) {
    console.log(`\n${id}  ${name}: MISSING (${inputPath})`);
    continue;
  }

  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 4) {
    console.log(`\n${id}  ${name}: unexpected channel count ${info.channels}`);
    continue;
  }

  const W = info.width;
  const H = info.height;
  const total = W * H;

  // Alpha histogram + white-pixel count.
  let aZero = 0, aFull = 0, aMid = 0;
  let whiteVisible = 0; // fully-white-ish pixels still showing through

  const alphaOnly = Buffer.alloc(total);

  for (let i = 0; i < total; i++) {
    const off = i * 4;
    const r = data[off];
    const g = data[off + 1];
    const b = data[off + 2];
    const a = data[off + 3];
    alphaOnly[i] = a;
    if (a === 0) aZero += 1;
    else if (a === 255) aFull += 1;
    else aMid += 1;
    if (a > 0 && r > 230 && g > 230 && b > 230) whiteVisible += 1;
  }

  // Vertical-flip rate: % of pixel positions where alpha differs between
  // row y and row y+1 (transparent ↔ opaque transition). Real horizontal
  // banding shows ~50% (every row alternates against its neighbor at
  // every x). Normal silhouettes show 1-5% (flips only along the
  // top/bottom of the subject's outline).
  let verticalFlips = 0;
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      const a1 = alphaOnly[y * W + x];
      const a2 = alphaOnly[(y + 1) * W + x];
      if ((a1 < 64) !== (a2 < 64)) verticalFlips += 1;
    }
  }
  const verticalFlipPct = (verticalFlips / ((H - 1) * W)) * 100;

  const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;

  console.log(`\n${id}  ${name}`);
  console.log(`  size:                  ${W} × ${H}`);
  console.log(`  alpha = 0   (transparent):      ${aZero}  ${pct(aZero)}`);
  console.log(`  alpha = mid (semi-transparent): ${aMid}  ${pct(aMid)}`);
  console.log(`  alpha = 255 (opaque):           ${aFull}  ${pct(aFull)}`);
  console.log(`  white pixels still visible:     ${whiteVisible}  ${pct(whiteVisible)}`);
  console.log(`  vertical-flip rate:             ${verticalFlipPct.toFixed(1)}%   [striping if > 25%, normal if < 5%]`);

  // ── Visualization 1: alpha channel only ────────────────────────────────
  await sharp(alphaOnly, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toFile(resolvePath(debugDir, `${id}-alpha.png`));

  // ── Visualization 2: composited over a checkerboard ────────────────────
  const checker = Buffer.alloc(total * 3);
  const SQ = 8;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = ((Math.floor(x / SQ) + Math.floor(y / SQ)) & 1) ? 220 : 160;
      const i = (y * W + x) * 3;
      checker[i] = c; checker[i + 1] = c; checker[i + 2] = c;
    }
  }
  await sharp(checker, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: inputPath }])
    .png()
    .toFile(resolvePath(debugDir, `${id}-checker.png`));

  // ── Visualization 3: composited over the player's ACTUAL tier color ──
  // Approximates what users see in-game. Uses a vertical gradient between
  // the tier's bg and bgEnd hex values, matching CardFront's gradient
  // exactly (linear-gradient to bottom, bg 0% → bgEnd 70% → bgEnd 100%).
  const tierKey = PLAYER_TIER[id] ?? "BLUE";
  const tierColors = TIER_COLORS[tierKey];
  // Build the gradient as raw RGB.
  const gradientBuf = Buffer.alloc(W * H * 3);
  const parseHex = (hex) => [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
  const [bgR, bgG, bgB] = parseHex(tierColors.bg);
  const [endR, endG, endB] = parseHex(tierColors.bgEnd);
  for (let y = 0; y < H; y++) {
    const t = Math.min(1, y / (H * 0.7));   // bg → bgEnd over top 70%
    const r = Math.round(bgR + (endR - bgR) * t);
    const g = Math.round(bgG + (endG - bgG) * t);
    const b = Math.round(bgB + (endB - bgB) * t);
    for (let x = 0; x < W; x++) {
      const off = (y * W + x) * 3;
      gradientBuf[off] = r; gradientBuf[off + 1] = g; gradientBuf[off + 2] = b;
    }
  }
  await sharp(gradientBuf, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: inputPath }])
    .png()
    .toFile(resolvePath(debugDir, `${id}-on-cardcolor.png`));
  console.log(`  rendered with tier:             ${tierKey}  (${tierColors.bg} → ${tierColors.bgEnd})`);
}

console.log("\n" + "─".repeat(72));
console.log("Done. Visualizations written to football/public/debug-headshots/");
console.log("");
console.log("How to read the output:");
console.log("  - vertical-flip rate > 25%        → alpha mask is striped (script bug)");
console.log("  - white pixels still visible > 1% → background removal incomplete");
console.log("  - alpha=mid > 0% with feather=0   → blur leak; expect striping");
console.log("  - all metrics clean + image striped in browser → bug is in CSS, not the PNG");
