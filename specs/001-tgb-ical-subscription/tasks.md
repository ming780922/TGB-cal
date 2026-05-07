---
description: "Task list for TGB iCal Subscription Website"
---

# Tasks: TGB 籃球聯盟賽程 iCal 訂閱網站

**Input**: Design documents from `/specs/001-tgb-ical-subscription/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: No test tasks generated (not requested in spec).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3 map to spec.md user stories
- Exact file paths included in all descriptions

## Path Conventions

Monorepo root: `/` (repo root)
- Worker backend: `apps/worker/src/`
- Next.js web: `apps/web/app/`
- Scraper: `packages/scraper/`
- DB: `db/migrations/`
- CI: `.github/workflows/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo scaffolding and project initialization for all three deployable units.

- [ ] T001 Create root `package.json` with npm workspaces (`"workspaces": ["apps/*", "packages/*"]`) and dev scripts
- [ ] T002 Initialize `apps/worker/` TypeScript package: `package.json`, `tsconfig.json`, `wrangler.toml` with D1 binding (`DB`) and `[vars]` placeholder for `SCRAPER_API_KEY` secret
- [ ] T003 [P] Initialize `apps/web/` Next.js 14 App Router project: `package.json`, `next.config.ts` with Cloudflare adapter (`@cloudflare/next-on-pages`), `wrangler.toml` for Pages
- [ ] T004 [P] Initialize `packages/scraper/` Node.js 20 package: `package.json` with `cheerio` and `node-fetch` dependencies; no build step required
- [ ] T005 [P] Write `db/migrations/001_initial_schema.sql` with all 7 tables (leagues, divisions, teams, team_divisions, games, team_feed_meta, scrape_runs) and FTS5 virtual table `teams_fts` as defined in data-model.md
- [ ] T006 [P] Create `.github/workflows/scrape.yml`: daily cron at UTC 19:00, `workflow_dispatch`, scrape job with Node 20 setup, and `trigger-deploy` job conditional on `new_teams != '0'`
- [ ] T007 [P] Create `.github/workflows/deploy.yml`: triggers on push to `main`, `workflow_dispatch`, `workflow_call`; runs `npm ci`, `npm run build` in `apps/web`, deploys via `cloudflare/wrangler-action@v3`
- [ ] T008 [P] Set up `next-intl` in `apps/web/`: create `i18n/routing.ts` (locales: `['zh', 'en']`, defaultLocale: `'zh'`), `middleware.ts`, skeleton `i18n/messages/zh.json` and `i18n/messages/en.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, Worker routing, scrape API, and scraper — required before any user story can deliver real data.

**⚠️ CRITICAL**: All user stories depend on D1 having real game data. Complete this phase before Phase 3.

- [ ] T009 Apply `db/migrations/001_initial_schema.sql` to local D1 via `wrangler d1 execute tgb-calendar --local --file=db/migrations/001_initial_schema.sql`; verify all tables exist with `.tables` command
- [ ] T010 Create Worker entry point `apps/worker/src/index.ts`: parse `Request.url`, route `GET /ical/:tid.ics` → ical handler, `POST /api/scrape/upsert` → scrape handler, return 404 for other paths
- [ ] T011 [P] Implement Bearer token auth middleware in `apps/worker/src/auth.ts`: extract `Authorization: Bearer {token}` header, compare to `env.SCRAPER_API_KEY`, return `Response(401)` if mismatch
- [ ] T012 Implement scrape upsert handler in `apps/worker/src/scrape-api.ts`: apply auth middleware; upsert leagues, divisions, teams, team_divisions, games using update logic from data-model.md (future games: compare fields + increment `ical_sequence`; past games: scores only); invalidate `team_feed_meta` for affected tids; update `divisions.last_scraped_at`; insert `scrape_runs` record; return `{ ok, inserted, updated, new_teams }`
- [ ] T013 Implement scraper homepage module `packages/scraper/homepage.js`: fetch `https://tgbleague.com`, parse navigation links matching `division.php?gid={N}&level_id={N}` with Cheerio, return array of `{ gid, level_id }` objects
- [ ] T014 [P] Implement scraper division module `packages/scraper/division.js`: fetch `https://tgbleague.com/division.php?gid={gid}&level_id={level_id}`, parse league metadata, team list (tid + name), standings (wins/losses/rank), and game schedule (game_id, home_tid, away_tid, scheduled_at, venue, scores, status); return structured object matching scrape API request body shape
- [ ] T015 [P] Implement scraper API client `packages/scraper/api-client.js`: POST to `${WORKER_BASE_URL}/api/scrape/upsert` with `Authorization: Bearer ${SCRAPER_API_KEY}` header and JSON body; handle 401/400/500 responses; return parsed response JSON
- [ ] T016 Implement scraper entry point `packages/scraper/index.js`: call homepage.js to get all division ids; for each division check if scrape-eligible (never scraped OR has future games + threshold passed); call division.js then api-client.js; accumulate `new_teams` count; output `new_teams` to stdout for GitHub Actions (`console.log('new_teams=' + total)`) and as `GITHUB_OUTPUT`
- [ ] T017 Run scraper locally against real TGB website (`SCRAPER_API_KEY=dev WORKER_BASE_URL=http://localhost:8787 node packages/scraper/index.js`); verify D1 contains leagues, divisions, teams, and games rows; fix any parsing errors

