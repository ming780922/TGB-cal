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
