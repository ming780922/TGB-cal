# Data Model: TGB iCal 訂閱網站

**Branch**: `001-tgb-ical-subscription` | **Date**: 2026-05-05

## Entities

### League（聯盟）

Represents a recurring TGB league series identified by `gid`. Stable across seasons.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| gid | INTEGER | PK | TGB league identifier (from URL) |
| name | TEXT | NOT NULL | Full league name |
| venue_area | TEXT | nullable | Geographic area (e.g., 台北) |
| day_of_week | TEXT | nullable | Regular game day (e.g., 週六) |
| gender | TEXT | nullable | 男生/女生/混合 |
| league_type | TEXT | NOT NULL, CHECK | 'regular' \| 'cup' \| 'special' |
| created_at | INTEGER | NOT NULL | Unix timestamp |
| updated_at | INTEGER | NOT NULL | Unix timestamp |

**Validation rules**:
- `league_type` must be one of: `regular`, `cup`, `special`
- `gid` is the primary key as assigned by TGB website

---

### Division（分組）

A specific group within a specific season of a league. Identified by `level_id`.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| level_id | INTEGER | PK | TGB division identifier (from URL) |
| gid | INTEGER | FK → leagues | Parent league |
| season_label | TEXT | NOT NULL | e.g., "2025春季" |
| division_label | TEXT | nullable | e.g., "甲組" |
| full_title | TEXT | NOT NULL | e.g., "2025春季甲組" |
| first_game_at | INTEGER | nullable | Unix timestamp of first game |
| last_game_at | INTEGER | nullable | Unix timestamp of last game |
| team_count | INTEGER | NOT NULL, DEFAULT 0 | Number of teams in this division |
| last_scraped_at | INTEGER | nullable | Last successful scrape time |
| created_at | INTEGER | NOT NULL | Unix timestamp |
| updated_at | INTEGER | NOT NULL | Unix timestamp |

**Scrape eligibility rules**:
- Never scraped: `last_scraped_at IS NULL` → always scrape
- Has future games: `last_game_at > now()` AND `now() - last_scraped_at > 21600` (6 hours) → scrape
- Past division: skip

---

### Team（球隊）

A team identified by `tid`. Stable across seasons and leagues.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| tid | INTEGER | PK | TGB team identifier |
| name | TEXT | NOT NULL | Display name (e.g., "火箭隊") |
| name_normalized | TEXT | NOT NULL | Lowercase, no spaces (for search) |
| last_game_at | INTEGER | nullable | Most recent game unix timestamp |
| active_division_count | INTEGER | NOT NULL, DEFAULT 0 | Count of current-season divisions |
| created_at | INTEGER | NOT NULL | Unix timestamp |
| updated_at | INTEGER | NOT NULL | Unix timestamp |

**FTS5 virtual table**:
```sql
CREATE VIRTUAL TABLE teams_fts USING fts5(
  name,
  content='teams',
  content_rowid='tid',
  tokenize='unicode61'
);
```

---

### TeamDivision（球隊×分組）

Join table: which teams participate in which divisions, with standings.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| tid | INTEGER | PK, FK → teams | Team |
| level_id | INTEGER | PK, FK → divisions | Division |
| wins | INTEGER | NOT NULL, DEFAULT 0 | Win count |
| losses | INTEGER | NOT NULL, DEFAULT 0 | Loss count |
| rank | INTEGER | nullable | Current rank in division |
| created_at | INTEGER | NOT NULL | Unix timestamp |
| updated_at | INTEGER | NOT NULL | Unix timestamp |

**Cascade**: ON DELETE CASCADE from both `teams` and `divisions`.

---

### Game（比賽）

A single scheduled or completed game.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| game_id | INTEGER | PK | TGB game identifier |
| level_id | INTEGER | FK → divisions | Division this game belongs to |
| home_tid | INTEGER | FK → teams, nullable | Home team |
| away_tid | INTEGER | FK → teams, nullable | Away team |
| scheduled_at | INTEGER | NOT NULL | UTC unix timestamp |
| scheduled_at_local | TEXT | NOT NULL | ISO-like local datetime, e.g., "20250315T190000" |
| venue | TEXT | nullable | Short venue name (for venue map lookup) |
| home_score | INTEGER | nullable | Home team score (null if not yet played) |
| away_score | INTEGER | nullable | Away team score (null if not yet played) |
| status | TEXT | NOT NULL, CHECK | 'scheduled' \| 'completed' \| 'postponed' \| 'cancelled' |
| ical_uid | TEXT | NOT NULL, UNIQUE | `game-{game_id}@tgb.ming060.com` |
| ical_sequence | INTEGER | NOT NULL, DEFAULT 0 | Increment on each update |
| created_at | INTEGER | NOT NULL | Unix timestamp |
| updated_at | INTEGER | NOT NULL | Unix timestamp |

**Update logic** (scraper):
```
game_id not found → INSERT, ical_sequence = 0

game_id found AND scheduled_at > now() (future game):
  - Compare: scheduled_at, venue, home_tid, away_tid, status
  - Difference found → UPDATE + ical_sequence += 1
  - No difference → skip

game_id found AND scheduled_at <= now() (past game):
  - home_score IS NULL AND scraper has scores → UPDATE scores + ical_sequence += 1
  - Otherwise → skip
```

---

### TeamFeedMeta（iCal 快取）

Per-team iCal cache metadata for HTTP conditional requests.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| tid | INTEGER | PK, FK → teams | Team |
| last_modified_at | INTEGER | NOT NULL | Unix timestamp of last game change |
| game_count | INTEGER | NOT NULL, DEFAULT 0 | Number of games in feed |
| etag | TEXT | NOT NULL | Hash of feed content |
| cached_ical | TEXT | nullable | Full iCal text, cached |
| generated_at | INTEGER | nullable | When cache was generated |

**Cascade**: ON DELETE CASCADE from `teams`.

---

### ScrapeRuns（爬蟲執行紀錄）

Audit log for each scraper execution.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| run_id | INTEGER | PK, AUTOINCREMENT | |
| target_type | TEXT | NOT NULL, CHECK | 'homepage' \| 'division' \| 'game' |
| target_key | TEXT | nullable | e.g., level_id value |
| started_at | INTEGER | NOT NULL | Unix timestamp |
| finished_at | INTEGER | nullable | Unix timestamp |
| status | TEXT | NOT NULL, CHECK | 'running' \| 'success' \| 'failed' \| 'partial' |
| error_message | TEXT | nullable | Error details if failed |
| rows_inserted | INTEGER | NOT NULL, DEFAULT 0 | |
| rows_updated | INTEGER | NOT NULL, DEFAULT 0 | |

---

## Entity Relationships

```text
leagues (gid)
  └── divisions (level_id, FK: gid)
        ├── team_divisions (FK: level_id, tid)
        │     └── teams (tid)
        │           ├── teams_fts (FTS5 virtual, rowid=tid)
        │           └── team_feed_meta (FK: tid)
        └── games (FK: level_id, home_tid, away_tid)
```

## State Transitions

### Game Status

```
[INSERT] → scheduled
scheduled → completed     (scores added after game time)
scheduled → postponed     (scraper detects date change to far future)
scheduled → cancelled     (scraper detects removal from schedule)
postponed → scheduled     (new date assigned)
```

### iCal Feed Invalidation

When any game for team T is updated → invalidate `team_feed_meta` for T:
- `last_modified_at` = now
- `etag` = null (or regenerate immediately)
- `cached_ical` = null
