import fs from "fs";
import path from "path";

const SEASONS = [
  { urlSeason: "2022-23", folderSeason: "2022-2023" },
  { urlSeason: "2023-24", folderSeason: "2023-2024" },
  { urlSeason: "2024-25", folderSeason: "2024-2025" },
];

// where we store downloaded merged_gw.csv
const outRoot = path.join(process.cwd(), "src/data/football/raw/epl_fpl");

async function downloadText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

async function main() {
  console.log(`[fetchEplFplMergedGw] outRoot=${outRoot}`);
  fs.mkdirSync(outRoot, { recursive: true });

  for (const s of SEASONS) {
    const url = `https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/${s.urlSeason}/gws/merged_gw.csv`;
    const seasonDir = path.join(outRoot, s.folderSeason);
    fs.mkdirSync(seasonDir, { recursive: true });

    console.log(`[fetchEplFplMergedGw] downloading ${s.urlSeason} -> ${seasonDir}/merged_gw.csv`);
    const csv = await downloadText(url);

    const outPath = path.join(seasonDir, "merged_gw.csv");
    fs.writeFileSync(outPath, csv, "utf8");

    const bytes = Buffer.byteLength(csv, "utf8");
    console.log(`[fetchEplFplMergedGw] saved ${outPath} (${bytes.toLocaleString()} bytes)`);
  }

  console.log("[fetchEplFplMergedGw] DONE");
}

main().catch((e) => {
  console.error("[fetchEplFplMergedGw] ERROR", e);
  process.exit(1);
});
