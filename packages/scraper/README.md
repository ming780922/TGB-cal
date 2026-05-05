# TGB Calendar Scraper

Scrapes TGB basketball league schedules from tgbleague.com and writes them to the Cloudflare Worker API.

## Prerequisites

- Node.js 20+
- Running Cloudflare Worker (local or production)
- Valid `SCRAPER_API_KEY`

## Local Development

Start the Worker first:
```bash
cd apps/worker && npx wrangler dev
```

Then run the scraper:
```bash
cd packages/scraper
SCRAPER_API_KEY=your-dev-key WORKER_BASE_URL=http://localhost:8787 node index.js
```

## Validation

After a successful run, check D1:
```bash
wrangler d1 execute tgb-calendar --local --command="SELECT COUNT(*) FROM teams"
wrangler d1 execute tgb-calendar --local --command="SELECT COUNT(*) FROM games"
wrangler d1 execute tgb-calendar --local --command="SELECT * FROM scrape_runs ORDER BY run_id DESC LIMIT 5"
```

## GitHub Actions

The scraper runs automatically via `.github/workflows/scrape.yml` daily at Taiwan time 03:00.

Required secrets:
- `SCRAPER_API_KEY` — same key configured in the Worker
- `WORKER_BASE_URL` — production Worker URL (e.g., https://tgb.ming060.com)
