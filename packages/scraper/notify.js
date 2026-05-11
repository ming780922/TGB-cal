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
