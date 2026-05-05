# Contract: Scrape Upsert API

**Service**: Cloudflare Worker (`apps/worker`)
**Version**: 1.0
**Auth**: Bearer token (`Authorization: Bearer {SCRAPER_API_KEY}`)

## Endpoint

```
POST /api/scrape/upsert
```

### Authentication

All requests MUST include:
```
Authorization: Bearer {SCRAPER_API_KEY}
```

Returns `401 Unauthorized` if token is missing or incorrect.

### Request Body

```json
{
  "league": {
    "gid": 12,
    "name": "台北和平週六聯盟",
    "venue_area": "台北",
    "day_of_week": "週六",
    "gender": "男生",
    "league_type": "regular"
  },
  "division": {
    "level_id": 345,
    "gid": 12,
    "season_label": "2025春季",
    "division_label": "甲組",
    "full_title": "2025春季甲組",
    "first_game_at": 1741478400,
    "last_game_at": 1748044800,
    "team_count": 8
  },
  "teams": [
    {
      "tid": 42,
      "name": "火箭隊",
      "name_normalized": "火箭隊"
    }
  ],
  "team_divisions": [
    {
      "tid": 42,
      "level_id": 345,
      "wins": 3,
      "losses": 1,
      "draws": 0,
      "rank": 2
    }
  ],
  "games": [
    {
      "game_id": 9001,
      "level_id": 345,
      "home_tid": 42,
      "away_tid": 55,
      "scheduled_at": 1741564800,
      "scheduled_at_local": "20250310T190000",
      "venue": "和平籃球館",
      "home_score": null,
      "away_score": null,
      "status": "scheduled"
    }
  ]
}
```

**Notes**:
- `league` and `division` fields are required
- `teams`, `team_divisions`, `games` may be empty arrays if nothing changed
- `scheduled_at` is Unix timestamp (UTC)
- `scheduled_at_local` is `YYYYMMDDTHHmmSS` (no timezone suffix; always Asia/Taipei)
- `home_score` and `away_score` are null for future/scheduled games

### Response: 200 OK

```json
{
  "ok": true,
  "inserted": {
    "leagues": 0,
    "divisions": 1,
    "teams": 1,
    "games": 3
  },
  "updated": {
    "leagues": 0,
    "divisions": 0,
    "teams": 0,
    "games": 1
  },
  "new_teams": 1
}
```

**`new_teams`**: Count of teams newly inserted (not previously in DB). Used by scrape.yml to decide whether to trigger a deploy (new static pages needed).

### Response: 400 Bad Request

```json
{ "error": "Missing required field: division.level_id" }
```

### Response: 401 Unauthorized

```json
{ "error": "Unauthorized" }
```

### Response: 500 Internal Server Error

```json
{ "error": "Database error", "detail": "..." }
```

---

## Side Effects

After upserting games, the Worker MUST:
1. For each team whose games changed: invalidate `team_feed_meta` (set `last_modified_at` = now, clear `cached_ical`, regenerate `etag`)
2. Update `divisions.last_scraped_at` = now
3. Insert a `scrape_runs` record with final status and row counts
