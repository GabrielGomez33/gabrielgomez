# Gabriel Gomez — Portfolio + SonSoul

Personal portfolio and (Phase 2) the **SonSoul** beat storefront, served at
**https://www.theundergroundrailroad.world/GabrielGomez**.

Built to mirror the proven TUGRR stack (Mirror / mirror-server / Admin):
**React 19 + Vite** SPA, **Node/Express + TypeScript** API, **PM2**, Apache
reverse proxy, GitHub Actions CI/CD with health-checked deploys and rollback.

```
.
├── client/   React 19 + Vite SPA   (base path /GabrielGomez/)
├── server/   Express + TS API      (PM2: gabrielgomez-server, port 8448)
└── .github/workflows/ci-cd.yml     Quality gates → deploy → health check → rollback
```

## Design

High-contrast black & white, spaced display type, heavy negative space, with a
faint drifting haze + film grain for a "cloudy / ethereal" atmosphere — a nod to
the Behance *Black & White Portfolio* reference and to SonSoul's sound.

## Roadmap

- **Phase 1 (done):** portfolio — hero, about, goals, selected work (Mirror,
  DINA), SonSoul teaser, socials. Static SPA + minimal API (health + stubs).
- **Phase 2:** SonSoul storefront — MySQL catalog with one-time **license tiers**
  (MP3 / WAV / stems / exclusive) and beatpacks; Web Audio wave visualizer;
  tagged previews + signed download URLs; **PayPal Orders API** checkout;
  creator upload pipeline (Admin-portal pattern); Instagram feed via the
  Instagram Graph API (server-side cached proxy).

## Local development

```bash
# Client
cd client && npm install && npm run dev      # http://localhost:5173/GabrielGomez/

# Server
cd server && npm install && npm run build && npm start   # 127.0.0.1:8448
```

## Production deploy

CI/CD runs automatically on push to `master`. The **deploy** job is gated on the
`DEPLOY_ENABLED` repo variable, so master pushes stay green (quality gates pass,
deploy is skipped) until infra is configured. Full walkthrough — including SSH
deploy-key setup — is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Manual/first-time setup on the host:

### 1. GitHub secrets

| Secret | Value |
| --- | --- |
| `SERVER_HOST` | production host (shared with mirror-server / admin) |
| `SERVER_USER` | SSH user (shared) |
| `SERVER_SSH_KEY` | private deploy key (shared) |
| `GABRIELGOMEZ_DEPLOY_PATH` | repo checkout on the host — `/var/www/GabrielGomez` (also the web root) |

Plus one **repo variable** (Actions → Variables): `DEPLOY_ENABLED` = `true` —
set this last, once the secrets exist and the host is bootstrapped.

### 2. First-time host bootstrap

# The checkout dir IS the web root (Admin pattern); the client publishes its
# built dist/* into the same dir, and Apache serves only the built SPA.
```bash
git clone <repo> /var/www/GabrielGomez            # == GABRIELGOMEZ_DEPLOY_PATH
cd /var/www/GabrielGomez/server
npm ci && npm run build && npm prune --omit=dev
cp .env.example .env                               # fill in as needed
sudo pm2 start ecosystem.config.js && sudo pm2 save
cd ../client && npm ci && npm run deploy           # publishes dist/* into /var/www/GabrielGomez
```

### 3. Apache — add to the `*:443` VirtualHost

Place the API `ProxyPass` **before** the static `Alias` (same ordering as
`/admin/api`):

```apache
    # Gabriel Gomez API (before the static alias)
    ProxyPass        /GabrielGomez/api http://127.0.0.1:8448/GabrielGomez/api
    ProxyPassReverse /GabrielGomez/api http://127.0.0.1:8448/GabrielGomez/api

    # Gabriel Gomez SPA (static)
    Alias "/GabrielGomez" "/var/www/GabrielGomez"
    <Directory "/var/www/GabrielGomez">
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        # SPA fallback (also shipped as dist/.htaccess)
        RewriteEngine On
        RewriteBase /GabrielGomez/
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule ^ /GabrielGomez/index.html [L]
    </Directory>

    # The checkout lives under the web root, so deny the source/VCS/tooling
    # subtrees — only the built SPA (index.html + assets/) should be reachable.
    <DirectoryMatch "^/var/www/GabrielGomez/(\.git|\.github|server|client|node_modules|docs)">
        Require all denied
    </DirectoryMatch>
```

Then `sudo apache2ctl configtest && sudo systemctl reload apache2`.

## Ports on the shared host

| Service | Port |
| --- | --- |
| mirror-server | 8444 |
| dina-server | 8445 |
| admin-server | 8446 |
| cambridge | 8447 |
| **gabrielgomez-server** | **8448** |
