# TGB Calendar (tgb-cal)

TGB Basketball League schedule iCal subscription service. Subscribe to team schedules in Apple Calendar or Google Calendar.

## Project Overview

TGB Calendar is a full-stack monorepo designed to scrape, store, and serve basketball game schedules from the TGB Basketball League website as iCal feeds.

### Architecture
- **Frontend (`apps/web`)**: Next.js 14 (App Router) application deployed on Cloudflare Pages. Supports bilingual (zh/en) team search and static team pages.
- **Backend (`apps/worker`)**: Cloudflare Workers serving iCal feeds (`/ical/{tid}.ics`) and providing a protected API for data ingestion.
- **Scraper (`packages/scraper`)**: Node.js application using Cheerio to scrape the TGB website, triggered daily by GitHub Actions.
- **Database**: Cloudflare D1 (SQLite) with FTS5 for full-text team search.
- **CI/CD**: GitHub Actions for automated scraping and deployment.

## Tech Stack
- **Frameworks**: Next.js 14, Cloudflare Workers
- **Language**: TypeScript (Apps/Worker), Node.js (Scraper)
- **Styling**: Vanilla CSS (TailwindCSS avoided for flexibility)
- **i18n**: `next-intl`
- **Database**: Cloudflare D1 (SQLite)
- **iCal**: RFC 5545 compliant generator

## Project Structure
- `apps/web`: Next.js frontend (Cloudflare Pages)
- `apps/worker`: Cloudflare Worker (iCal + API)
- `packages/scraper`: Node.js scraper
- `db/migrations`: D1 schema migrations
- `specs/`: Detailed project documentation, plans, and research

## Building and Running

### Prerequisites
- Node.js >= 20
- pnpm

### Development
- `pnpm dev`: Start both frontend and worker concurrently (recommended)
- `pnpm dev:web`: Start Next.js frontend only
- `pnpm dev:worker`: Start Worker only
- `pnpm db:migrate`: Apply D1 migrations locally to root `.wrangler/state`
- `pnpm scrape`: Run the scraper locally

### Building
- `pnpm build:web`: Build the frontend for Cloudflare Pages
- `pnpm --filter @tgb-calendar/worker build`: Typecheck the worker

### Deployment
- **Worker**: `pnpm --filter @tgb-calendar/worker deploy`
- **Web**: Deployed via Cloudflare Pages GitHub integration
- **Database**: `npx wrangler d1 migrations apply tgb-calendar --remote`

## Development Conventions

### Documentation
All major features and design decisions are documented in the `specs/` directory. Refer to:
- `specs/001-tgb-ical-subscription/spec.md`: Main feature specification.
- `specs/001-tgb-ical-subscription/plan.md`: Implementation plan.
- `specs/001-tgb-ical-subscription/data-model.md`: Database schema details.

### i18n
The project uses `next-intl` for bilingual support (zh/en). Localized messages are in `apps/web/i18n/messages/`.

### Standards
- **iCal**: Feeds must be RFC 5545 compliant (UID, SEQUENCE, DTSTAMP, TZID).
- **Security**: Scraper API (`/api/scrape/upsert`) is protected by `SCRAPER_API_KEY`.
- **Database**: Use migrations for all schema changes in `db/migrations/`.
