# Deployment & CI/CD setup

The pipeline (`.github/workflows/ci-cd.yml`) has two jobs:

1. **Quality Gates** — runs on every push/PR to `master`/`develop`. Type-checks
   and builds both `server` and `client`. No infrastructure needed.
2. **Deploy to Production** — SSH into the host, build, PM2 restart, health
   check, auto-rollback. Runs on a push to `master` (or a manual dispatch with
   `deploy: true`). It needs the secrets below; a preflight step fails with a
   clear message if any are missing.

---

## 1. SSH deploy key

This repo uses the **same** `SERVER_HOST` / `SERVER_USER` / `SERVER_SSH_KEY`
secrets as `mirror-server` and `admin`. Two options:

### Option A — reuse the existing deploy key (fastest)
Copy the same three secret values already configured on the Admin repo into this
repo (GitHub secrets are per-repo, so they must be re-entered here).

### Option B — dedicated deploy key (recommended for this repo)
On your local machine, generate a keypair and install it on the host:

```bash
# 1. Generate (no passphrase, so CI can use it non-interactively)
ssh-keygen -t ed25519 -C "gabrielgomez-deploy@github-actions" \
  -f ~/.ssh/gabrielgomez_deploy -N ""

# 2. Install the PUBLIC key for the administrator user on the host
ssh-copy-id -i ~/.ssh/gabrielgomez_deploy.pub administrator@24.39.41.126
#   (manual fallback:)
#   cat ~/.ssh/gabrielgomez_deploy.pub | ssh administrator@24.39.41.126 \
#     'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'

# 3. Test it
ssh -i ~/.ssh/gabrielgomez_deploy administrator@24.39.41.126 'whoami && sudo pm2 -v'

# 4. The PRIVATE key (full output incl. BEGIN/END lines) becomes SERVER_SSH_KEY.
cat ~/.ssh/gabrielgomez_deploy
```

> Never commit the private key. It lives only in GitHub Secrets. The `.pub`
> goes on the server; the private key goes in `SERVER_SSH_KEY`.

---

## 2. GitHub secrets & variables

**Settings → Secrets and variables → Actions**

Secrets (tab: *Secrets*):

| Secret | Value |
| --- | --- |
| `SERVER_HOST` | `24.39.41.126` |
| `SERVER_USER` | `administrator` |
| `SERVER_SSH_KEY` | private deploy key (Option B above) |
| `GABRIELGOMEZ_DEPLOY_PATH` | `/var/www/GabrielGomez` (git checkout; Apache serves its `client/dist`) |

---

## 3. First-time host bootstrap

# Apache serves /var/www/GabrielGomez/client/dist (Mirror convention), so the
# git checkout's source/VCS never sit in the served path.
```bash
git clone https://github.com/GabrielGomez33/gabrielgomez /var/www/GabrielGomez
cd /var/www/GabrielGomez/server
npm ci && npm run build && npm prune --omit=dev
cp .env.example .env            # adjust if needed (defaults are fine for Phase 1)
sudo pm2 start ecosystem.config.js && sudo pm2 save

cd ../client
npm ci && npm run deploy        # builds client/dist in place (Apache serves it)
```

Then add the Apache vhost block (see the root `README.md`) and reload Apache.

## 4. Deploy

Push to `master` (or **Actions → Run workflow → deploy: true**). The deploy job
builds, PM2-restarts `gabrielgomez-server`, health-checks it, tags a release,
and rolls back automatically if the health check fails.

---

## Verifying locally before you push

```bash
cd server && npm ci && npm run type-check && npm run build
cd ../client && npm ci && npm run build
```

Both must succeed — that's exactly what the Quality Gates job runs.
