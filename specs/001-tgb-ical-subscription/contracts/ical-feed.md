# Contract: iCal Feed API

**Service**: Cloudflare Worker (`apps/worker`)
**Version**: 1.0

## Endpoint

```
GET /ical/{tid}.ics
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| tid | integer | Team ID |

### Request Headers (optional)

| Header | Description |
|--------|-------------|
| If-None-Match | ETag from previous response; returns 304 if match |
| If-Modified-Since | HTTP date; returns 304 if not modified since |

### Response: 200 OK (feed returned)

**Headers**:
```
Content-Type: text/calendar; charset=utf-8
Content-Disposition: attachment; filename="{team-name}-schedule.ics"
Cache-Control: public, max-age=3600
ETag: "{sha256-of-content}"
Last-Modified: {HTTP date}
```

**Body**: RFC 5545 iCal text

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ming060//TGB Calendar//ZH
X-WR-CALNAME:{team_name} 賽程
X-WR-TIMEZONE:Asia/Taipei
BEGIN:VTIMEZONE
TZID:Asia/Taipei
BEGIN:STANDARD
DTSTART:19700101T000000
TZNAME:CST
TZOFFSETFROM:+0800
TZOFFSETTO:+0800
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:game-{game_id}@tgb.ming060.com
SEQUENCE:{ical_sequence}
DTSTAMP:{now_utc_yyyymmddThhmmssZ}
DTSTART;TZID=Asia/Taipei:{scheduled_at_local}
DTEND;TZID=Asia/Taipei:{scheduled_at_local + 1hr}
SUMMARY:{home_name} vs {away_name}                   ← if status != completed
SUMMARY:{home_name} {home_score} - {away_score} {away_name}  ← if completed
LOCATION:{full_address} ({venue_short})
DESCRIPTION:{season_label} {division_label}\nhttps://tgbleague.com/division.php?gid={gid}&level_id={level_id}
URL:https://tgbleague.com/division.php?gid={gid}&level_id={level_id}
END:VEVENT
...
END:VCALENDAR
```

**Notes**:
- Lines > 75 octets MUST be folded with CRLF + single SPACE
- CRLF (`\r\n`) line endings throughout
- DTSTART/DTEND format: `YYYYMMDDTHHMMSS` (no Z suffix when TZID is used)
- If venue not in venue map: use short name only in LOCATION
- If team has no games: return valid empty VCALENDAR (no VEVENT blocks)

### Response: 304 Not Modified

Returned when `If-None-Match` or `If-Modified-Since` indicates no change.

**Headers**:
```
ETag: "{same-etag}"
Cache-Control: public, max-age=3600
```

No body.

### Response: 404 Not Found

Team ID does not exist in database.

```json
{ "error": "Team not found" }
```

### Response: 500 Internal Server Error

```json
{ "error": "Internal error" }
```

---

## Endpoint: Team Search

```
GET /api/teams/search?q={query}
```

Served by Next.js route (`apps/web/app/api/teams/search/route.ts`).

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| q | string | yes | Search term (min 1 character) |

### Response: 200 OK

```json
{
  "results": [
    {
      "tid": 42,
      "name": "火箭隊",
      "active_division_count": 2,
      "last_game_at": 1748000000
    }
  ]
}
```

**Behavior**:
- Returns max 20 results
- Uses FTS5 prefix search for queries ≥ 2 chars; LIKE fallback for 1-char queries
- Results ordered by FTS5 rank (relevance)
- Empty results: `{ "results": [] }`

### Response: 400 Bad Request

```json
{ "error": "Query parameter 'q' is required" }
```