**Checkpoint**: D1 populated with real TGB data — user story implementation can now begin.

---

## Phase 3: User Story 1 - 球隊賽程訂閱到行事曆 (Priority: P1) 🎯 MVP

**Goal**: Users can subscribe to a team's iCal feed from the team page using Apple Calendar, Google Calendar, or by copying the link.

**Independent Test**: Navigate to `/zh/team/{any-tid}` → See three subscription buttons → Click "加入 Apple 行事曆" → Device opens Calendar app with subscription prompt showing team games.

### Implementation for User Story 1

- [ ] T018 [P] [US1] Implement venue address map in `apps/worker/src/venue-map.ts`: export `VENUE_MAP: Record<string, string>` with 5 known venues from research.md (verify addresses against Google Maps before use)
- [ ] T019 [P] [US1] Implement iCal text generator in `apps/worker/src/ical.ts`: function `generateIcal(team, games, divisions)` returning RFC 5545 string with VCALENDAR header, PRODID, X-WR-CALNAME, VTIMEZONE (Asia/Taipei static definition), one VEVENT per game (UID, SEQUENCE, DTSTAMP, DTSTART, DTEND+1hr, SUMMARY with score if completed, LOCATION with full address from VENUE_MAP, DESCRIPTION, URL); fold lines > 75 octets; use CRLF throughout
- [ ] T020 [US1] Implement GET `/ical/{tid}.ics` route handler in `apps/worker/src/ical-route.ts`: query D1 for team + all games (JOIN with divisions for league/division labels); check `team_feed_meta` for ETag; return `304 Not Modified` if `If-None-Match` matches or `If-Modified-Since` >= `last_modified_at`; otherwise generate feed via `generateIcal`, cache in `team_feed_meta.cached_ical`, return `200` with `Content-Type: text/calendar`, `ETag`, `Last-Modified`, `Cache-Control: public, max-age=3600`; return `404` if tid not found
- [ ] T021 [US1] Wire `/ical/:tid.ics` route in `apps/worker/src/index.ts` to call ical-route handler
- [ ] T022 [US1] Create team page server component `apps/web/app/[locale]/team/[tid]/page.tsx`: implement `generateStaticParams` querying all tids from D1 at build time; fetch team name for the page header; render page shell with team name heading and subscription section
- [ ] T023 [US1] Add subscription section to `apps/web/app/[locale]/team/[tid]/page.tsx`: "加入 Apple 行事曆" button linking to `webcal://tgb.ming060.com/ical/{tid}.ics`; "加入 Google 日曆" button linking to `https://calendar.google.com/calendar/r/settings/addbyurl?url=https%3A%2F%2Ftgb.ming060.com%2Fical%2F{tid}.ics`; CopyButton component for https URL
- [ ] T024 [P] [US1] Create `CopyButton` client component in `apps/web/app/[locale]/team/[tid]/CopyButton.tsx`: use `navigator.clipboard.writeText` on click; show brief "已複製！" / "Copied!" confirmation state
- [ ] T025 [US1] Add subscription UI strings to `apps/web/i18n/messages/zh.json` and `en.json`: keys for button labels ("加入 Apple 行事曆", "Add to Apple Calendar"), copy confirmation, subscription section heading

**Checkpoint**: User Story 1 is fully functional — team page exists with working subscribe buttons; iCal feed returns valid RFC 5545 calendar data.

---

## Phase 4: User Story 2 - 搜尋並找到球隊 (Priority: P2)

**Goal**: Users land on the homepage, type a team name, and are directed to the team page via real-time search results.

**Independent Test**: Open `/zh` → Type "火箭" in search box → Results appear within 500ms → Click result → Arrive at `/zh/team/{tid}`.

### Implementation for User Story 2

