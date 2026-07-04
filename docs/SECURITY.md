# SonSoul — security model & status

Honest assessment of the backend's security posture. Two buckets: **hardened
now** and **must be built securely next** (the checkout + download-delivery flow,
where the "no free files" guarantee is actually enforced).

## The core question: can someone get the paid files for free?

**Today: there is no path to a master file at all.**
- Masters live under `STORAGE_ROOT` (the SSD mount, **outside the web root**) and
  are **never** served by Apache or by any Express route.
- The only media endpoints are: the gated 10s **preview** stream and the public
  **cover image**. Neither can return a master.
- The download-delivery flow (grants → zip → stream) is **not built yet**, so no
  endpoint can hand out a master — not even to a buyer. That flow is the next
  thing to build, and it must enforce: order is paid, grant not expired, download
  count not exceeded, path validated, file streamed without exposing its path.

So the guarantee isn't "we blocked the download" — it's "the download flow
doesn't exist yet, and when it does it will be the gatekeeper." See **Pending**.

## Hardened now

| Area | Control |
|---|---|
| **Masters** | Outside web root; never served; path-traversal-blocked via `resolveInStorage` (rejects anything escaping `STORAGE_ROOT`). |
| **Previews** | Gated `/store/preview/:trackId`: short-lived HMAC token (`HS256`, ~5 min), Origin/Referer allowlist, per-IP rate limit, `Cache-Control: no-store`; serves only the 10s **tagged** clip (or an on-the-fly 10s transcode) — masters never exposed. |
| **Admin auth** | bcrypt hashes; timing-constant login (dummy-hash compare); JWT **algorithm pinned to HS256** (blocks `alg:none`/confusion); 12h expiry; login **rate-limited** per IP. |
| **SQL** | 100% parameterized (`?` placeholders via mysql2); `LIMIT/OFFSET` are integer-coerced; no string-built queries. |
| **ffmpeg** | All calls `spawn()` with **argument arrays** — no shell, so filenames can't inject commands. |
| **Uploads** | Admin-JWT-gated; per-file size limit; extension allowlist; filenames sanitized to `[A-Za-z0-9._-]`; product id validated before multer writes. |
| **Transport** | Apache terminates TLS (Let's Encrypt); server binds `127.0.0.1` only (not publicly reachable except via Apache). |
| **Headers** | `helmet()` defaults; `x-powered-by` disabled. |
| **CORS** | Restricted to the site origin (third-party sites can't call the API); no cookie credentials, so no CSRF surface (tokens are Bearer in localStorage). |
| **Errors** | Central handler returns generic 500s (no stack traces to clients); async throws can't hang requests. |
| **DB access** | App uses a least-privilege `sonsoul` user (not root), scoped to the `sonsoul` schema. |
| **Secrets** | `.env` git-ignored; only blank templates committed. |
| **Deps** | `npm audit` clean (0 vulns); CI runs an audit gate on every push. |

## Verified by test
- Forged/garbage bearer token → `401`.
- Login brute-force → `429` after the cap.
- Cross-origin request from a foreign Origin → no CORS header (blocked).
- DB unavailable → clean `500`, no hang.
- Preview without a valid token → `403`; bad track id → `400`.

## Checkout, delivery & accounts — now built (secure by design)

- **Server-side pricing** — `computeCart` recomputes every price, shipping and
  stock check from the DB; the client's numbers are never trusted.
- **Capture verification** — `/store/checkout/capture` re-checks the PayPal
  captured amount **equals our recorded total** before fulfilling; idempotent.
- **Atomic inventory** — stock is decremented with a guarded UPDATE at capture
  (`... WHERE stock_qty >= ?`) to prevent oversell/races.
- **Download grants** — issued **only** after capture; single token, expiring
  (`DOWNLOAD_TTL_DAYS`), count-limited (`DOWNLOAD_MAX`). `GET /store/download/:token`
  validates expiry + count, **atomically claims a slot**, then streams an
  on-the-fly **zip** of the masters — no path exposed, nothing stored to leak.
- **PayPal webhook** — signature-verified + idempotent (`paypal_webhooks.event_id`),
  reconciles capture/refund even if the browser never calls capture.
- **Customer accounts** (optional; guest checkout still works) — mirror-server's
  proven flow: bcrypt cost 12, timing-constant login, **HS256-pinned JWT carrying
  `pcat`** so a password reset invalidates all existing tokens, SHA-256-hashed
  verify/reset links (single-use, expiring), anti-enumeration forgot-password,
  per-IP rate limits. Guest orders auto-link to an account by email on
  register/login.

Verified: bad-email/weak-password 400, unauthed 401, forgot-password generic
200, capture rejects amount mismatch, download token gates (400/404/410/429).

## Still recommended before going live
- Flip PayPal sandbox → live only after a real end-to-end capture test.
- Edge WAF / fail2ban; audit logging + alerting; a third-party pen-test.
- Consider hashing preview tokens' equivalents and a periodic grant/token purge job.

## Would round out "enterprise" (infra/process, mostly outside app code)
- Edge WAF / fail2ban on Apache for the whole domain.
- Structured audit logging of admin actions + alerting.
- Secret rotation policy; move secrets to a manager if the team grows.
- Optional AV scan of uploads; stricter MIME sniffing beyond extension.
- A real third-party pen-test before handling live payments.
