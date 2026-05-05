# Research: TGB iCal 訂閱網站

**Branch**: `001-tgb-ical-subscription` | **Date**: 2026-05-05

## R-01: Next.js on Cloudflare Pages (Edge Runtime)

**Decision**: Use Next.js 14 App Router with `@cloudflare/next-on-pages` adapter (or `@opennextjs/cloudflare`)

**Rationale**: Cloudflare Pages supports Next.js via the `next-on-pages` build adapter. App Router is required for RSC (React Server Components), which enables server-side D1 queries at request time (for search API) and static generation (for team pages). `generateStaticParams` produces fully static team pages at build time, giving zero-cold-start performance for the most common use case.

**Key constraints**:
- Edge runtime only: no Node.js built-ins in route handlers or middleware
- D1 is bound as an environment variable (`DB`) in `wrangler.toml`, accessed via `process.env` in Pages
- `next-intl` works in both server and client components; locale routing via `middleware.ts`

**Alternatives considered**:
- Remix on Cloudflare: Good fit but less mature ecosystem for i18n; Next.js has broader next-intl support
- Astro: Excellent for static sites but team search requires server-side API; less suitable

---

## R-02: iCal Feed — RFC 5545 Compliance

**Decision**: Generate raw iCal text in the Cloudflare Worker; no library needed

**Rationale**: The iCal format required is well-defined and limited in scope (VCALENDAR + VTIMEZONE + VEVENT). A lightweight hand-written generator avoids bundle size issues in Workers runtime. Key compliance points:
- `UID`: `game-{game_id}@tgb.ming060.com` — globally unique, stable per game
- `SEQUENCE`: integer incremented on each update (stored as `ical_sequence` in DB)
- `DTSTAMP`: Current UTC timestamp (when feed is generated)
- `DTSTART`/`DTEND`: Asia/Taipei timezone via `TZID=Asia/Taipei` parameter
- `DTEND` = DTSTART + 1 hour (basketball games are typically ~2 hrs but 1hr is safe minimum)
- VTIMEZONE block: Include full Asia/Taipei definition for offline calendar apps
- Line folding: Fold lines longer than 75 octets with CRLF + SPACE

**Alternatives considered**:
- `ical-generator` npm library: Adds ~30KB to Worker bundle; RFC compliance is good but overhead not justified
- Google Calendar API: Requires OAuth; not suitable for public anonymous feeds

---

## R-03: TGB Website Scraping Strategy

**Decision**: Use Cheerio for HTML parsing; scrape homepage for gid+level_id, then scrape each division page

**Rationale**: TGB website (tgbleague.com) renders server-side HTML (no SPA). Cheerio is ~100KB and runs in Node.js (GitHub Actions). The scraper follows a two-phase approach:
1. **Homepage scrape**: Parse navigation links matching pattern `division.php?gid={N}&level_id={N}` to discover all active divisions
2. **Division scrape**: For each division, parse the team table and schedule table

**Scraping rules**:
- Only re-scrape a division if: never scraped OR has future games AND last scraped > threshold (e.g., 6 hours)
- Scraper writes via Worker API (not directly to D1) — keeps write auth centralized
- Rate limit: 1 request/second to TGB server; sequential not parallel

**Alternatives considered**:
- Playwright headless browser: Overkill for server-rendered HTML; too slow for GitHub Actions free tier
- Official API: TGB has no public API

---

## R-04: D1 Search — FTS5 vs LIKE

**Decision**: Use FTS5 virtual table (`teams_fts`) for team name search

**Rationale**: D1 supports SQLite FTS5. The schema already defines `teams_fts`. FTS5 handles partial CJK matching well with `unicode61` tokenizer. For the search API (`/api/teams/search?q=`), query with:
```sql
SELECT t.tid, t.name FROM teams t
JOIN teams_fts f ON f.rowid = t.tid
WHERE teams_fts MATCH '{query}*'
ORDER BY rank
LIMIT 20
```

**Key constraint**: D1 FTS5 supports prefix queries (`word*`) but not infix. For single-character Chinese queries, LIKE fallback may be needed: `WHERE name LIKE '%{q}%'`. Implement both and choose based on query length.

**Alternatives considered**:
- LIKE only: Works for simple cases but O(n) scan, slow at scale
- External search (Algolia, Meilisearch): Out of scope for zero-cost architecture

---

## R-05: HTTP Caching for iCal Feed

**Decision**: Implement ETag + Last-Modified on the Worker; Cache-Control: public, max-age=3600

**Rationale**:
- `team_feed_meta` table stores `etag` (md5/sha256 of feed content) and `last_modified_at` (unix timestamp)
- On GET `/ical/{tid}.ics`:
  1. Query `team_feed_meta` for etag and last_modified_at
  2. If `If-None-Match` header matches etag → return `304 Not Modified`
  3. If `If-Modified-Since` header >= last_modified_at → return `304 Not Modified`
  4. Otherwise generate feed, cache in `cached_ical` column, return `200`
- `Cache-Control: public, max-age=3600` allows Cloudflare CDN to cache the feed for 1 hour

**Note**: etag must be regenerated and `cached_ical` invalidated whenever a game in that team's feed changes (handled by scrape upsert API).

---

## R-06: Monorepo Structure & Build

**Decision**: Single `package.json` workspaces at root; each app has its own build config

**Rationale**: Keeps dependency management simple. Root `package.json` uses npm workspaces:
```json
{ "workspaces": ["apps/*", "packages/*"] }
```
- `apps/web`: `next build` → Cloudflare Pages deployment via Wrangler
- `apps/worker`: `wrangler deploy` for the iCal+API Worker
- `packages/scraper`: Plain `node index.js` in GitHub Actions (no build step)

**Deployment**: Two separate Cloudflare deployments sharing the same D1 database:
- Worker serves `/ical/*` and `/api/*` at `tgb.ming060.com`
- Pages serves the Next.js web UI at `tgb.ming060.com` (different routes)
- Route priority: Worker routes take precedence; Pages handles everything else

**Alternative considered**: Separate repos — rejected because shared D1 schema and coordinated deployment are easier in a monorepo.

---

## R-07: Venue Address Map

**Decision**: Static TypeScript `Record<string, string>` in Worker; addresses verified against Google Maps before deployment

**Known venues** (addresses require manual Google Maps verification before use):
| Short Name | Address (to verify) |
|-----------|---------------------|
| 和平籃球館 | 台北市大安區和平東路一段183號 |
| 信義國中 | 台北市信義區基隆路一段95號 |
| 板橋體育館 | 新北市板橋區莊敬路62號 |
| 中正體育館 | 台北市中正區汀州路三段2號 |
| 永和體育館 | 新北市永和區永和路二段128號 |

**Note**: New venues will appear as scraper discovers them; Worker returns the short name as LOCATION fallback if no map entry exists.
