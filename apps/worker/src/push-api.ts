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

  const cappedTids = tids.slice(0, 100); // D1 bind() has a 100-parameter limit
  const placeholders = cappedTids.map(() => '?').join(',');

  try {
    const rows = await env.DB.prepare(
      `SELECT ps.tid, ps.endpoint, ps.p256dh, ps.auth, t.name AS team_name
       FROM push_subscriptions ps
       JOIN teams t ON t.tid = ps.tid
       WHERE ps.tid IN (${placeholders})`
    ).bind(...cappedTids).all<{ tid: number; endpoint: string; p256dh: string; auth: string; team_name: string }>();

    return json({ subscriptions: rows.results }, 200);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return json({ error: 'Database error', detail }, 500);
  }
}

export async function handleDeleteSubscription(request: Request, env: Env): Promise<Response> {
  let body: { tid: number; endpoint: string };
  try {
    body = await request.json();
    if (typeof body.tid !== 'number' || body.tid <= 0 || !body.endpoint) {
      throw new Error('missing fields');
    }
  } catch {
    return json({ error: 'Invalid body' }, 400);
  }

  try {
    await env.DB.prepare(
      'DELETE FROM push_subscriptions WHERE endpoint = ? AND tid = ?'
    ).bind(body.endpoint, body.tid).run();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return json({ error: 'DB error', detail }, 500);
  }

  return new Response(null, { status: 204 });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
