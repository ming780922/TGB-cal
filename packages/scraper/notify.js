import webpush from 'web-push';
import { querySubscriptions, deleteSubscription } from './db-client.js';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

const EVENT_PRIORITY = ['game_completed', 'video_url_added', 'new_game', 'game_rescheduled'];

const EVENT_BODY = {
  new_game: '新比賽已排定',
  game_completed: '比賽結果出爐',
  game_rescheduled: '比賽時間/地點更動',
  video_url_added: '比賽錄影已上傳',
};

export async function sendNotifications(changedEvents) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    console.warn('[notify] VAPID keys not configured — skipping push notifications');
    return;
  }
  if (changedEvents.length === 0) return;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const tids = [...new Set(changedEvents.map(e => e.tid))];
  console.log(`[notify] Fetching subscriptions for ${tids.length} team(s): ${tids.join(', ')}`);

  const subscriptions = querySubscriptions(tids);
  if (subscriptions.length === 0) {
    console.log('[notify] No subscribers — nothing to push.');
    return;
  }

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
    if (!topEvent) continue;

    const notifUrl = topEvent.event_type === 'video_url_added' && topEvent.video_url
      ? topEvent.video_url
      : `https://tgb.ming060.com/zh-Hant/team/${sub.tid}`;

    const payload = JSON.stringify({
      title: `${sub.team_name} 有消息`,
      body: EVENT_BODY[topEvent.event_type] ?? topEvent.event_type,
      data: { url: notifUrl },
    });

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      pushed++;
    } catch (err) {
      if (err.statusCode === 410) {
        try {
          deleteSubscription(sub.tid, sub.endpoint);
          cleaned++;
        } catch (cleanErr) {
          console.error(`[notify] Failed to clean stale subscription: ${cleanErr.message}`);
        }
      } else {
        console.error(`[notify] Push failed for tid=${sub.tid}: ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`[notify] pushed=${pushed} cleaned=${cleaned} failed=${failed}`);
}
