# Implementation Plan: TGB 籃球聯盟賽程 iCal 訂閱網站

**Branch**: `001-tgb-ical-subscription` | **Date**: 2026-05-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-tgb-ical-subscription/spec.md`

## Summary

Build a Cloudflare-hosted iCal subscription service for TGB Basketball League (tgbleague.com). A daily GitHub Actions scraper fetches game schedules and writes them via a protected Worker API to a Cloudflare D1 database. A Cloudflare Worker serves RFC 5545-compliant iCal feeds per team with HTTP caching. A Next.js frontend (Cloudflare Pages) provides bilingual (zh/en) team search and subscription entry points, with static team pages for SEO.

## Technical Context

**Language/Version**: TypeScript / Node.js 20 (scraper + Worker + Next.js)
**Primary Dependencies**: Next.js 14+ (App Router), next-intl, Cloudflare Workers Runtime, Wrangler v3, Cheerio (scraping)
**Storage**: Cloudflare D1 (SQLite) — bindings via Wrangler
**Testing**: Vitest (unit), Playwright (E2E), no TDD mandate
**Target Platform**: Cloudflare Pages (web), Cloudflare Workers (iCal + API), GitHub Actions (scraper, cron)
**Project Type**: Fullstack web service (monorepo: web app + edge worker + scraper package)
**Performance Goals**: iCal feed response < 200ms (cached), search API < 500ms, Cloudflare CDN cache for static pages
**Constraints**: Cloudflare free-tier limits; D1 write limits; scraper runs max once/day; no user accounts; no paid infrastructure
**Scale/Scope**: ~100–500 teams, ~5,000 games/season; low traffic (basketball fans, not mass consumer)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Note**: Constitution file (`.specify/memory/constitution.md`) is not yet finalized — it was initialized from the template but not yet filled. The `/speckit-constitution` command was interrupted. Constitution check is based on the project principles inferred from TGB-cal.md.

**Inferred project principles** (to be formalized in constitution):

| Gate | Status | Notes |
|------|--------|-------|
| Cloudflare-first architecture | PASS | All compute on CF Pages + Workers + D1 |
| No external backend dependencies | PASS | Worker is the single backend; scraper calls Worker API |
| iCal RFC 5545 compliance | PASS | Planned: UID, SEQUENCE, DTSTAMP, TZID all included |
| Secure scraper API | PASS | Bearer token auth on `/api/scrape/upsert` |
| Bilingual (zh/en) required | PASS | next-intl planned from the start |
| SEO static pages | PASS | generateStaticParams at build time |
| Data attribution | PASS | Terms page required (FR-013) |

**Gate result**: PROCEED — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-tgb-ical-subscription/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── ical-feed.md
│   └── scrape-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
tgb-calendar/
├── apps/
│   ├── web/                          # Next.js 14 frontend (Cloudflare Pages)
│   │   ├── app/
│   │   │   └── [locale]/
│   │   │       ├── page.tsx          # Homepage: search + hot teams
│   │   │       ├── team/
│   │   │       │   └── [tid]/
│   │   │       │       └── page.tsx  # Team page: schedule + subscribe
│   │   │       ├── privacy/
│   │   │       │   └── page.tsx
│   │   │       └── terms/
│   │   │           └── page.tsx
│   │   ├── app/sitemap.ts            # Auto-generated sitemap
│   │   ├── app/api/
│   │   │   └── teams/
│   │   │       └── search/
│   │   │           └── route.ts      # GET /api/teams/search?q=
│   │   ├── i18n/
│   │   │   ├── messages/
│   │   │   │   ├── zh.json
│   │   │   │   └── en.json
│   │   │   └── routing.ts
│   │   ├── package.json
│   │   └── wrangler.toml             # Cloudflare Pages config
│   │
│   └── worker/                       # Cloudflare Worker (iCal + scrape API)
│       ├── src/
│       │   ├── index.ts              # Router entry point
│       │   ├── ical.ts               # iCal feed generator
│       │   ├── scrape-api.ts         # /api/scrape/upsert handler
│       │   └── venue-map.ts          # Static venue → address map
│       ├── package.json
│       └── wrangler.toml             # Worker config + D1 binding
│
├── packages/
│   └── scraper/                      # Node.js scraper (GitHub Actions)
│       ├── index.js                  # Entry point, outputs new_teams count
│       ├── homepage.js               # Scrape gid+level_id from TGB homepage
│       ├── division.js               # Scrape team list + games per division
│       └── api-client.js             # POST to Worker /api/scrape/upsert
│
├── db/
│   └── migrations/
│       └── 001_initial_schema.sql    # D1 schema (leagues, divisions, teams, games, etc.)
│
└── .github/
    └── workflows/
        ├── scrape.yml                # Daily cron + manual trigger
        └── deploy.yml                # On push to main + workflow_call
```

**Structure Decision**: Monorepo with three separate deployable units (`apps/web`, `apps/worker`, `packages/scraper`). Each has its own `package.json`. The scraper is a plain Node.js package (no bundling), the Worker uses Wrangler, and the web app uses Next.js with Cloudflare adapter.

## Complexity Tracking

> No constitution violations — complexity tracking not required.
