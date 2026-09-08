import mysql from 'mysql2/promise';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

// Resolve the project root relative to THIS file, not process.cwd(), so the
// .env is found regardless of which directory `node` was launched from.
const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');

if (!existsSync(envPath)) {
  throw new Error(`.env file not found at ${envPath}. Copy .env.example to .env and fill it in.`);
}
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  throw new Error(
    `DATABASE_URL is empty in ${envPath}. ` +
    `Open the file and make sure the line begins with DATABASE_URL= (no spaces around =, no quotes needed). ` +
    `If you edited it in Notepad, save again as "UTF-8" (NOT "UTF-8 with BOM").`
  );
}

export const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  multipleStatements: true,
  charset: 'utf8mb4',
  dateStrings: false,
  timezone: 'Z',
});
