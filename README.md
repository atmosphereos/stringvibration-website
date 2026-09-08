# Вибрация струн

Static site (`index.html`, `about.html`, `request.html`, `styles.css`) plus a
small Node + MySQL 8 backend that stores intake form submissions.

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Make sure a MySQL 8 server is reachable and the target database exists.
   For a local install:
   ```sql
   CREATE DATABASE vibratsiya CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
   (Or via Docker: `docker run -d --name vibratsiya-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=vibratsiya -p 3306:3306 mysql:8`.)
3. Copy `.env.example` to `.env` and set:
   - `DATABASE_URL` — a reachable MySQL 8 instance, e.g.
     `mysql://user:pass@localhost:3306/vibratsiya`.
   - `YANDEX_GEOSUGGEST_KEY` — optional. A Yandex Maps Geosuggest API key
     (https://developer.tech.yandex.ru/services/). Without it the address
     suggest dropdown on `Регион выезда` is silently disabled.
   - `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` —
     optional. Outbound SMTP for intake notifications. If `SMTP_HOST` is
     unset, email is skipped and intake still saves to the DB.
   - `MAIL_FROM` / `MAIL_TO` — sender and recipient addresses for intake
     notifications. Defaults to `SMTP_USER` if `MAIL_FROM` is unset.
4. Create the schema:
   ```
   npm run db:init
   ```
5. Start the server (it serves the static files and the API on the same port):
   ```
   npm start
   ```
   Then open http://localhost:3000/.

## Intake API

`POST /api/requests`

Headers:
- `Content-Type: application/json`
- `Idempotency-Key: <uuid>` — required. Same key on a retry returns the original
  record (HTTP 200, `status: "duplicate"`) instead of inserting a second row.

Body:
```
{
  "service": "alignment" | "balancing" | "diagnostics" | "consult",
  "name": "...",
  "email": "...",
  "phone": "...",
  "machine": "..." | null,
  "region": "..." | null,
  "message": "..." | null,
  "consent": true
}
```

Responses:
- `201 { status: "created", id, ref, created_at }` — first submit.
- `200 { status: "duplicate", id, ref, created_at }` — retry with the same key.
- `400 { error: "..." }` — validation failure.

## Address suggest

`GET /api/suggest/address?text=<query>`

Server-side proxy to Yandex Maps Geosuggest. Keeps the API key off the client
and applies a 5-minute in-memory cache. Returns:

```
{ "results": [ { "title": "...", "subtitle": "...", "value": "..." }, ... ] }
```

- `503 { error: "suggest_disabled" }` if `YANDEX_GEOSUGGEST_KEY` is unset.
- `502 { error: "upstream_error" }` on Yandex failure or 4-second timeout.

## Intake notifications

When a new intake row is created, a notification email is dispatched
asynchronously to `MAIL_TO` via the configured SMTP transport. The dispatch
is fire-and-forget — the API still returns `201` immediately, and a failed
SMTP send is logged but does not roll back the DB row. Duplicate submits
(same `Idempotency-Key`) do not re-send.

Sender uses `MAIL_FROM` (or `SMTP_USER` as fallback). `Reply-To` is set to
the customer's email so a reply goes straight to them.

If `SMTP_HOST` is unset the mailer logs `mailer disabled` at boot and the
notification step is skipped; intake still saves to the DB normally.
