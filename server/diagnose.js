// Diagnostic for the "DATABASE_URL is not set" puzzle.
// Run from anywhere with: node server/diagnose.js
// Prints exactly what .env file is being read, its raw bytes, and what
// dotenv produces from it.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import dotenv from 'dotenv';

const here    = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(join(here, '..', '.env'));

console.log('---------------------------------------------------------------');
console.log('cwd ........:', process.cwd());
console.log('script dir .:', here);
console.log('expected env:', envPath);
console.log('file exists.:', existsSync(envPath));

if (!existsSync(envPath)) {
  console.log('\n=> No .env file at that path.');
  console.log('   Is it really named ".env" (not ".env.txt")?  Check with:');
  console.log('   PowerShell> Get-ChildItem ' + dirname(envPath) + ' -Force -Filter ".env*"');
  process.exit(1);
}

const stat = statSync(envPath);
console.log('file size ..:', stat.size, 'bytes');

const buf = readFileSync(envPath);

// First 4 bytes as hex — reveals BOM and encoding
const head = buf.subarray(0, 4);
console.log('first 4 hex.:', [...head].map(b => b.toString(16).padStart(2, '0')).join(' '));

if (head[0] === 0xEF && head[1] === 0xBB && head[2] === 0xBF) {
  console.log('             ^^ UTF-8 BOM detected — this can confuse dotenv.');
}
if (head[0] === 0xFF && head[1] === 0xFE) {
  console.log('             ^^ UTF-16 LE BOM — file was saved by Windows PowerShell.');
  console.log('             Re-save as plain UTF-8 (no BOM). dotenv cannot read UTF-16.');
}
if (head[0] === 0xFE && head[1] === 0xFF) {
  console.log('             ^^ UTF-16 BE BOM — dotenv cannot read this either.');
}

// Show the file content as UTF-8 text
console.log('\n--- content (UTF-8 decoded) -----------------------------------');
console.log(buf.toString('utf8'));
console.log('---------------------------------------------------------------');

// Parse with dotenv directly so we can see what it pulls out
const parsed = dotenv.parse(buf);
console.log('\n--- dotenv parsed keys ----------------------------------------');
console.log(Object.keys(parsed));
console.log('DATABASE_URL value:', JSON.stringify(parsed.DATABASE_URL));

if (!parsed.DATABASE_URL) {
  console.log('\n=> dotenv did not pick up DATABASE_URL.');
  console.log('   The line MUST look like (no quotes, no leading whitespace):');
  console.log('   DATABASE_URL=mysql://user:pass@localhost:3306/vibratsiya');
} else {
  console.log('\n=> dotenv parsed DATABASE_URL successfully.');
  console.log('   If db.js still errors after this, paste the EXACT error text.');
}
