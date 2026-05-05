<!--
SYNC IMPACT REPORT
==================
Version change: (template) → 1.0.0
Type: MAJOR — initial ratification; all principles newly defined from template

Modified principles: none (first fill)
Added sections:
  - I. Cloudflare-First Architecture
  - II. Data Integrity & Scrape Safety
  - III. iCal Standards Compliance
  - IV. Zero-Auth Public Service
  - V. SEO & Bilingual Reach
  Security & API Boundary
  Deployment & Operations
  Governance
Removed sections: none (template placeholders replaced)

Templates checked:
  ✅ .specify/templates/plan-template.md — Constitution Check gate aligns with principles I–V
  ✅ .specify/templates/spec-template.md — no mandatory sections added/removed by constitution
  ✅ .specify/templates/tasks-template.md — task types (observability via scrape_runs, versioning via ical_sequence) align
  ⚠  .specify/templates/commands/ — no commands/ subdirectory found; skip

Follow-up TODOs:
  - Venue address map must be manually verified against Google Maps before first deploy (Principle II note)
  - Run /speckit-constitution again if TGB data licensing situation changes
-->

# TGB Calendar Constitution

## Core Principles

### I. Cloudflare-First Architecture

All production compute MUST run exclusively on Cloudflare infrastructure: Pages (Next.js web app),
Workers (iCal feed + scrape API), and D1 (SQLite database). No external backend services,
self-hosted servers, or paid third-party APIs are permitted.

The scraper is the sole exception: it runs in GitHub Actions (ephemeral, free-tier) and MUST
communicate with production only via the Worker's authenticated API — never write to D1 directly.

**Rationale**: Zero ongoing infrastructure cost; edge-native performance globally; single control
plane (Cloudflare dashboard) for all production concerns.

### II. Data Integrity & Scrape Safety

The scraper MUST follow the update logic exactly as specified — no blind overwrites:

- Future games: compare `scheduled_at`, `venue`, `home_tid`, `away_tid`, `status`; update only on
  difference; increment `ical_sequence`
- Past games: update scores only if `home_score IS NULL` and new scores are available; never
  revert a completed game to scheduled
- New games: INSERT with `ical_sequence = 0`

`team_feed_meta` cache MUST be invalidated (etag cleared, `last_modified_at` updated) whenever
any game in a team's schedule changes. Stale cache served to calendar clients is a data integrity
failure.

**Rationale**: Calendar clients rely on `SEQUENCE` for update detection. Spurious increments
cause unnecessary re-downloads; missed increments cause stale calendar data for subscribers.

### III. iCal Standards Compliance

Every feed MUST conform to RFC 5545. Non-negotiable rules:

- `UID` format: `game-{game_id}@tgb.ming060.com` — globally unique, never reused
- `SEQUENCE`: monotonically increasing integer per game; stored in DB
- `DTSTAMP`: current UTC generation time
- `DTSTART`/`DTEND`: always include `TZID=Asia/Taipei`; never use UTC Z-suffix for local times
- Line folding: lines > 75 octets MUST be folded (CRLF + single SPACE)
- Line endings: CRLF throughout
- VTIMEZONE block: MUST be included for offline calendar app compatibility

**Rationale**: Non-compliant feeds break silently in calendar clients. Apple Calendar, Google
Calendar, and Outlook each handle edge cases differently — RFC compliance is the only safe common
denominator.

### IV. Zero-Auth Public Service

The web frontend and iCal feeds MUST require no user account, login, or personal data submission.
All subscription URLs are public and stable (tied to `tid`, which is stable across seasons).

The scraper API (`POST /api/scrape/upsert`) is the only authenticated endpoint, protected by a
Bearer token stored as a Cloudflare Worker secret — never hardcoded, never committed to source.

**Rationale**: The service is a convenience tool for basketball fans. Authentication adds friction
with no benefit. The privacy policy commitment (no personal data collected) depends on this
principle holding.

### V. SEO & Bilingual Reach

Every team MUST have a static page (`/zh/team/{tid}` and `/en/team/{tid}`) generated at build
time via `generateStaticParams`. Pages MUST include:

- `<title>` with team name
- `<meta name="description">` with team name, season, and league
- `hreflang` linking zh and en variants
- Presence in `sitemap.xml`

Both `zh` (Traditional Chinese) and `en` (English) locales MUST be supported in the UI via
`next-intl`. No locale is treated as a fallback — both must be complete.

**Rationale**: TGB participants are primarily Chinese-speaking, but bilingual support enables
international players and broader discoverability. Static generation ensures search engine
indexability without requiring a crawler to execute JavaScript.

## Security & API Boundary

The Worker's `/api/scrape/upsert` endpoint MUST:

- Reject any request without a valid `Authorization: Bearer {SCRAPER_API_KEY}` header with `401`
- Validate all required fields in the request body; reject malformed payloads with `400`
- Never expose internal error details (DB errors, stack traces) in `500` responses to callers

The `SCRAPER_API_KEY` MUST be stored as a Cloudflare Worker secret (not in `wrangler.toml` or
source) and as a GitHub Actions secret. Rotation requires updating both simultaneously.

## Deployment & Operations

- Changes to D1 schema MUST be applied via numbered migration files in `db/migrations/`; no
  ad-hoc schema changes in production
- The scraper runs at most once per day (Taiwan time 03:00 via GitHub Actions cron); manual
  `workflow_dispatch` is permitted for debugging
- A new deploy is triggered automatically only when `new_teams > 0` (new static pages needed);
  non-team-changing scrape runs MUST NOT trigger unnecessary deploys
- Venue address entries MUST be verified against Google Maps before each new venue appears in
  production feeds; the fallback (short name only) is acceptable but SHOULD be resolved promptly

## Governance

This constitution supersedes all other practices and ad-hoc decisions for this project. Amendments
require:

1. Update this file with a new version number following semantic versioning:
   - **MAJOR**: Remove or fundamentally redefine a principle (e.g., allow external backend)
   - **MINOR**: Add a new principle or materially expand an existing one
   - **PATCH**: Clarify wording, fix typos, refine non-semantic details
2. Update the Sync Impact Report comment at the top of this file
3. Re-run `/speckit-constitution` to propagate changes to templates

All implementation decisions MUST be checked against these principles before proceeding. When a
plan's Constitution Check section flags a violation, it MUST be justified in the Complexity
Tracking table or the violation MUST be resolved before implementation begins.

For runtime development guidance, see `specs/001-tgb-ical-subscription/plan.md`.

**Version**: 1.0.0 | **Ratified**: 2026-05-05 | **Last Amended**: 2026-05-05
