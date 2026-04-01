/**
 * uploadHeadshots.mjs
 * Uploads local basketball headshots to Supabase Storage.
 * Run once from basketball/ directory:
 *   node scripts/uploadHeadshots.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEADSHOT_DIR = join(__dirname, '../public/headshots');

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://hnhrpwwznzokkfagfumb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.error('Missing SUPABASE_ANON_KEY env var. Get it from Supabase Dashboard → Settings → API.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BUCKET = 'headshots';
const SLEEP_MS = 50;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const files = readdirSync(HEADSHOT_DIR).filter(f => f.endsWith('.png'));
  console.log(`📸 Uploading ${files.length} headshots to Supabase Storage...\n`);

  let uploaded = 0, failed = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = join(HEADSHOT_DIR, filename);
    const fileBuffer = readFileSync(filePath);

    process.stdout.write(`  [${i + 1}/${files.length}] ${filename}... `);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`nba/${filename}`, fileBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (error) {
      failed++;
      process.stdout.write(`❌ ${error.message}\n`);
    } else {
      uploaded++;
      process.stdout.write(`✅\n`);
    }

    await sleep(SLEEP_MS);
  }

  const BASE = `https://hnhrpwwznzokkfagfumb.supabase.co/storage/v1/object/public/${BUCKET}/nba`;
  console.log(`\n📊 Uploaded: ${uploaded}, Failed: ${failed}`);
  console.log(`\n🔗 CDN base URL: ${BASE}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
