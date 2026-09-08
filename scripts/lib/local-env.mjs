import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export function loadEnvFile(file) {
  try {
    const text = requireText(file);
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      let value = match[2].trim();
      // Some local env exports accidentally contain KEY=KEY=value; accept them
      // without modifying the user's env files.
      if (value.startsWith(`${match[1]}=`)) value = value.slice(match[1].length + 1);
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  } catch {
    // Optional env files are intentionally ignored when absent.
  }
}

function requireText(file) {
  // Synchronous access keeps startup deterministic before the server listens.
  return readFileSync(file, 'utf8');
}


export function loadLocalEnv(root) {
 loadEnvFile(join(root, '.env.development.local'));
 loadEnvFile(join(root, '.env.local'));
}
