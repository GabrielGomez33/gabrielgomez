# Deployment & CI/CD setup

The pipeline (`.github/workflows/ci-cd.yml`) has two jobs:

1. **Quality Gates** — runs on every push/PR to `master`/`develop`. Type-checks
   and builds both `server` and `client`. No infrastructure needed.
2. **Deploy to Production** — SSH into the host, build, PM2 restart, health
   check, auto-rollback. Runs only when **both** are true:
   - the push is to `master` (or a manual dispatch with `deploy: true`), **and**
   - the repo variable `DEPLOY_ENABLED` == `true`.

So until you finish the steps below, master pushes stay **green** (quality gates
pass, deploy is *skipped* — not failed).

---

## 1. SSH deploy key

This repo uses the **same** `SERVER_HOST` / `SERVER_USER` / `SERVER_SSH_KEY`
secrets as `mirror-server` and `admin`. Two options:

### Option A — reuse the existing deploy key (fastest)
Copy the same three secret values already configured on the Admin repo into this
repo (GitHub secrets are per-repo, so they must be re-entered here).

### Option B — dedicated deploy key
On any machine, generate a keypair and install it on the host:

```bash
# Generate (no passphrase, so CI can use it non-interactively)
ssh-keygen -t ed25519 -C "gabrielgomez-deploy" -f ./gabrielgomez_deploy -N ""

# Add the PUBLIC key to the deploy user's authorized_keys on the host
ssh-copy-id -i ./gabrielgomez_deploy.pub <SERVER_USER>@<SERVER_HOST>
# (or append the contents of gabrielgomez_deploy.pub to ~/.ssh/authorized_keys)

# The PRIVATE key (contents of ./gabrielgomez_deploy) becomes SERVER_SSH_KEY.
cat ./gabrielgomez_deploy
```

> Never commit the private key. It lives only in GitHub Secrets.

---

## 2. GitHub secrets & variables

**Settings → Secrets and variables → Actions**

Secrets (tab: *Secrets*):

| Secret | Value |
| --- | --- |
| `SERVER_HOST` | production host (same as Admin/mirror-server) |
| `SERVER_USER` | SSH user (same) |
| `SERVER_SSH_KEY` | private deploy key (same, or Option B above) |
| `GABRIELGOMEZ_DEPLOY_PATH` | repo checkout path on the host, e.g. `/root/apps/gabrielgomez` |

Variables (tab: *Variables*):

| Variable | Value |
| --- | --- |
| `DEPLOY_ENABLED` | `true` (set this **last**, after step 3) |

---

## 3. First-time host bootstrap

```bash
git clone https://github.com/GabrielGomez33/gabrielgomez /root/apps/gabrielgomez
cd /root/apps/gabrielgomez/server
npm ci && npm run build && npm prune --omit=dev
cp .env.example .env            # adjust if needed (defaults are fine for Phase 1)
sudo pm2 start ecosystem.config.js && sudo pm2 save

cd ../client
npm ci && npm run deploy        # publishes dist/* → /var/www/GabrielGomez
```

Then add the Apache vhost block (see the root `README.md`) and reload Apache.

## 4. Flip the switch

Set the `DEPLOY_ENABLED` variable to `true`. The next push to `master` (or a
manual **Run workflow → deploy**) will deploy, health-check, and tag a release.

---

## Verifying locally before you push

```bash
cd server && npm ci && npm run type-check && npm run build
cd ../client && npm ci && npm run build
```

Both must succeed — that's exactly what the Quality Gates job runs.
