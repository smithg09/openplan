# Deploying opendocs (site, web app, backend, database)

Three pieces, all deployable for **$0**:

| Piece | What it is | Where it goes | Free-tier catch |
|---|---|---|---|
| Landing page + web app | Static files: `opendocs.smithgajjar.dev/` and `/app/` | **Cloudflare Pages** | none that matter at this scale |
| Backend | `opendocs-proxy`, a single Go binary (Docker image) | **Render** free web service | sleeps after ~15 min idle; first request takes ~1 min |
| Database | PostgreSQL | **Neon** free Postgres | 0.5 GB; compute suspends when idle (small wake-up delay) |

Why this combination, and not Render's own Postgres: Render's free Postgres is deleted ~30 days after creation, so it is not usable for a long-lived hosted default. Neon's free database has no expiry.

> **Verify prices before you commit.** Free tiers change often and the figures below come from vendor pages and third-party write-ups gathered on 2026-11-05. Each section links the vendor page to re-check.

---

## 0. Before you start

- A GitHub repo with this code on `main` (merge the PR first; Render and Cloudflare deploy from it).
- Free accounts: [Neon](https://neon.com), [Render](https://render.com), [Cloudflare](https://dash.cloudflare.com).
- Control of the DNS for `smithgajjar.dev` (it already serves `openplan.smithgajjar.dev` through GitHub Pages).
- `bun`, `git` and `gh` locally if you want to run the checks at the end.

## 1. Database: Neon (≈5 min)

1. Create a Neon project (any region close to your Render region).
2. In **Connect**, choose the **direct** connection string (host *without* `-pooler`) and copy it. It looks like  
   `postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`
   - Use the direct string, not the pooled one: the proxy uses prepared statements, which PgBouncer's transaction mode breaks.
3. Keep it handy; you paste it into Render in step 2. The proxy creates its tables itself on first start.

Free-plan limits (per [Neon's FAQ](https://neon.com/faqs/free-plan-limits-and-quotas)): 0.5 GB storage per project, 100 compute-hours per month, 5 GB transfer per month. Idle time while suspended is not counted. A document is its HTML plus comments, so 0.5 GB holds thousands of typical documents.

## 2. Backend: Render (≈10 min)

1. Render dashboard → **New → Blueprint** → select this repo. It reads `render.yaml` and proposes one web service, `opendocs-proxy`.
2. Set the one secret it asks for, **`DATABASE_URL`**, to the Neon string from step 1. (`OPENDOCS_SIGNING_KEY` is generated for you; `OPENDOCS_CORS_ORIGINS` is already `https://opendocs.smithgajjar.dev`.)
3. Apply. The first build takes a few minutes (it compiles the UI and the Go binary in Docker).
4. Open `https://<your-service>.onrender.com/healthz` → `{"ok":true}`.
5. **Check the URL.** The code assumes `https://opendocs-proxy.onrender.com`. If Render gave you something else, change it in three places and redeploy:
   - `apps/cli/internal/opendocs/remote/remote.go` → `HostedURL`
   - `apps/opendocs-ui/src/env.ts` → `DEFAULT_PROXY` (or set `VITE_DEFAULT_PROXY` in the Pages build)
   - nothing else needs the URL.

Free web service behaviour, per [Render's own article](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026.md): 750 free instance hours per workspace per month; the service **spins down after 15 minutes without traffic and takes about a minute to start again**. The first publish after a quiet period will be slow; reads and comments are normal once it is awake. To avoid the wake-up delay, either upgrade this one service to the cheapest paid instance, or ping `/healthz` every ~10 minutes with a free uptime monitor (one always-on service fits inside the 750 hours).

Notes:
- Rate limits are on by default (20 new documents per hour and 120 other writes per minute per client IP); `--trust-proxy` is already set in `render.yaml` so Render's client IP is used.
- Live updates (SSE) are in-process, which is correct for a single instance. Do not scale this service past one instance without adding a shared message bus.

## 3. Site and web app: Cloudflare Pages (≈15 min)

The workflow `.github/workflows/opendocs-site.yml` builds the landing page and the web app and uploads them to a Pages project named `opendocs`.

1. **Create the project** (once). Cloudflare → *Workers & Pages* → *Create* → *Pages* → *Direct Upload* → name it `opendocs` (upload any placeholder file; the workflow replaces it).
2. **API token.** *My Profile → API Tokens → Create Token →* template **Edit Cloudflare Workers** or a custom token with **Account → Cloudflare Pages → Edit**. Copy it.
3. **Account ID.** Shown on the right of the Workers & Pages overview.
4. **GitHub secrets and variable** (repo → Settings → Secrets and variables → Actions):
   - secret `CLOUDFLARE_API_TOKEN`
   - secret `CLOUDFLARE_ACCOUNT_ID`
   - *variable* `OPENDOCS_SITE_ENABLED` = `true`
5. Run it: GitHub → Actions → **Deploy opendocs site (Cloudflare Pages)** → *Run workflow*. (It also runs on pushes to `main` that touch the site, the UI or the shared packages.)
6. **Custom domain.** Pages project → *Custom domains* → *Set up a domain* → `opendocs.smithgajjar.dev`.
   - If `smithgajjar.dev` DNS is on Cloudflare, it adds the record for you.
   - If DNS is elsewhere (likely, since GitHub Pages serves `openplan.`), add a **CNAME**: `opendocs` → `opendocs.pages.dev` at your DNS provider, then finish verification in Cloudflare.
7. `public/_redirects` already gives `/app/d/*` single-page routing.

## 4. Verify end to end

```bash
# site and app
curl -sI https://opendocs.smithgajjar.dev/ | head -1
curl -sI https://opendocs.smithgajjar.dev/app/ | head -1

# backend is up and the web app's origin is allowed (expect 204 and an Allow-Origin header)
curl -si -X OPTIONS https://<your-service>.onrender.com/api/docs \
  -H 'Origin: https://opendocs.smithgajjar.dev' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type' | head -8
```

Then in a browser:
1. Open `https://opendocs.smithgajjar.dev/app/` → the sample document appears.
2. **Share → Publish and get links** (it uses the hosted default proxy). Wait up to a minute if the backend was asleep.
3. Copy the *commenter* link, open it in a private window, add a comment, and watch it appear live in the first window.
4. Open `https://opendocs.smithgajjar.dev/app/d/<id>?proxy=https://<your-service>.onrender.com#t=<token>` to see the same document inside the web app.

## 5. Release the binaries

Merge the PR, then:

```bash
git checkout main && git pull
git tag v0.6.0 && git push origin v0.6.0
```

`release.yml` publishes the `openplan`, `opendocs` and `opendocs-proxy` tarballs. Then check the installer:

```bash
curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash -s opendocs
```

If Claude Code is found (`~/.claude`) the installer also installs the opendocs skill (it skips that when the openplan plugin, which bundles the skill, is already installed).

---

## Free alternatives for the backend and database

| Option | Backend | Database | Verdict |
|---|---|---|---|
| **Render + Neon** (recommended) | Render free web service | Neon free Postgres | No card needed. Cold starts on both; fine for a hosted default. |
| **Cloud Run + Neon** | [Cloud Run](https://cloud.google.com/run/pricing) free allowance (about 2M requests, 180k vCPU-s, 360k GiB-s per month) | Neon | Scales to zero like Render but with a shorter wake-up. Needs a billing account (card). Container disk is ephemeral, so Postgres is required (SQLite would lose data). |
| **Oracle Cloud Always Free VM** | One free ARM VM (reported **cut to about 2 OCPU / 12 GB in mid-2026**; verify) | Postgres or SQLite **on the same VM** | No sleeping and no 0.5 GB cap, but needs a card, capacity can be hard to get, you manage the OS and TLS (put Caddy in front), and trial-expiry rules are strict. Best if you want SQLite on a persistent disk (`--store sqlite`). |
| Koyeb | Free web service + a small free Postgres | | Terms are unclear since its acquisition (sources conflict on whether a card is needed); check [koyeb.com/pricing](https://www.koyeb.com/pricing) first. |
| Supabase | n/a (database only) | Free Postgres | **Pauses after a week of inactivity**, which is a bad fit for a hosted default. Fine for a side project you visit often. |
| Fly.io | n/a | n/a | **No free allowance for new accounts** (a short trial only). |
| Render Postgres (free) | | | Deleted ~30 days after creation. Don't use for anything lasting. |

To run on the Oracle/any-VM route with SQLite:

```bash
docker run -d --name opendocs --restart unless-stopped -p 127.0.0.1:7435:7435 \
  -v opendocs-data:/data -e OPENDOCS_SIGNING_KEY="$(openssl rand -hex 32)" \
  -e OPENDOCS_CORS_ORIGINS=https://opendocs.smithgajjar.dev \
  ghcr.io/<you>/opendocs-proxy:latest --trust-proxy   # or build it: docker build -f Dockerfile.opendocs-proxy .
# then put Caddy/nginx in front for HTTPS and point DNS at it
```

(Image publishing to a registry isn't set up in this repo; build it on the VM with `docker build -f Dockerfile.opendocs-proxy -t opendocs-proxy .`.)

## Operating it

- **Backups.** Neon's free plan keeps limited history; run `pg_dump "$DATABASE_URL" > opendocs.sql` on a schedule (a monthly GitHub Action works) for anything you care about.
- **Signing key.** `OPENDOCS_SIGNING_KEY` only signs short-lived frame URLs; rotating it just invalidates open tabs' frame links for a few minutes. Share links are unaffected (they are stored as hashes in the database).
- **Abuse.** `POST /api/docs` is the only unauthenticated write. Tune `--create-per-hour` and `--writes-per-min` if the hosted instance gets traffic.
- **Costs to watch.** Neon: 0.5 GB and 100 compute-hours. Render: 750 hours. Cloudflare Pages: effectively unlimited for static files.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Share → Publish spins for a minute, then works | Render service was asleep (expected on the free plan). |
| "could not reach … does it allow https://opendocs.smithgajjar.dev?" | `OPENDOCS_CORS_ORIGINS` missing or not an exact match (scheme and host, no trailing path). |
| Backend crashes at start with a database error | Used Neon's *pooled* string, or forgot `sslmode=require`. Use the direct string. |
| `/app/d/<id>` shows a 404 | `_redirects` not deployed; redeploy the Pages project. |
| Web app says the proxy URL must be https | Only `https://` (or `http://localhost`) proxies are accepted. |
