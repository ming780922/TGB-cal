# D1 Database Setup

## 1. Create D1 Database

```bash
wrangler d1 create tgb-calendar
```

Copy the `database_id` from the output and update it in:
- `apps/worker/wrangler.toml`
- `apps/web/wrangler.toml`

## 2. Apply Schema (Local)

```bash
wrangler d1 execute tgb-calendar --local --file=db/migrations/001_initial_schema.sql
```

## 3. Apply Schema (Production)

```bash
wrangler d1 execute tgb-calendar --file=db/migrations/001_initial_schema.sql
```

## 4. Verify Tables

```bash
wrangler d1 execute tgb-calendar --local --command=".tables"
```

Expected output:
```
divisions  games  leagues  scrape_runs  team_divisions  team_feed_meta  teams  teams_fts
```

## 5. Set Scraper API Key Secret

```bash
cd apps/worker
wrangler secret put SCRAPER_API_KEY
# Enter a secure random string when prompted
```
