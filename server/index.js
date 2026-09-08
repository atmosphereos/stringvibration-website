import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'dotenv/config';
import { pool } from './db.js';
import { sendIntakeNotification } from './mailer.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const app = express();

// Behind Nginx on the same host. 'loopback' tells Express to trust the
// X-Forwarded-For / X-Forwarded-Proto headers only when the immediate peer
// is on 127.0.0.0/8 — so req.ip becomes the real client IP, not the proxy.
app.set('trust proxy', 'loopback');

app.use(express.json({ limit: '32kb' }));
app.use(express.static(root, { extensions: ['html'] }));

const SERVICES = new Set(['alignment', 'balancing', 'diagnostics', 'consult']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const trim = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const optional = (v, max) => {
  const s = trim(v, max);
  return s.length ? s : null;
};

app.post('/api/requests', async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!key || !UUID_RE.test(key)) {
    return res.status(400).json({ error: 'missing_or_invalid_idempotency_key' });
  }

  const b = req.body ?? {};
  const service = trim(b.service, 32);
  const name    = trim(b.name, 200);
  const email   = trim(b.email, 200);
  const phone   = trim(b.phone, 40);
  const machine = optional(b.machine, 120);
  const region  = optional(b.region, 200);
  const message = optional(b.message, 4000);
  const consent = b.consent === true;

  if (!SERVICES.has(service)) return res.status(400).json({ error: 'invalid_service' });
  if (!name)                  return res.status(400).json({ error: 'name_required' });
  if (!/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'invalid_email' });
  if (!phone)                 return res.status(400).json({ error: 'phone_required' });
  if (!consent)               return res.status(400).json({ error: 'consent_required' });

  const ref = buildRef();
  const ip = (req.ip || '').replace(/^::ffff:/, '') || null;
  const userAgent = trim(req.get('User-Agent') || '', 500) || null;

  try {
    // INSERT IGNORE makes a duplicate idempotency_key a no-op (affectedRows = 0)
    // instead of throwing — the original row stays untouched.
    const [result] = await pool.execute(
      `INSERT IGNORE INTO requests
         (ref, idempotency_key, service, name, email, phone, machine, region, message, consent, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ref, key, service, name, email, phone, machine, region, message, consent ? 1 : 0, ip, userAgent]
    );

    if (result.affectedRows === 1) {
      // Read back the canonical row so we hand the client the DB-stamped created_at.
      const [rows] = await pool.execute(
        `SELECT id, ref, created_at FROM requests WHERE id = ?`,
        [result.insertId]
      );
      const row = rows[0];

      // Fire-and-forget: don't make the user wait on SMTP, and don't fail
      // the request if mail dispatch fails — the row is already saved.
      sendIntakeNotification({
        ...row,
        service, name, email, phone, machine, region, message, consent, ip,
      });
      return res.status(201).json({ status: 'created', ...row });
    }

    // affectedRows === 0 → duplicate idempotency_key; return the original row.
    const [existing] = await pool.execute(
      `SELECT id, ref, created_at FROM requests WHERE idempotency_key = ?`,
      [key]
    );
    return res.status(200).json({ status: 'duplicate', ...existing[0] });
  } catch (err) {
    console.error('intake_failed', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

function buildRef() {
  const year = new Date().getFullYear();
  const n = String(Math.floor(100 + Math.random() * 900));
  return `Ф-01 · ${n} / ${year}`;
}

// ---- Yandex Geosuggest proxy --------------------------------------------
// Keeps the API key server-side. The browser hits /api/suggest/address?text=…
// and gets back a small, normalised list — no Yandex internals leak through.

const SUGGEST_ENDPOINT = 'https://suggest-maps.yandex.ru/v1/suggest';
const suggestCache = new Map(); // crude in-memory LRU-ish cache, ~5 min TTL
const SUGGEST_TTL_MS = 5 * 60 * 1000;
const SUGGEST_CACHE_MAX = 500;

app.get('/api/suggest/address', async (req, res) => {
  const apikey = process.env.YANDEX_GEOSUGGEST_KEY;
  if (!apikey) return res.status(503).json({ error: 'suggest_disabled' });

  const text = trim(req.query.text, 200);
  if (text.length < 2) return res.json({ results: [] });

  const cacheKey = text.toLowerCase();
  const cached = suggestCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return res.json({ results: cached.results });
  }

  const url = new URL(SUGGEST_ENDPOINT);
  url.searchParams.set('apikey', apikey);
  url.searchParams.set('text', text);
  url.searchParams.set('lang', 'ru_RU');
  url.searchParams.set('print_address', '1');
  url.searchParams.set('results', '7');
  // 'geo' covers everything addressable: countries, regions, cities, streets, houses.
  url.searchParams.set('types', 'geo');

  try {
    // Some Yandex API keys are bound to a HTTP-Referer whitelist. Set
    // YANDEX_GEOSUGGEST_REFERER in .env to whatever domain the key is
    // registered for (e.g. https://strun-vibration.ru) — leave unset if
    // the key has no referer restriction.
    const headers = {};
    if (process.env.YANDEX_GEOSUGGEST_REFERER) {
      headers.Referer = process.env.YANDEX_GEOSUGGEST_REFERER;
    }

    const upstream = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      console.error('yandex_suggest_http', upstream.status, upstream.statusText, body.slice(0, 500));
      return res.status(502).json({
        error: 'upstream_error',
        upstream_status: upstream.status,
        upstream_message: body.slice(0, 200),
      });
    }
    const data = await upstream.json();
    const results = (data.results ?? []).map((r) => {
      const title = r.title?.text ?? '';
      const subtitle = r.subtitle?.text ?? '';
      const value = r.address?.formatted_address
        ?? [title, subtitle].filter(Boolean).join(', ')
        ?? title;
      return { title, subtitle, value };
    }).filter((r) => r.value);

    if (suggestCache.size >= SUGGEST_CACHE_MAX) {
      // simple eviction: drop oldest insertion
      const firstKey = suggestCache.keys().next().value;
      if (firstKey) suggestCache.delete(firstKey);
    }
    suggestCache.set(cacheKey, { results, expires: Date.now() + SUGGEST_TTL_MS });

    res.json({ results });
  } catch (err) {
    console.error('yandex_suggest_failed', err);
    res.status(502).json({ error: 'upstream_error' });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`vibratsiya server listening on http://localhost:${port}`);
});
