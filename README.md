# tgb-cal

TGB 籃球聯盟賽程 iCal 訂閱網站。訂閱球隊賽程至 Apple Calendar 或 Google Calendar。

TGB Basketball League schedule iCal subscription site. Subscribe to team schedules in Apple Calendar or Google Calendar.

## Project Structure

```
tgb-cal/
├── apps/
│   ├── web/          # Next.js 14 frontend (Cloudflare Pages)
│   └── worker/       # Cloudflare Worker (iCal feed + scrape API)
├── packages/
│   └── scraper/      # Node.js scraper (TGB website → Worker API)
├── db/
│   └── migrations/   # D1 schema migrations
└── .github/
    └── workflows/    # Scrape cron + deploy CI
```

## Features

- iCal feed at `GET /ical/{tid}.ics` — subscribe in any calendar app
- Team pages at `/zh/team/{tid}` and `/en/team/{tid}` with subscribe buttons
- Homepage with team search and hot teams listing
- Bilingual UI (Traditional Chinese / English)
- Automatic daily scrape from TGB official website

## Quick Start

See [`specs/001-tgb-ical-subscription/quickstart.md`](specs/001-tgb-ical-subscription/quickstart.md) for full setup and deployment instructions.

## Tech Stack

- **Frontend**: Next.js 14 App Router, next-intl, Cloudflare Pages
- **Backend**: Cloudflare Workers (TypeScript)
- **Database**: Cloudflare D1 (SQLite) with FTS5 full-text search
- **Scraper**: Node.js + Cheerio
- **CI/CD**: GitHub Actions

## License

Personal use only. Schedule data sourced from [TGB official website](https://www.tgbleague.com).