- [ ] T026 [P] [US2] Implement `GET /api/teams/search?q=` route in `apps/web/app/api/teams/search/route.ts`: require `q` param (return 400 if missing); for `q.length >= 2` use FTS5 `SELECT t.tid, t.name, t.active_division_count, t.last_game_at FROM teams t JOIN teams_fts f ON f.rowid = t.tid WHERE teams_fts MATCH '{q}*' ORDER BY rank LIMIT 20`; for `q.length == 1` use `WHERE t.name LIKE '%{q}%' LIMIT 20`; return `{ results: [...] }`
- [ ] T027 [P] [US2] Create homepage server component `apps/web/app/[locale]/page.tsx`: fetch top 8 teams by `active_division_count DESC, last_game_at DESC` from D1 as hot teams; render page with TeamSearch and HotTeams components
- [ ] T028 [US2] Create `TeamSearch` client component in `apps/web/app/[locale]/components/TeamSearch.tsx`: controlled input with 200ms debounce; fetch `/api/teams/search?q={value}` on input change; render result list with team names linking to `/[locale]/team/[tid]`; show "查無此球隊" / "No teams found" when results empty; show nothing when input empty
- [ ] T029 [P] [US2] Create `HotTeams` component in `apps/web/app/[locale]/components/HotTeams.tsx`: renders a grid of team name links (passed as props from page.tsx server component)
- [ ] T030 [US2] Add homepage and search strings to `apps/web/i18n/messages/zh.json` and `en.json`: search placeholder, no results message, hot teams section heading, page title
- [ ] T031 [P] [US2] Create locale layout `apps/web/app/[locale]/layout.tsx`: set html `lang` attribute from locale; render site header with logo/name, locale switcher (zh↔en links), and `<main>` wrapper

**Checkpoint**: User Stories 1 AND 2 work independently — homepage search finds teams and links to team pages with subscribe buttons.

---

## Phase 5: User Story 3 - 查看球隊賽程資訊 (Priority: P3)

**Goal**: Team page shows current season standings, upcoming games, and completed game scores before the user decides to subscribe.

**Independent Test**: Open `/zh/team/{tid}` for a team with active season → See league name, division, win/loss record, next game details; for a team with no active season → See grayed-out past season marked "已結束".

### Implementation for User Story 3

- [ ] T032 [P] [US3] Extend `apps/web/app/[locale]/team/[tid]/page.tsx` data fetching: query active divisions for team (JOIN team_divisions, divisions, leagues WHERE last_game_at > now()); query game schedule (next 5 upcoming + recent 5 completed); query scheduled game count per division
- [ ] T033 [US3] Render active season list on team page `apps/web/app/[locale]/team/[tid]/page.tsx`: for each active division show league name, division label (e.g., "2025春季甲組"), wins/losses, rank if available, scheduled game count, next game date + opponent name + venue
- [ ] T034 [US3] Render past season fallback in `apps/web/app/[locale]/team/[tid]/page.tsx`: if no active divisions, query most recent past division (last_game_at <= now()) and render with gray "已結束" / "Ended" badge
- [ ] T035 [P] [US3] Render completed games section on team page: list games with `status = 'completed'`, show formatted date, opponent, final score (`home_score - away_score`)
- [ ] T036 [US3] Add `generateMetadata` to `apps/web/app/[locale]/team/[tid]/page.tsx`: `title`: "{team.name} 賽程 | TGB iCal 訂閱"; `description`: includes team name, current season label, league name; `alternates.languages` for hreflang (`zh` → `/zh/team/{tid}`, `en` → `/en/team/{tid}`)
- [ ] T037 [US3] Implement `apps/web/app/sitemap.ts`: query all `tid` values from D1 teams table; return array of both `/zh/team/{tid}` and `/en/team/{tid}` URLs with `lastModified` from `team.updated_at`
- [ ] T038 [US3] Add team page display strings to `apps/web/i18n/messages/zh.json` and `en.json`: standings labels (勝/負/排名), schedule section headings, "已結束" badge, date/score formatting labels, game count label, next game label

**Checkpoint**: All three user stories work independently — full team page with schedule, standings, and subscribe buttons.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Legal pages, error handling, and end-to-end validation.

