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

CI/CD runs automatically on push to `master` (quality gates on every push/PR;
deploy on `master`). Full walkthrough — including SSH deploy-key setup — is in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Manual/first-time setup on the host:

### 1. GitHub secrets

| Secret | Value |
| --- | --- |
| `SERVER_HOST` | production host (shared with mirror-server / admin) |
| `SERVER_USER` | SSH user (shared) |
| `SERVER_SSH_KEY` | private deploy key (shared) |
| `GABRIELGOMEZ_DEPLOY_PATH` | git checkout on the host — `/var/www/GabrielGomez` (Apache serves its `client/dist`) |

### 2. First-time host bootstrap

# The checkout lives at /var/www/GabrielGomez; Apache serves its client/dist
# subfolder (Mirror convention), so source/VCS never sit in the served path.
```bash
git clone <repo> /var/www/GabrielGomez            # == GABRIELGOMEZ_DEPLOY_PATH
cd /var/www/GabrielGomez/server
npm ci && npm run build && npm prune --omit=dev
cp .env.example .env                               # fill in as needed
sudo pm2 start ecosystem.config.js && sudo pm2 save
cd ../client && npm ci && npm run deploy           # builds client/dist in place (Apache serves it)
```

### 3. Apache — add to the `*:443` VirtualHost

Place the API `ProxyPass` **before** the static `Alias` (same ordering as
`/admin/api`):

```apache
    # Gabriel Gomez API (BEFORE the static alias, like /admin/api)
    ProxyPass        /GabrielGomez/api http://127.0.0.1:8448/GabrielGomez/api
    ProxyPassReverse /GabrielGomez/api http://127.0.0.1:8448/GabrielGomez/api

    # Gabriel Gomez portfolio + SonSoul — serve the Vite dist directly, same
    # convention as /Mirror. The SPA history fallback (clean, extensionless
    # URLs) is handled by the .htaccess shipped inside dist (AllowOverride All).
    RedirectMatch 301 ^/GabrielGomez$ /GabrielGomez/
    Alias "/GabrielGomez" "/var/www/GabrielGomez/client/dist"
    <Directory "/var/www/GabrielGomez/client/dist">
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
```

> Serving `client/dist` (not the repo root) keeps `.git`/`server`/source out of
> the web path entirely — no deny rules needed.

Then `sudo apache2ctl configtest && sudo systemctl reload apache2`.

## Ports on the shared host

| Service | Port |
| --- | --- |
| mirror-server | 8444 |
| dina-server | 8445 |
| admin-server | 8446 |
| cambridge | 8447 |
| **gabrielgomez-server** | **8448** |
