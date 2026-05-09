/**
 * previewLegendOverrides.mjs
 *
 * Generates a static HTML page comparing each candidate's current
 * Supabase headshot (the NBA-CDN "latest" photo, often post-career)
 * with the Wikipedia thumbnail we'd swap in.
 *
 * Picks the top-N highest-avgFP players whose primary career falls
 * pre-2010 (so the NBA-CDN photo is most likely a post-career shot).
 *
 * NOTHING is overwritten. Output is just an HTML file you can open
 * in the browser, eyeball, then list which IDs to actually override.
 *
 * Output:
 *   /tmp/legend-overrides-preview.html
 *
 * Usage:
 *   SEASONS_DIR=... node scripts/previewLegendOverrides.mjs [--count=30]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = process.env.SEASONS_DIR ?? join(__dirname, '../public/data/seasons');

const args = parseArgs(process.argv.slice(2));
const COUNT = Number(args.count ?? 30);

const SUPABASE_BASE = 'https://hnhrpwwznzokkfagfumb.supabase.co/storage/v1/object/public/headshots/nba';
const UA = 'Mozilla/5.0 (compatible; ReplayMod/1.0)';

function wikiTitle(name) {
  return encodeURIComponent(name.trim().replace(/\s+/g, '_'));
}

async function fetchWikiThumb(name) {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle(name)}`,
      { headers: { 'User-Agent': UA, accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const url = data?.thumbnail?.source;
    if (!url) return null;
    return url.replace(/\/(\d+)px-/, '/600px-');
  } catch {
    return null;
  }
}

function pickCandidates() {
  const seasons = readdirSync(SEASONS_DIR).filter(e => {
    if (e.startsWith('_') || e.startsWith('.')) return false;
    return statSync(join(SEASONS_DIR, e)).isDirectory();
  });
  // Pre-2010 seasons (key like "9697", "0001", ..., "0910"). Treats
  // 19xx seasons (key first-2 chars >= 73) and 00-09 as eligible.
  const isPre2010 = k => {
    const a = Number(k.slice(0, 2));
    return a >= 73 || a <= 9;
  };

  const peakFP = new Map(); // basePlayerId → { name, peakFP }
  for (const k of seasons) {
    if (!isPre2010(k)) continue;
    const players = JSON.parse(readFileSync(join(SEASONS_DIR, k, 'players.json'), 'utf8'));
    for (const p of players) {
      const id = String(p.basePlayerId ?? '').trim();
      const name = String(p.name ?? '').trim();
      const fp = Number(p.avgFP) || 0;
      if (!id || !name) continue;
      const cur = peakFP.get(id);
      if (!cur || fp > cur.peakFP) peakFP.set(id, { name, peakFP: fp });
    }
  }

  return [...peakFP.entries()]
    .map(([id, v]) => ({ id, name: v.name, peakFP: v.peakFP }))
    .sort((a, b) => b.peakFP - a.peakFP)
    .slice(0, COUNT);
}

async function main() {
  const candidates = pickCandidates();
  console.log(`Picking top ${candidates.length} pre-2010 legends by peak avgFP...\n`);

  const rows = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    process.stdout.write(`  [${i + 1}/${candidates.length}] ${c.name}... `);
    const wiki = await fetchWikiThumb(c.name);
    rows.push({ ...c, wiki });
    process.stdout.write(wiki ? '✅\n' : '— no Wikipedia photo\n');
    await new Promise(r => setTimeout(r, 200));
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Legend Headshot Overrides</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 24px; background: #f4f4f4; }
  h1 { margin: 0 0 8px; }
  p { color: #555; max-width: 820px; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 14px; max-width: 820px; }
  .row { display: grid; grid-template-columns: 200px 1fr 1fr; gap: 16px; align-items: center;
         background: white; border-radius: 10px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .name { font-weight: 700; font-size: 14px; }
  .id   { color: #888; font-size: 11px; font-family: ui-monospace, monospace; }
  .fp   { color: #555; font-size: 12px; }
  .col  { text-align: center; }
  .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  img { max-height: 110px; max-width: 100%; border-radius: 6px; border: 1px solid #ddd; background: #f8f8f8; object-fit: contain; }
  .missing { color: #aaa; font-style: italic; font-size: 12px; padding: 32px 0; }
</style></head><body>
<h1>Legend headshot overrides — preview</h1>
<p>For each player, the LEFT column is what's currently in Supabase (NBA CDN's "latest" photo, often post-career).
The RIGHT column is the Wikipedia thumbnail we'd swap in if you approve.
Reply with the IDs you want overridden (or "all good" / "skip") and I'll apply only those.</p>
<div class="grid">
${rows.map(r => `
  <div class="row">
    <div>
      <div class="name">${r.name}</div>
      <div class="id">id ${r.id}</div>
      <div class="fp">peak ${r.peakFP.toFixed(1)} FP</div>
    </div>
    <div class="col">
      <div class="label">current (NBA via Supabase)</div>
      <img src="${SUPABASE_BASE}/${r.id}.png" alt="${r.name} NBA" onerror="this.outerHTML='<div class=missing>(none — initials shown)</div>'">
    </div>
    <div class="col">
      <div class="label">proposed (Wikipedia)</div>
      ${r.wiki
        ? `<img src="${r.wiki}" alt="${r.name} Wiki">`
        : `<div class="missing">(no Wikipedia photo)</div>`}
    </div>
  </div>
`).join('')}
</div>
</body></html>`;

  const out = '/tmp/legend-overrides-preview.html';
  writeFileSync(out, html);
  console.log(`\n✅ Wrote ${out}`);
  console.log(`\nOpen with:  open ${out}`);
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    out[k] = v ?? true;
  }
  return out;
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
