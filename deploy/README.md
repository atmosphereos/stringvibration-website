# Deployment — VPS · 89.108.98.163 · вибрацияструн.рф

Reverse-proxy setup: **Nginx** terminates TLS on 443 and forwards everything to
the **Node** app listening on **127.0.0.1:3000**, supervised by **systemd**.

```
internet ──► nginx :443 (TLS) ──► 127.0.0.1:3000 (node)
                │
                └── /etc/ssl/strun-vibration/{fullchain,privkey}.pem
```

## 1 · One-time server prep

```bash
# packages
sudo apt update
sudo apt install -y nginx idn2 mysql-server curl

# Node 20 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# a dedicated unprivileged user that owns the app dir
sudo useradd --system --create-home --shell /usr/sbin/nologin vibratsiya
```

## 2 · Resolve the IDN once

Nginx wants Punycode in `server_name`. Compute it on the server so you're sure:

```bash
idn2 вибрацияструн.рф
# example output: xn--80aab2cfecffaqcs7c.xn--p1ai
```

Open `deploy/nginx/strun-vibration.conf` and replace the placeholder
`xn--80aab2cfecffaqcs7c.xn--p1ai` with whatever `idn2` actually produced.
The placeholder is used twice (in the `:80` and `:443` blocks).

## 3 · Deploy the app

```bash
sudo mkdir -p /var/www/strun-vibration
sudo chown vibratsiya:vibratsiya /var/www/strun-vibration

# upload the repo (rsync, scp, or git clone — pick one)
sudo -u vibratsiya rsync -av --exclude node_modules ./ /var/www/strun-vibration/

cd /var/www/strun-vibration
sudo -u vibratsiya npm ci --omit=dev

# write .env with the real SMTP, DB, Yandex values (chmod 600)
sudo -u vibratsiya cp .env.example .env
sudo -u vibratsiya nano .env
sudo chmod 600 .env

# apply the DB schema once
sudo -u vibratsiya npm run db:init
```

## 4 · Drop the SSL certificate in place

Whatever issued your cert (Let's Encrypt, GlobalSign, your registrar), you
need two files. If your CA gave you a separate intermediate chain, concat it:

```bash
sudo mkdir -p /etc/ssl/strun-vibration
sudo cp /path/to/yourdomain.crt   /etc/ssl/strun-vibration/cert.pem
sudo cp /path/to/intermediate.crt /etc/ssl/strun-vibration/chain.pem
sudo cp /path/to/yourdomain.key   /etc/ssl/strun-vibration/privkey.pem

# Nginx wants a single fullchain (leaf + intermediates concatenated)
sudo bash -c 'cat /etc/ssl/strun-vibration/cert.pem /etc/ssl/strun-vibration/chain.pem > /etc/ssl/strun-vibration/fullchain.pem'

# Lock the private key down so only root can read it
sudo chmod 600 /etc/ssl/strun-vibration/privkey.pem
sudo chown root:root /etc/ssl/strun-vibration/*
```

If your CA gave you a single bundled file already, just copy it to
`fullchain.pem` and skip the `cat`.

## 5 · Install the systemd unit

```bash
sudo cp deploy/systemd/strun-vibration.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now strun-vibration

# verify
systemctl status strun-vibration
sudo journalctl -u strun-vibration -f         # tail the logs
```

You should see `mailer ready ·` and `vibratsiya server listening on
http://localhost:3000` in the journal.

## 6 · Install the Nginx site

```bash
sudo cp deploy/nginx/strun-vibration.conf /etc/nginx/sites-available/strun-vibration
sudo ln -s /etc/nginx/sites-available/strun-vibration /etc/nginx/sites-enabled/

# drop the stock default site if it's still there
sudo rm -f /etc/nginx/sites-enabled/default

# syntax check + reload
sudo nginx -t
sudo systemctl reload nginx
```

Open <https://вибрацияструн.рф> — the site should load over HTTPS, the form
should submit, the cookie banner should appear, and `req.ip` server-side will
show the real client address (because Express is now trusting the loopback
proxy via `app.set('trust proxy', 'loopback')`).

## 7 · Firewall

If `ufw` is active, open the standard ports and block direct hits to the Node
upstream port:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'    # 80 + 443
sudo ufw enable
# port 3000 is bound to 127.0.0.1 only by the app — nothing extra needed
```

## 8 · Updates / redeploys

```bash
cd /var/www/strun-vibration
sudo -u vibratsiya git pull       # or rsync the new files in
sudo -u vibratsiya npm ci --omit=dev
sudo systemctl restart strun-vibration
```

For schema migrations: re-run `sudo -u vibratsiya npm run db:init` (it's
idempotent — `CREATE TABLE IF NOT EXISTS`).

---

## Troubleshooting

**`502 Bad Gateway`** — the upstream Node app isn't running or isn't listening
on 3000.  `systemctl status strun-vibration` and the journal will tell you why.

**TLS handshake fails** — `sudo nginx -t` reports cert problems? Check that
`fullchain.pem` is the leaf + intermediates concatenated in that order, and
that `privkey.pem` matches the cert (`openssl x509 -noout -modulus -in
fullchain.pem | openssl md5` vs `openssl rsa -noout -modulus -in privkey.pem
| openssl md5` — the two hashes must match).

**Domain resolves but Nginx returns the default page** — your `server_name`
Punycode doesn't match what `idn2 вибрацияструн.рф` outputs. Fix the config.

**Client IPs all show `127.0.0.1` in the DB** — `app.set('trust proxy', …)`
wasn't applied. Make sure `server/index.js` includes the `trust proxy` line
near the top (it does in this repo).
