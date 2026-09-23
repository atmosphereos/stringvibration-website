Node.js - backend
HTML + CSS - frontend
MySQL 8 - database
NodeMailer - mailer
Nginx - server

**INSTALLATION**

1. Install dependencies:
npm install
2. Make sure a MySQL 8 server is reachable and the target database exists.
For a local install:
sql
CREATE DATABASE 'name' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
(Or via Docker: `docker run -d --name 'name'-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE='name' -p 3306:3306 mysql:8`.)
3. Copy `.env.example` to `.env` and set:
- `DATABASE_URL` — a reachable MySQL 8 instance, e.g.
`mysql://user:pass@localhost:3306/'name'`.
- `YANDEX_GEOSUGGEST_KEY` — optional. A Yandex Maps Geosuggest API key
(https://developer.tech.yandex.ru/services/). Without it the address
suggest dropdown on request page is silently disabled.
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` —
optional. Outbound SMTP for intake notifications. If `SMTP_HOST` is
unset, email is skipped and intake still saves to the DB.
- `MAIL_FROM` / `MAIL_TO` — sender and recipient addresses for intake
notifications. Defaults to `SMTP_USER` if `MAIL_FROM` is unset.
4. Create the schema:
npm run db:init
5. Start the server (it serves the static files and the API on the same port):
npm start
Then open http://localhost:3000/.

**SMTP**

When a new intake row is created, a notification email is dispatched
asynchronously to `MAIL_TO` via the configured SMTP transport. The dispatch
is fire-and-forget — the API still returns `201` immediately, and a failed
SMTP send is logged but does not roll back the DB row. Duplicate submits
(same `Idempotency-Key`) do not re-send.

Sender uses `MAIL_FROM` (or `SMTP_USER` as fallback). `Reply-To` is set to
the customer's email so a reply goes straight to them.

If `SMTP_HOST` is unset the mailer logs `mailer disabled` at boot and the
notification step is skipped; intake still saves to the DB normally.

**PIPELINE**

Project have got Dockerfile, Docker-compose file and Gitlab-CI file
- Dockerfile has node container for Docker-compose to run npm install
- Docker-compose file is redirecting server ports to testing ports so tests aren't affecting production and copying nginx configuration with SSL-certificates to the test directory
- Gitlab-CI file is running nginx test via Docker container after creating temporary SSL certificates specifically for tests