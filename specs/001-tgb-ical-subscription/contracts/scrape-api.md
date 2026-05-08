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
    "gid": 211,
    "name": "2026年第一季和平信義週六男子組隊賽",
  },
  "division": {
    "level_id": 1157,
    "gid": 211,
    "name": "和平信義 C5",
  },
  "teams": [
    {
      "tid": 316,
      "name": "師大公鹿"
    },
  ],
  "team_divisions": [
    {
      "tid": 316,
      "level_id": 211,
      "wins": 10,
      "losses": 2,
      "rank": 1
      }
  ],
  "games": [
    {
      "game_id": 18605,
      "level_id": 211,
      "home_tid": 316,
      "away_tid": 871,
      "scheduled_at": 1741564800,
      "venue": "和平籃球暖身館A場",
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
1. For each team whose games changed: invalidate `team_sync` (set `last_modified_at` = now, clear `ical_cached`, clear `ical_etag`)