- [ ] T039 [P] Create Terms of Use page `apps/web/app/[locale]/terms/page.tsx`: include data source attribution (TGB官方網站), disclaimer (accuracy not guaranteed, defer to TGB official announcements), no commercial use restriction; add zh/en strings to message files
- [ ] T040 [P] Create Privacy Policy page `apps/web/app/[locale]/privacy/page.tsx`: state no login required, no personal data collected, Cloudflare may log access data, link to Cloudflare privacy policy; add zh/en strings to message files
- [ ] T041 Add footer to `apps/web/app/[locale]/layout.tsx` with links to Terms and Privacy pages (locale-aware paths)
- [ ] T042 [P] Create `apps/web/app/[locale]/team/[tid]/not-found.tsx`: render user-friendly "找不到此球隊" / "Team not found" page with link back to homepage
- [ ] T043 Apply D1 schema to production Cloudflare D1 via `wrangler d1 execute tgb-calendar --file=db/migrations/001_initial_schema.sql`; add `SCRAPER_API_KEY` Worker secret via `wrangler secret put`; set GitHub Actions secrets (`SCRAPER_API_KEY`, `CLOUDFLARE_API_TOKEN`, `WORKER_BASE_URL`)
- [ ] T044 Deploy Worker via `wrangler deploy` from `apps/worker/`; verify `GET https://tgb.ming060.com/ical/1.ics` returns valid iCal; verify `POST /api/scrape/upsert` without token returns 401
- [ ] T045 Run quickstart.md validation checklist end-to-end: verify iCal feed imports successfully into Apple Calendar and Google Calendar; verify sitemap.xml is accessible and contains all team URLs

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; T002–T008 all parallelizable
- **Foundational (Phase 2)**: Depends on T005 (schema) for T009; T010 required before T012 (routing must exist before handlers); T013–T016 parallelizable once T010 done; T017 requires T016 + running Worker
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion (real data in D1); T018–T019 parallelizable; T020–T021 depend on T019; T022–T025 are web app work that can proceed in parallel with Worker work
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion (teams in D1); independent of User Story 1
- **User Story 3 (Phase 5)**: Depends on Phase 2 completion (games in D1); T032 extends T022 from US1
- **Polish (Phase 6)**: Depends on all user stories being substantially complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on US2 or US3 — team page accessible directly by URL
- **User Story 2 (P2)**: No dependency on US1 or US3 — homepage search works independently
- **User Story 3 (P3)**: Extends team page from US1 (adds data to existing page)

### Within Each User Story

- Worker tasks (T018–T021) and web tasks (T022–T025) are independent and can run in parallel
- Models before services before routes (T010 → T011 → T012)
- Scraper modules (T013, T014, T015) before entry point (T016)

### Parallel Opportunities

- Phase 1: T003, T004, T005, T006, T007, T008 all parallel after T001
- Phase 2: T011 parallel with T014, T015; T013 can start immediately
- Phase 3: Worker work (T018–T021) parallel with web work (T022–T025); T018, T019 parallel with each other
- Phase 4: T026, T027, T029, T031 all parallel; T028 depends on T026
- Phase 5: T032, T035 parallel; T034 parallel with T033

---

## Parallel Example: User Story 1

```bash
# Launch Worker tasks in parallel:
Task: "Implement venue map in apps/worker/src/venue-map.ts"            # T018
Task: "Implement iCal generator in apps/worker/src/ical.ts"           # T019

# After T019 completes, launch:
Task: "Implement GET /ical/{tid}.ics handler in apps/worker/src/ical-route.ts"  # T020

# In parallel with Worker tasks, launch web tasks:
Task: "Create team page server component apps/web/app/[locale]/team/[tid]/page.tsx"  # T022
Task: "Create CopyButton component in apps/web/app/[locale]/team/[tid]/CopyButton.tsx"  # T024
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — get real data into D1 (CRITICAL)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Navigate to a team page; subscribe to their iCal in Apple Calendar; verify games appear; update a game in D1 manually and verify calendar updates
5. Deploy if working

### Incremental Delivery

1. Setup + Foundational → D1 has real data
2. User Story 1 → iCal feed + subscribe buttons → **MVP deployed**
3. User Story 2 → Homepage search → Users can now discover teams
4. User Story 3 → Full team info → Users can see schedule before subscribing
5. Polish → Legal pages, production deploy

### Parallel Team Strategy

With two developers:
- Dev A: Worker (T010–T012, T018–T021, T044) + Scraper (T013–T017)
- Dev B: Next.js web app (T003, T008, T022–T031, T036–T041)
- Coordinate on: D1 schema (T005), shared i18n message structure (T008, T025, T030, T038)

---

## Notes

- `[P]` = parallelizable (different files, no incomplete dependencies)
- `[USn]` maps task to user story for traceability
- Phase 2 (Foundational) is the critical path — without real TGB data in D1, no user story can be validated
- T017 (running scraper) is a manual validation step; retry until TGB website parses correctly
- Venue addresses in T018 MUST be verified against Google Maps before production deploy (constitution requirement)
- Commit after each phase or logical task group
