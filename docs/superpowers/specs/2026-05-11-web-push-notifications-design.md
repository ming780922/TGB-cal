# Design Doc: Web Push Notifications for Team Game Events

**Date:** 2026-05-11
**Topic:** Web push notifications for TGB basketball team game events

## 1. Summary

Allow anonymous users to subscribe to browser push notifications for a specific team. Notifications are dispatched from GitHub Actions (via `notify.js`) after the daily scraper runs, using the `web-push` npm package and VAPID keys stored as GitHub Actions secrets. Subscriptions are stored in Cloudflare D1. No user accounts required.

## 2. Trigger Events

Three event types trigger a notification:

| `event_type` | When | Notification body |
|---|---|---|
| `new_game` | A new game row inserted for the team | 新比賽已排定 / New game scheduled |
| `game_completed` | A game flipped to `completed` with scores | 比賽結果出爐 / Game result available |
| `game_rescheduled` | A future game's `scheduled_at` or `venue` changed | 比賽時間/地點更動 / Game time or venue changed |

Notifications arrive within ~24 hours (after the daily 3am Taiwan time scraper run).

## 3. Data Flow

```
GitHub Actions: scrape.yml
  └─ node packages/scraper/index.js
       ├─ scrape all divisions → POST /api/scrape/upsert (per division)
       │    └─ Worker returns { new_teams, changed: [{ tid, event_type, game_id }] }
       ├─ accumulates all changed events across divisions
       └─ node packages/scraper/notify.js  (called at end if any events)
            ├─ GET /api/push/subscriptions?tids=316,107,...  (Bearer token)
            └─ for each subscription: web-push.sendNotification(...)
                 └─ 410 Gone → DELETE /api/push/subscribe  (clean up stale)
```

## 4. Database Schema

New table added to `db/migrations/002_push_subscriptions.sql`:

```sql
CREATE TABLE push_subscriptions (
  id          TEXT    PRIMARY KEY,
  tid         INTEGER NOT NULL REFERENCES teams(tid) ON DELETE CASCADE,
  endpoint    TEXT    NOT NULL,
  p256dh      TEXT    NOT NULL,
  auth        TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (endpoint, tid)
);

CREATE INDEX idx_push_subscriptions_tid ON push_subscriptions(tid);
```

A subscription is uniquely identified by `(endpoint, tid)`. One browser can subscribe to multiple teams — each team gets a separate row with the same endpoint but different tid. Unsubscribe deletes by `endpoint + tid`.

## 5. Worker API

Three new endpoints in `apps/worker/src/push-api.ts`:

### `POST /api/push/subscribe`
No auth. Browser registers a subscription for a team.

Request body:
```json
{ "tid": 316, "id": "<uuid>", "endpoint": "...", "p256dh": "...", "auth": "..." }
```
Returns `201` on insert, `200` if `endpoint + tid` already exists (idempotent).

### `DELETE /api/push/subscribe`
No auth. Browser removes a subscription.

Request body:
```json
{ "tid": 316, "endpoint": "..." }
```
Returns `204`. Silent success if row not found.

### `GET /api/push/subscriptions?tids=316,107`
Requires `Authorization: Bearer <SCRAPER_API_KEY>`. Returns subscriber data for the given tids.

Response:
```json
{
  "subscriptions": [
    { "tid": 316, "team_name": "火箭", "endpoint": "...", "p256dh": "...", "auth": "..." }
  ]
}
```

The Worker JOINs `push_subscriptions` with `teams` to include `team_name`, so `notify.js` can use it in the notification title without a second query.

### `/api/scrape/upsert` response change
The existing upsert endpoint gains a `changed` field:
```json
{
  "ok": true,
  "inserted": 2,
  "updated": 1,
  "new_teams": 0,
  "changed": [
    { "tid": 316, "event_type": "game_completed", "game_id": 19487 }
  ]
}
```

## 6. Scraper: `packages/scraper/notify.js`

New script called by `index.js` after all division scrapes complete.

**Steps:**
1. Receive accumulated `changed` events: `[{ tid, event_type, game_id }]`
2. Deduplicate tids, call `GET /api/push/subscriptions?tids=...`
3. For each subscription, send Web Push with `web-push` npm package:
   - Title: `{team_name} 有消息 / {team_name} Update`
   - Body: mapped from `event_type` (see table in Section 2)
4. Handle `410 Gone` — call `DELETE /api/push/subscribe` to clean up stale subscriptions
5. Log summary: `pushed N notifications, cleaned up M stale subscriptions`

**`index.js` change:** Collect `changed` arrays from each upsert response. After the scrape loop finishes, if `changed.length > 0`, call `notify.js`.

## 7. Frontend: NotifyButton Component

New client component `apps/web/app/[locale]/team/[tid]/NotifyButton.tsx` added to the subscription section on the team page.

**Button states:**
- **Default:** "🔔 通知我 / Notify me"
- **Subscribed:** "🔔 已訂閱通知 / Notifications on" (click to unsubscribe)
- **Hidden:** if `PushManager` is not available in the browser

**Subscribe flow:**
1. Register service worker at `/sw.js` if not already registered
2. Call `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })`
3. Browser shows native permission prompt
4. On grant: POST subscription + tid to `/api/push/subscribe`
5. Store subscribed state in `localStorage` keyed by tid for return visits

**Unsubscribe flow:**
1. Call `pushSubscription.unsubscribe()`
2. DELETE subscription from Worker
3. Clear `localStorage` entry

**Service worker** (`apps/web/public/sw.js`):
- Handles `push` events, calls `self.registration.showNotification(...)`
- Handles `notificationclick` events, opens `https://tgb.ming060.com/zh/team/{tid}`

## 8. Environment Variables

### GitHub Actions Secrets (new)

| Secret | Description |
|---|---|
| `VAPID_PUBLIC_KEY` | VAPID public key (also baked into frontend build) |
| `VAPID_PRIVATE_KEY` | VAPID private key — never leaves GitHub Actions |
| `VAPID_SUBJECT` | `mailto:lym060@gmail.com` |

### Worker (no new secrets)
Push subscription endpoints require no VAPID — they only store/return data. The `SCRAPER_API_KEY` already covers the protected `GET /api/push/subscriptions` endpoint.

### Frontend (new build variable)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key, safe to expose |

## 9. File Changes Summary

| File | Change |
|---|---|
| `db/migrations/002_push_subscriptions.sql` | New migration |
| `apps/worker/src/push-api.ts` | New: subscribe/unsubscribe/list endpoints |
| `apps/worker/src/index.ts` | Route `/api/push/*` to push-api handler |
| `apps/worker/src/scrape-api.ts` | Return `changed` array from upsert |
| `packages/scraper/notify.js` | New: fetch subscriptions + send Web Push |
| `packages/scraper/index.js` | Accumulate `changed`, call notify.js at end |
| `packages/scraper/package.json` | Add `web-push` dependency |
| `apps/web/public/sw.js` | New: service worker for push events |
| `apps/web/app/[locale]/team/[tid]/NotifyButton.tsx` | New: subscribe/unsubscribe UI |
| `apps/web/app/[locale]/team/[tid]/page.tsx` | Add NotifyButton to subscription section |
| `apps/web/i18n/messages/zh.json` | Add notification UI strings |
| `apps/web/i18n/messages/en.json` | Add notification UI strings |

## 10. Out of Scope

- Per-event notification preferences (users get all three event types for subscribed team)
- Notification history or read/unread state
- Multi-device subscription management UI
- Email fallback for users who block push
