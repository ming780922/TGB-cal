# Web Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow anonymous users on a team page to subscribe to browser push notifications and receive alerts when the daily scraper detects new games, completed scores, or rescheduled games for their team.

**Architecture:** Push subscriptions are stored in D1. Browser calls the Next.js API route (`/api/push/subscribe`) to subscribe/unsubscribe — the same pattern as the existing `/api/teams/search` route. The scraper-facing list endpoint lives in the Worker (Bearer auth). The `scrape-api.ts` division upsert is extended to return a `changed` array. After `full-scrape.js` finishes all divisions, a new `notify.js` script fetches subscriptions from the Worker and delivers Web Push messages directly from GitHub Actions using the `web-push` npm package with VAPID keys from GitHub Actions secrets.

**Tech Stack:** `web-push` npm package, Web Push API + Service Workers (browser), Cloudflare D1 (subscription storage), VAPID keys (GitHub Actions secrets + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` build var), Next.js Route Handlers (`@cloudflare/next-on-pages`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `db/migrations/002_push_subscriptions.sql` | Create | D1 schema for push subscriptions |
| `apps/web/app/api/push/subscribe/route.ts` | Create | POST subscribe + DELETE unsubscribe (browser-facing) |
| `apps/worker/src/push-api.ts` | Create | GET list subscriptions (scraper-facing, Bearer auth) |
| `apps/worker/src/index.ts` | Modify | Route `GET /api/push/subscriptions` |
| `apps/worker/src/scrape-api.ts` | Modify | Return `changed` events from division upsert |
| `packages/scraper/notify.js` | Create | Fetch subscriptions + send Web Push |
| `packages/scraper/full-scrape.js` | Modify | Accumulate changed events, call notify.js at end |
| `packages/scraper/package.json` | Modify | Add `web-push` dependency |
| `apps/web/public/sw.js` | Create | Service worker: handle push events + notification clicks |
| `apps/web/app/[locale]/team/[tid]/NotifyButton.tsx` | Create | Subscribe/unsubscribe UI component |
| `apps/web/app/[locale]/team/[tid]/page.tsx` | Modify | Add NotifyButton to subscription section |
| `apps/web/i18n/messages/zh.json` | Modify | Add notify UI strings |
| `apps/web/i18n/messages/en.json` | Modify | Add notify UI strings |
| `.github/workflows/scrape.yml` | Modify | Add VAPID secrets to scraper env |
| `.github/workflows/deploy.yml` | Modify | Add NEXT_PUBLIC_VAPID_PUBLIC_KEY to web build |

---

## Task 1: DB Migration — push_subscriptions table

**Files:**
- Create: `db/migrations/002_push_subscriptions.sql`

- [ ] **Step 1: Create migration file**

```sql
-- db/migrations/002_push_subscriptions.sql
CREATE TABLE push_subscriptions (
  id          TEXT    NOT NULL,
  tid         INTEGER NOT NULL REFERENCES teams(tid) ON DELETE CASCADE,
  endpoint    TEXT    NOT NULL,
  p256dh      TEXT    NOT NULL,
  auth        TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (id),
  UNIQUE (endpoint, tid)
);

CREATE INDEX idx_push_subscriptions_tid ON push_subscriptions(tid);
```

- [ ] **Step 2: Apply to local D1**

Run from repo root:

```bash
npx wrangler d1 execute tgb-calendar \
  --local \
  --persist-to apps/web/.wrangler/state \
  --config apps/worker/wrangler.toml \
  --file db/migrations/002_push_subscriptions.sql
```

Expected: exits 0 with no errors.

- [ ] **Step 3: Verify table exists**

```bash
npx wrangler d1 execute tgb-calendar \
  --local \
  --persist-to apps/web/.wrangler/state \
  --config apps/worker/wrangler.toml \
  --command ".tables"
```

Expected output includes `push_subscriptions`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/002_push_subscriptions.sql
git commit -m "feat: add push_subscriptions migration"
```

---

## Task 2: Next.js API route — subscribe and unsubscribe

**Files:**
- Create: `apps/web/app/api/push/subscribe/route.ts`

This follows the same pattern as `apps/web/app/api/teams/search/route.ts`: uses `getRequestContext()` to access D1, exported `runtime = 'edge'`.

- [ ] **Step 1: Create the route file**

```typescript
// apps/web/app/api/push/subscribe/route.ts
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

type Env = { DB: D1Database };

interface SubscribeBody {
  id: string;
  tid: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: SubscribeBody;
  try {
    body = await request.json();
    if (!body.id || !body.tid || !body.endpoint || !body.p256dh || !body.auth) {
      throw new Error('missing fields');
    }
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { env } = getRequestContext() as { env: Env };

  const existing = await env.DB.prepare(
    'SELECT id FROM push_subscriptions WHERE endpoint = ? AND tid = ?'
  ).bind(body.endpoint, body.tid).first<{ id: string }>();

  if (existing) {
    return Response.json({ ok: true }, { status: 200 });
  }

  await env.DB.prepare(
    'INSERT INTO push_subscriptions (id, tid, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(body.id, body.tid, body.endpoint, body.p256dh, body.auth, Math.floor(Date.now() / 1000)).run();

  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request): Promise<Response> {
  let body: { tid: number; endpoint: string };
  try {
    body = await request.json();
    if (!body.tid || !body.endpoint) throw new Error('missing fields');
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { env } = getRequestContext() as { env: Env };

  await env.DB.prepare(
    'DELETE FROM push_subscriptions WHERE endpoint = ? AND tid = ?'
  ).bind(body.endpoint, body.tid).run();

  return new Response(null, { status: 204 });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/api/push/subscribe/route.ts
git commit -m "feat: add push subscribe/unsubscribe Next.js route"
```

---

## Task 3: Worker — list subscriptions endpoint

**Files:**
- Create: `apps/worker/src/push-api.ts`

This endpoint is called by the scraper (GitHub Actions), not the browser. It requires Bearer auth using the existing `requireAuth` helper.

- [ ] **Step 1: Create push-api.ts**

```typescript
// apps/worker/src/push-api.ts
import type { Env } from './index';
import { requireAuth } from './auth';

export async function handleListSubscriptions(request: Request, env: Env): Promise<Response> {
  const authError = requireAuth(request, env);
  if (authError) return authError;

  const url = new URL(request.url);
  const tidsParam = url.searchParams.get('tids');
  if (!tidsParam) {
    return json({ error: 'Missing tids parameter' }, 400);
  }

  const tids = tidsParam.split(',').map(Number).filter(n => !isNaN(n) && n > 0);
  if (tids.length === 0) {
    return json({ subscriptions: [] }, 200);
  }

  const placeholders = tids.map(() => '?').join(',');
  const rows = await env.DB.prepare(
    `SELECT ps.tid, ps.endpoint, ps.p256dh, ps.auth, t.name AS team_name
     FROM push_subscriptions ps
     JOIN teams t ON t.tid = ps.tid
     WHERE ps.tid IN (${placeholders})`
  ).bind(...tids).all<{ tid: number; endpoint: string; p256dh: string; auth: string; team_name: string }>();

  return json({ subscriptions: rows.results }, 200);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker/src/push-api.ts
git commit -m "feat: add Worker endpoint to list push subscriptions"
```

---

## Task 4: Worker — route GET /api/push/subscriptions

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Add the route**

In `apps/worker/src/index.ts`, add after the existing `/api/scrape/` block and before the final `return new Response(...)`:

```typescript
    // Push subscriptions list (scraper-facing, auth required)
    if (path === '/api/push/subscriptions' && request.method === 'GET') {
      const pushModule = await import('./push-api');
      return pushModule.handleListSubscriptions(request, env);
    }
```

The full `fetch` handler body becomes:

```typescript
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route: GET /ical/:tid.ics
    const icalMatch = path.match(/^\/ical\/(\d+)\.ics$/);
    if (icalMatch && request.method === 'GET') {
      const { handleIcalRequest } = await import('./ical-route');
      return handleIcalRequest(request, env, Number(icalMatch[1]));
    }

    // API Scraper Routes
    if (path.startsWith('/api/scrape/') && request.method === 'POST') {
      const apiModule = await import('./scrape-api');
      if (path === '/api/scrape/metadata') return apiModule.handleMetadataUpsert(request, env);
      if (path === '/api/scrape/division') return apiModule.handleDivisionUpsert(request, env);
    }

    // Push subscriptions list (scraper-facing, auth required)
    if (path === '/api/push/subscriptions' && request.method === 'GET') {
      const pushModule = await import('./push-api');
      return pushModule.handleListSubscriptions(request, env);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat: route GET /api/push/subscriptions in Worker"
```

---

## Task 5: Worker — add changed events to division upsert response

**Files:**
- Modify: `apps/worker/src/scrape-api.ts`

The goal is to track which teams changed and why during game processing, then return that as `changed: Array<{ tid: number, event_type: string, game_id: number }>` alongside the existing `counts` field.

- [ ] **Step 1: Add ChangedEvent type at top of file**

After the existing interface declarations (after `interface ExistingGame`), add:

```typescript
interface ChangedEvent {
  tid: number;
  event_type: 'new_game' | 'game_completed' | 'game_rescheduled';
  game_id: number;
}
```

- [ ] **Step 2: Replace teamsWithGameChanges with changedEvents array**

Inside `handleDivisionUpsert`, find:

```typescript
    const teamsWithGameChanges = new Set<number>();
```

Replace with:

```typescript
    const changedEvents: ChangedEvent[] = [];
    const recordEvent = (tid: number | null | undefined, event_type: ChangedEvent['event_type'], game_id: number) => {
      if (tid != null) changedEvents.push({ tid, event_type, game_id });
    };
```

- [ ] **Step 3: Update new game insertion tracking**

Find the block after `counts.games_inserted++` for new game insertion:

```typescript
        counts.games_inserted++;
        if (game.home_tid != null) teamsWithGameChanges.add(game.home_tid);
        if (game.away_tid != null) teamsWithGameChanges.add(game.away_tid);
```

Replace with:

```typescript
        counts.games_inserted++;
        recordEvent(game.home_tid, 'new_game', game.game_id);
        recordEvent(game.away_tid, 'new_game', game.game_id);
```

- [ ] **Step 4: Update future game rescheduled tracking**

Find the block after `counts.games_updated++` for future game changes (inside `else if (existing.scheduled_at > now)`):

```typescript
          counts.games_updated++;
          if (game.home_tid != null) teamsWithGameChanges.add(game.home_tid);
          if (game.away_tid != null) teamsWithGameChanges.add(game.away_tid);
          if (existing.home_tid != null) teamsWithGameChanges.add(existing.home_tid);
          if (existing.away_tid != null) teamsWithGameChanges.add(existing.away_tid);
```

Replace with:

```typescript
          counts.games_updated++;
          recordEvent(game.home_tid, 'game_rescheduled', game.game_id);
          recordEvent(game.away_tid, 'game_rescheduled', game.game_id);
          recordEvent(existing.home_tid, 'game_rescheduled', game.game_id);
          recordEvent(existing.away_tid, 'game_rescheduled', game.game_id);
```

- [ ] **Step 5: Update past game completed tracking**

Find the block after `counts.games_updated++` for past games with new scores (inside the `else` branch for `existing.home_score === null && incomingHasScores`):

```typescript
          counts.games_updated++;
          if (game.home_tid != null) teamsWithGameChanges.add(game.home_tid);
          if (game.away_tid != null) teamsWithGameChanges.add(game.away_tid);
          if (existing.home_tid != null) teamsWithGameChanges.add(existing.home_tid);
          if (existing.away_tid != null) teamsWithGameChanges.add(existing.away_tid);
```

Replace with:

```typescript
          counts.games_updated++;
          recordEvent(game.home_tid, 'game_completed', game.game_id);
          recordEvent(game.away_tid, 'game_completed', game.game_id);
          recordEvent(existing.home_tid, 'game_completed', game.game_id);
          recordEvent(existing.away_tid, 'game_completed', game.game_id);
```

- [ ] **Step 6: Update team_sync invalidation to use changedEvents**

Find:

```typescript
    // Invalidate team feeds
    for (const tid of teamsWithGameChanges) {
```

Replace with:

```typescript
    // Invalidate team feeds
    const teamsWithGameChanges = new Set(changedEvents.map(e => e.tid));
    for (const tid of teamsWithGameChanges) {
```

- [ ] **Step 7: Add changed to the return value**

Find:

```typescript
    return jsonResponse({ ok: true, counts }, 200);
```

Replace with:

```typescript
    // Deduplicate: one entry per (tid, event_type) — keep first game_id seen
    const seen = new Set<string>();
    const dedupedChanged = changedEvents.filter(e => {
      const key = `${e.tid}:${e.event_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return jsonResponse({ ok: true, counts, changed: dedupedChanged }, 200);
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd apps/worker && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/worker/src/scrape-api.ts
git commit -m "feat: return changed events from division upsert response"
```

---

## Task 6: Scraper — add web-push dependency

**Files:**
- Modify: `packages/scraper/package.json`

- [ ] **Step 1: Add web-push to dependencies**

Full file after change:

```json
{
  "name": "@tgb-calendar/scraper",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "index.js",
  "engines": { "node": ">=20" },
  "dependencies": {
    "cheerio": "^1.0.0",
    "node-fetch": "^3.3.2",
    "web-push": "^3.6.7"
  },
  "scripts": {
    "start": "node index.js"
  }
}
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: `web-push` package appears under `packages/scraper/node_modules` (or hoisted).

- [ ] **Step 3: Commit**

```bash
git add packages/scraper/package.json pnpm-lock.yaml
git commit -m "feat: add web-push dependency to scraper"
```

---

## Task 7: Scraper — notify.js

**Files:**
- Create: `packages/scraper/notify.js`

- [ ] **Step 1: Create notify.js**

```javascript
// packages/scraper/notify.js
import webpush from 'web-push';

const WORKER_BASE_URL = process.env.WORKER_BASE_URL;
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

// Higher index = lower priority. If a team has multiple event types,
// we pick the highest priority one for the notification body.
const EVENT_PRIORITY = ['game_completed', 'new_game', 'game_rescheduled'];

const EVENT_BODY = {
  new_game: '新比賽已排定',
  game_completed: '比賽結果出爐',
  game_rescheduled: '比賽時間/地點更動',
};

/**
 * Send push notifications for all changed game events after a scrape run.
 *
 * @param {Array<{ tid: number, event_type: string, game_id: number }>} changedEvents
 */
export async function sendNotifications(changedEvents) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    console.warn('[notify] VAPID keys not configured — skipping push notifications');
    return;
  }
  if (changedEvents.length === 0) return;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const tids = [...new Set(changedEvents.map(e => e.tid))];
  console.log(`[notify] Fetching subscriptions for ${tids.length} team(s): ${tids.join(', ')}`);

  const res = await fetch(
    `${WORKER_BASE_URL}/api/push/subscriptions?tids=${tids.join(',')}`,
    { headers: { Authorization: `Bearer ${SCRAPER_API_KEY}` } }
  );
  if (!res.ok) {
    console.error(`[notify] Failed to fetch subscriptions: ${res.status} ${await res.text()}`);
    return;
  }

  const { subscriptions } = await res.json();
  if (subscriptions.length === 0) {
    console.log('[notify] No subscribers — nothing to push.');
    return;
  }

  // Group events by tid so we can pick the highest-priority one per subscription
  const eventsByTid = new Map();
  for (const e of changedEvents) {
    if (!eventsByTid.has(e.tid)) eventsByTid.set(e.tid, []);
    eventsByTid.get(e.tid).push(e);
  }

  let pushed = 0;
  let cleaned = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    const events = eventsByTid.get(sub.tid) ?? [];
    const topEvent =
      EVENT_PRIORITY.map(et => events.find(e => e.event_type === et)).find(Boolean) ??
      events[0];

    const payload = JSON.stringify({
      title: `${sub.team_name} 有消息`,
      body: EVENT_BODY[topEvent.event_type] ?? topEvent.event_type,
      data: { url: `https://tgb.ming060.com/zh/team/${sub.tid}` },
    });

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      pushed++;
    } catch (err) {
      if (err.statusCode === 410) {
        // Browser unsubscribed — clean up the stale row
        try {
          await fetch(`${WORKER_BASE_URL}/api/push/subscribe`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tid: sub.tid, endpoint: sub.endpoint }),
          });
          cleaned++;
        } catch (cleanErr) {
          console.error(`[notify] Failed to clean up stale subscription: ${cleanErr.message}`);
        }
      } else {
        console.error(`[notify] Push failed for tid=${sub.tid}: ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`[notify] pushed=${pushed} cleaned=${cleaned} failed=${failed}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/scraper/notify.js
git commit -m "feat: add notify.js for web push delivery from GitHub Actions"
```

---

## Task 8: Scraper — update full-scrape.js

**Files:**
- Modify: `packages/scraper/full-scrape.js`

- [ ] **Step 1: Add import at top of file**

Add after the existing imports:

```javascript
import { sendNotifications } from './notify.js';
```

- [ ] **Step 2: Declare allChangedEvents before the loop**

Find:

```javascript
  let successCount = 0;
  let errorCount = 0;
```

Add `const allChangedEvents = [];` immediately after:

```javascript
  let successCount = 0;
  let errorCount = 0;
  const allChangedEvents = [];
```

- [ ] **Step 3: Accumulate changed events inside the per-division loop**

Find:

```javascript
        const result = await upsertDivisionData(data.teams, data.team_divisions, data.games);
        
        console.log(`  - Done: teams=${JSON.stringify(result.counts.teams_inserted + result.counts.teams_updated)}, games=${JSON.stringify(result.counts.games_inserted + result.counts.games_updated)}`);
        
        successCount++;
```

Replace with:

```javascript
        const result = await upsertDivisionData(data.teams, data.team_divisions, data.games);
        
        console.log(`  - Done: teams=${result.counts.teams_inserted + result.counts.teams_updated}, games=${result.counts.games_inserted + result.counts.games_updated}`);
        
        if (Array.isArray(result.changed)) {
          allChangedEvents.push(...result.changed);
        }
        successCount++;
```

- [ ] **Step 4: Call sendNotifications after the per-division loop**

Find the summary block:

```javascript
    console.log('\n' + '='.repeat(50));
    console.log('[scraper] Crawl complete.');
    console.log(`- Total Divisions: ${divisions.length}`);
    console.log(`- Successfully Processed: ${successCount}`);
    console.log(`- Failed: ${errorCount}`);
    console.log('='.repeat(50));
```

Add push dispatch immediately after (still inside the `try`):

```javascript
    console.log('\n' + '='.repeat(50));
    console.log('[scraper] Crawl complete.');
    console.log(`- Total Divisions: ${divisions.length}`);
    console.log(`- Successfully Processed: ${successCount}`);
    console.log(`- Failed: ${errorCount}`);
    console.log('='.repeat(50));

    if (allChangedEvents.length > 0) {
      console.log(`\n[scraper] ${allChangedEvents.length} change event(s) detected — sending push notifications...`);
      await sendNotifications(allChangedEvents);
    } else {
      console.log('\n[scraper] No game changes — skipping push notifications.');
    }
```

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/full-scrape.js
git commit -m "feat: accumulate changed events and call notify.js after scrape"
```

---

## Task 9: Frontend — service worker

**Files:**
- Create: `apps/web/public/sw.js`

- [ ] **Step 1: Create sw.js**

```javascript
// apps/web/public/sw.js
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'TGB 賽程通知';
  const options = {
    body: data.body || '',
    data: data.data || {},
    icon: '/favicon.ico',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || 'https://tgb.ming060.com';
  event.waitUntil(clients.openWindow(url));
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/public/sw.js
git commit -m "feat: add service worker for push notification handling"
```

---

## Task 10: Frontend — NotifyButton component

**Files:**
- Create: `apps/web/app/[locale]/team/[tid]/NotifyButton.tsx`

- [ ] **Step 1: Create NotifyButton.tsx**

```tsx
// apps/web/app/[locale]/team/[tid]/NotifyButton.tsx
'use client';

import { useState, useEffect } from 'react';

interface NotifyButtonProps {
  tid: number;
  label: string;
  activeLabel: string;
}

const storageKey = (tid: number) => `push_sub_${tid}`;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export default function NotifyButton({ tid, label, activeLabel }: NotifyButtonProps) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ('PushManager' in window && 'serviceWorker' in navigator) {
      setSupported(true);
      setSubscribed(localStorage.getItem(storageKey(tid)) === 'true');
    }
  }, [tid]);

  if (!supported) return null;

  const handleSubscribe = async () => {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
    const pushSub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const subJson = pushSub.toJSON();
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        tid,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys!.p256dh,
        auth: subJson.keys!.auth,
      }),
    });
    localStorage.setItem(storageKey(tid), 'true');
    setSubscribed(true);
  };

  const handleUnsubscribe = async () => {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (reg) {
      const pushSub = await reg.pushManager.getSubscription();
      if (pushSub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tid, endpoint: pushSub.endpoint }),
        });
        await pushSub.unsubscribe();
      }
    }
    localStorage.removeItem(storageKey(tid));
    setSubscribed(false);
  };

  const handleClick = async () => {
    setLoading(true);
    try {
      if (subscribed) {
        await handleUnsubscribe();
      } else {
        await handleSubscribe();
      }
    } catch (err) {
      console.error('Push subscription error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={loading} type="button">
      {subscribed ? activeLabel : label}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/[locale]/team/[tid]/NotifyButton.tsx
git commit -m "feat: add NotifyButton client component"
```

---

## Task 11: Frontend — wire NotifyButton into team page and add i18n strings

**Files:**
- Modify: `apps/web/app/[locale]/team/[tid]/page.tsx`
- Modify: `apps/web/i18n/messages/zh.json`
- Modify: `apps/web/i18n/messages/en.json`

- [ ] **Step 1: Add import to page.tsx**

At the top of `apps/web/app/[locale]/team/[tid]/page.tsx`, add with the other imports:

```typescript
import NotifyButton from './NotifyButton';
```

- [ ] **Step 2: Add NotifyButton inside the subscription section div**

Find:

```tsx
        <div>
          <a href={webcalUrl}>{t('addToApple')}</a>
          <a href={googleCalUrl} target="_blank" rel="noopener noreferrer">
            {t('addToGoogle')}
          </a>
          <CopyButton url={icalUrl} label={t('copyLink')} copiedLabel={t('copied')} />
        </div>
```

Replace with:

```tsx
        <div>
          <a href={webcalUrl}>{t('addToApple')}</a>
          <a href={googleCalUrl} target="_blank" rel="noopener noreferrer">
            {t('addToGoogle')}
          </a>
          <CopyButton url={icalUrl} label={t('copyLink')} copiedLabel={t('copied')} />
          <NotifyButton
            tid={Number(tid)}
            label={t('notifyMe')}
            activeLabel={t('notifyActive')}
          />
        </div>
```

- [ ] **Step 3: Add strings to zh.json**

In `apps/web/i18n/messages/zh.json`, inside the `"team"` object, add after `"copied": "已複製！"`:

```json
    "notifyMe": "🔔 通知我",
    "notifyActive": "🔔 已訂閱通知"
```

- [ ] **Step 4: Add strings to en.json**

In `apps/web/i18n/messages/en.json`, inside the `"team"` object, add after `"copied": "Copied!"`:

```json
    "notifyMe": "🔔 Notify me",
    "notifyActive": "🔔 Notifications on"
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/[locale]/team/[tid]/page.tsx \
        apps/web/i18n/messages/zh.json \
        apps/web/i18n/messages/en.json
git commit -m "feat: add NotifyButton to team page with i18n strings"
```

---

## Task 12: GitHub Actions — add VAPID secrets to workflows

**Files:**
- Modify: `.github/workflows/scrape.yml`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Generate VAPID keys**

Run once from the scraper directory:

```bash
cd packages/scraper && node --input-type=module <<'EOF'
import webpush from 'web-push';
const keys = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
EOF
```

Save both values. The public key will be used in two places; the private key stays only in GitHub Actions.

- [ ] **Step 2: Add three GitHub Actions secrets**

In the repository: Settings → Secrets and variables → Actions → New repository secret.

| Name | Value |
|------|-------|
| `VAPID_PUBLIC_KEY` | Public key from Step 1 |
| `VAPID_PRIVATE_KEY` | Private key from Step 1 |
| `VAPID_SUBJECT` | `mailto:lym060@gmail.com` |

- [ ] **Step 3: Update scrape.yml — add VAPID env vars**

In `.github/workflows/scrape.yml`, find the `Run scraper` step `env:` block:

```yaml
        env:
          SCRAPER_API_KEY: ${{ secrets.SCRAPER_API_KEY }}
          WORKER_BASE_URL: ${{ secrets.WORKER_BASE_URL }}
```

Replace with:

```yaml
        env:
          SCRAPER_API_KEY: ${{ secrets.SCRAPER_API_KEY }}
          WORKER_BASE_URL: ${{ secrets.WORKER_BASE_URL }}
          VAPID_PUBLIC_KEY: ${{ secrets.VAPID_PUBLIC_KEY }}
          VAPID_PRIVATE_KEY: ${{ secrets.VAPID_PRIVATE_KEY }}
          VAPID_SUBJECT: ${{ secrets.VAPID_SUBJECT }}
```

- [ ] **Step 4: Update deploy.yml — add NEXT_PUBLIC_VAPID_PUBLIC_KEY to web build**

In `.github/workflows/deploy.yml`, find the `Build Next.js for Cloudflare Pages` step `env:` block:

```yaml
        env:
          CLOUDFLARE_D1_DATABASE_ID: ${{ secrets.CLOUDFLARE_D1_DATABASE_ID }}
```

Replace with:

```yaml
        env:
          CLOUDFLARE_D1_DATABASE_ID: ${{ secrets.CLOUDFLARE_D1_DATABASE_ID }}
          NEXT_PUBLIC_VAPID_PUBLIC_KEY: ${{ secrets.VAPID_PUBLIC_KEY }}
```

- [ ] **Step 5: Create apps/web/.env.local for local development**

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<paste_your_public_key_here>
```

Verify `.gitignore` at repo root or in `apps/web/` contains `.env.local`. Add it if missing:

```bash
echo ".env.local" >> apps/web/.gitignore
```

- [ ] **Step 6: Commit workflow changes**

```bash
git add .github/workflows/scrape.yml .github/workflows/deploy.yml apps/web/.gitignore
git commit -m "chore: add VAPID secrets to GitHub Actions workflows"
```

---

## Task 13: Production setup and end-to-end verification

- [ ] **Step 1: Apply migration to production D1**

```bash
npx wrangler d1 execute tgb-calendar \
  --config apps/worker/wrangler.toml \
  --file db/migrations/002_push_subscriptions.sql
```

Expected: exits 0. Verify in Cloudflare dashboard D1 → tgb-calendar → Tables.

- [ ] **Step 2: Smoke test Worker endpoints locally**

Start Worker:

```bash
npx wrangler dev --port 8787 \
  --persist-to apps/web/.wrangler/state \
  --config apps/worker/wrangler.toml
```

Test list subscriptions (empty):

```bash
curl -s -H "Authorization: Bearer devkey" \
  "http://localhost:8787/api/push/subscriptions?tids=316"
```

Expected: `{"subscriptions":[]}`

Test unauthorized:

```bash
curl -s "http://localhost:8787/api/push/subscriptions?tids=316"
```

Expected: `{"error":"Unauthorized"}` with status 401.

- [ ] **Step 3: Smoke test Next.js subscribe route locally**

Start Next.js dev server:

```bash
cd apps/web && npx next dev --port 3000
```

Subscribe:

```bash
curl -s -X POST http://localhost:3000/api/push/subscribe \
  -H "Content-Type: application/json" \
  -d '{"id":"test-uuid","tid":316,"endpoint":"https://example.com/push/test","p256dh":"dGVzdA==","auth":"dGVzdA=="}'
```

Expected: `{"ok":true}` with status 201.

Repeat same request — expected: `{"ok":true}` with status 200 (idempotent).

Unsubscribe:

```bash
curl -s -X DELETE http://localhost:3000/api/push/subscribe \
  -H "Content-Type: application/json" \
  -d '{"tid":316,"endpoint":"https://example.com/push/test"}'
```

Expected: 204 no content.

- [ ] **Step 4: Test NotifyButton in browser**

With Next.js dev server running at `http://localhost:3000`, navigate to any team page (e.g. `http://localhost:3000/zh/team/316`).

Verify:
- "🔔 通知我" button appears in the subscription section
- Clicking it triggers the browser permission prompt
- After granting permission, button text changes to "🔔 已訂閱通知"
- Refreshing the page: button still shows "🔔 已訂閱通知" (localStorage persisted)
- Clicking again: button reverts to "🔔 通知我" (unsubscribed)

On a browser that doesn't support `PushManager` (older Safari): verify the button does not render.

- [ ] **Step 5: Verify changed events in scraper output**

With Worker running on port 8787, run the single-scrape script:

```bash
SCRAPER_API_KEY=devkey \
WORKER_BASE_URL=http://localhost:8787 \
TGB_BASE_URL=http://localhost:9999 \
  node packages/scraper/single-scrape.js
```

Check the terminal output for `[notify]` lines. If there are new games, you should see:
```
[notify] Fetching subscriptions for N team(s): ...
[notify] No subscribers — nothing to push.
```

(No push is sent because there are no real subscriptions in the test DB — that's expected.)
