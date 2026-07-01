# SonSoul (Phase 2) — store backend

Catalog (music + clothing/accessories), authed creator pipeline, and PayPal
plumbing live inside `gabrielgomez-server` (:8448). Storefront views come next.

## Data model (MySQL)

`migrations/001_core.sql` + `002_seed_lookups.sql`:

- **attribute_options** — dropdowns (genre / size / color / style), admin-editable
- **admin_users** — creator-pipeline logins (bcrypt + JWT)
- **products** — one row per item; `category` (music/clothing/accessory), `type`
  (beatpack/single/album/shirt/pants/socks/accessory), price, status, `is_digital`,
  shipping `weight_grams`, `paypal_product_id`
- **music_tracks** — per-track name/artist/genre/length/bpm/key, `master_path`
  (outside web root), `preview_path` (10s tagged), `waveform_json` (peaks)
- **music_license_tiers** — optional mp3/wav/stems/exclusive pricing
- **product_variants** — clothing size/color/style + `stock_qty` + weight
- **orders / order_items** — totals, shipping address, fulfillment + tracking, PayPal ids
- **download_grants** — signed, expiring, count-limited links for digital delivery
- **paypal_webhooks** — idempotent event log

## Host setup

### 1. MySQL
```sql
sudo mysql
CREATE DATABASE sonsoul CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sonsoul'@'127.0.0.1' IDENTIFIED BY '<strong-password>';
GRANT ALL PRIVILEGES ON sonsoul.* TO 'sonsoul'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 2. `.env` (in `/var/www/GabrielGomez/server/.env`)
See `.env.example`. Minimum for Phase 2:
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=sonsoul
DB_USER=sonsoul
DB_PASSWORD=<strong-password>

JWT_SECRET=<openssl rand -hex 32>
ADMIN_USERNAME=gabriel
ADMIN_EMAIL=gabrielelythgomez@gmail.com
ADMIN_PASSWORD=<your admin password>

PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=<sandbox client id>
PAYPAL_CLIENT_SECRET=<sandbox secret>
DISPLAY_APP_NAME=SonSoul

STORAGE_ROOT=/var/www/GabrielGomez-storage
```

### 3. Migrate + seed admin
```bash
cd /var/www/GabrielGomez/server
npm ci && npm run build
npm run migrate          # creates the DB (if missing) + all tables + seed options
npm run create-admin     # reads ADMIN_* from .env
sudo pm2 restart gabrielgomez-server
```

## API surface (base `/GabrielGomez/api`)

Admin (Bearer JWT from `/admin/auth/login`):
- `POST /admin/auth/login` · `GET /admin/auth/me`
- `POST /admin/products` · `GET /admin/products` · `GET /admin/products/:id`
  · `PATCH /admin/products/:id` · `DELETE /admin/products/:id`
- `POST /admin/products/:id/tracks|variants|tiers`
- `POST /admin/products/:id/publish` → flips status + auto-creates the PayPal catalog product
- `GET /admin/options` · `POST /admin/options`

Public storefront:
- `GET /store/options[?kind=]`
- `GET /store/products[?category=]` (published only)
- `GET /store/products/:slug`

## ffmpeg — A→Z (media pipeline)

The 10s tagged preview + waveform peaks are generated with `ffmpeg`/`ffprobe`.

### Install & verify (host)
```bash
sudo apt update && sudo apt install -y ffmpeg
ffmpeg -version && ffprobe -version   # confirm both resolve
which ffmpeg                           # usually /usr/bin/ffmpeg
```
Override paths via `FFMPEG_PATH` / `FFPROBE_PATH` in `.env` if non-standard.

### What each command does (the pipeline will run these via `child_process.spawn`, arg arrays — never a shell string)

**Duration / metadata:**
```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 master.wav
```

**10s tagged preview** (trim to 10s, downmix, low bitrate; overlays a repeating
voice tag so the clip is worthless to steal):
```bash
ffmpeg -y -i master.wav -i producer-tag.mp3 \
  -filter_complex "[1:a]aloop=loop=-1:size=2e9,volume=0.55[t];[0:a][t]amix=inputs=2:duration=first:dropout_transition=0[a]" \
  -map "[a]" -t 10 -ac 2 -ar 44100 -b:a 96k preview.mp3
```
(Without a tag file, just: `ffmpeg -y -i master.wav -t 10 -ac 2 -ar 44100 -b:a 96k preview.mp3`.)

**Waveform peaks** (mono, low sample rate PCM → Node downsamples to N peaks for
the white-bg/black-wave render):
```bash
ffmpeg -v error -i master.wav -ac 1 -ar 8000 -f s16le -
```

### Anti-piracy model
- Preview = short + tagged + low bitrate, web-served.
- Masters live under `STORAGE_ROOT` (outside the web root) and are delivered
  only via signed, expiring, single-use `download_grants` after a captured order.
- Browser-played audio can always be recorded — so the preview is intentionally
  low-value, and the real files never reach the browser pre-purchase.
