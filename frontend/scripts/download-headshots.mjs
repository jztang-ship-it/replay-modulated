// frontend/scripts/download-headshots.mjs
import fs from "fs";
import path from "path";

const PLAYERS_JSON = path.resolve("public/data/players.json");
const OUT_DIR = path.resolve("public/headshots");

// Try multiple sizes + extensions
const VARIANTS = [
  { size: "250x250", ext: "png" },
  { size: "250x250", ext: "jpg" },
  { size: "110x140", ext: "png" },
  { size: "110x140", ext: "jpg" },
  { size: "120x120", ext: "png" },
  { size: "120x120", ext: "jpg" },
];

// Some deployments use different “league folders” over time.
// We’ll try a few. (If a folder doesn’t exist, it’ll just fail and move on.)
const LEAGUE_DIRS = ["premierleague", "premierleague23", "premierleague24", "premierleague25"];

function urlsFor(photoCode) {
  const raw = String(photoCode ?? "").trim();
  if (!raw) return [];

  const codeNoP = raw.replace(/^p/i, "");
  const pcode = `p${codeNoP}`;

  const urls = [];
  for (const league of LEAGUE_DIRS) {
    for (const v of VARIANTS) {
      urls.push(`https://resources.premierleague.com/${league}/photos/players/${v.size}/${pcode}.${v.ext}`);
    }
  }
  return urls;
}

async function exists(fp) {
  try {
    await fs.promises.access(fp, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function outPathsFor(code) {
  const c = String(code).trim();
  return {
    png: path.join(OUT_DIR, `${c}.png`),
    jpg: path.join(OUT_DIR, `${c}.jpg`),
  };
}

async function downloadTo(url, outPath) {
  // Browser-ish headers to avoid 403
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      Referer: "https://www.premierleague.com/",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(outPath, buf);

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  return ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : "png";
}

async function main() {
  if (!fs.existsSync(PLAYERS_JSON)) {
    console.error("players.json not found:", PLAYERS_JSON);
    process.exit(1);
  }
  await fs.promises.mkdir(OUT_DIR, { recursive: true });

  const players = JSON.parse(await fs.promises.readFile(PLAYERS_JSON, "utf-8"));

  // Unique codes only
  const codes = Array.from(
    new Set(players.map((p) => p.photoCode).filter(Boolean).map((x) => String(x).trim()))
  );

  console.log("Players:", players.length);
  console.log("Unique photoCodes:", codes.length);
  console.log("Output dir:", OUT_DIR);

  const failed = [];

  const CONCURRENCY = 10;
  let i = 0;

  async function worker() {
    while (i < codes.length) {
      const idx = i++;
      const code = codes[idx];

      const outs = outPathsFor(code);
      if ((await exists(outs.png)) || (await exists(outs.jpg))) {
        process.stdout.write(".");
        continue;
      }

      const urls = urlsFor(code);
      let ok = false;

      for (const url of urls) {
        try {
          // write temp then rename to correct ext
          const tmp = path.join(OUT_DIR, `${code}.tmp`);
          const kind = await downloadTo(url, tmp);

          const finalPath = kind === "jpg" ? outs.jpg : outs.png;
          await fs.promises.rename(tmp, finalPath);

          process.stdout.write(".");
          ok = true;
          break;
        } catch (e) {
          // try next url
        }
      }

      if (!ok) {
        failed.push({ code, tried: urls.slice(0, 6), note: "All variants failed (likely 403/404)" });
        process.stdout.write("x");
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log("\nDone.");
  console.log("Failed downloads:", failed.length);

  const failedPath = path.resolve("public/headshots/failed-headshots.json");
  await fs.promises.writeFile(failedPath, JSON.stringify(failed, null, 2), "utf-8");
  console.log("Wrote:", failedPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
