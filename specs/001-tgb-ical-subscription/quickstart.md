# Quickstart: TGB iCal 訂閱網站

**Branch**: `001-tgb-ical-subscription` | **Date**: 2026-05-05

## Prerequisites

- Node.js 20+
- npm 10+
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account with D1 and Pages enabled
- GitHub repository (for Actions)

## 1. Clone & Install

```bash
git clone <repo-url>
cd tgb-calendar
npm install   # installs all workspaces
```

## 2. Cloudflare Setup

### Create D1 Database

```bash
wrangler d1 create tgb-calendar
# Copy the database_id from output
```

### Apply Schema

```bash
wrangler d1 execute tgb-calendar --file=db/migrations/001_initial_schema.sql
```

### Configure Wrangler (Worker)

Edit `apps/worker/wrangler.toml`:
```toml
name = "tgb-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "tgb-calendar"
database_id = "<your-database-id>"

[vars]
# SCRAPER_API_KEY is set as a secret (see below)
```

### Set Secrets

```bash
cd apps/worker
wrangler secret put SCRAPER_API_KEY
# Enter a secure random string when prompted
```

## 3. Local Development

### Worker (iCal + API)

```bash
cd apps/worker
npx wrangler dev
# Worker runs at http://localhost:8787
# Test: curl http://localhost:8787/ical/1.ics
```

### Web App (Next.js)

```bash
cd apps/web
npm run dev
# Web app at http://localhost:3000
```

### Run Scraper Manually

```bash
cd packages/scraper
SCRAPER_API_KEY=your-key WORKER_BASE_URL=http://localhost:8787 node index.js
```

## 4. Validation Checklist

After local setup, verify:

- [ ] `GET http://localhost:8787/ical/1.ics` returns `BEGIN:VCALENDAR` (or 404 if no team yet)
- [ ] `POST http://localhost:8787/api/scrape/upsert` without token returns 401
- [ ] `POST http://localhost:8787/api/scrape/upsert` with valid token and minimal payload returns 200
- [ ] `GET http://localhost:3000/zh` shows homepage with search box
- [ ] `GET http://localhost:3000/en` shows English homepage
- [ ] Search for a team name returns results
- [ ] Team page at `/zh/team/1` loads and shows subscribe buttons
- [ ] Scraper runs without errors and inserts data into D1

## 5. Deploy

### Deploy Worker

```bash
cd apps/worker
wrangler deploy
```

### Deploy Web App

```bash
cd apps/web
npm run build
wrangler pages deploy .next --project-name=tgb-calendar
```

Or push to `main` — GitHub Actions `deploy.yml` handles it automatically.

## 6. Configure GitHub Actions

Add these secrets to your GitHub repository:

| Secret | Value |
|--------|-------|
| `SCRAPER_API_KEY` | Same key set in Worker |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages+Worker+D1 permissions |
| `WORKER_BASE_URL` | `https://tgb.ming060.com` |

## 7. DNS Setup

In Cloudflare DNS, add:
```
CNAME  tgb  →  <cloudflare-pages-domain>.pages.dev
```

Worker routes in `wrangler.toml` handle `/ical/*` and `/api/*`; Pages handles all other routes.
