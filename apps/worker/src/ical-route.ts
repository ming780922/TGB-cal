import type { Env } from './index';
import { generateIcal } from './ical';
import type { GameRow } from './ical';

interface TeamFeedMeta {
  last_modified_at: number;
  etag: string;
  cached_ical: string | null;
  game_count: number;
}

function toHttpDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toUTCString();
}

export async function handleIcalRequest(
  request: Request,
  env: Env,
  tid: number,
): Promise<Response> {
  // 1. Query team
  const team = await env.DB.prepare('SELECT tid, name FROM teams WHERE tid = ?')
    .bind(tid)
    .first<{ tid: number; name: string }>();

  if (!team) {
    return new Response(JSON.stringify({ error: 'Team not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Query team_feed_meta
  const meta = await env.DB.prepare(
    'SELECT last_modified_at, etag, cached_ical, game_count FROM team_feed_meta WHERE tid = ?',
  )
    .bind(tid)
    .first<TeamFeedMeta>();

  if (meta) {
    // 4. Check If-None-Match (ETag)
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === `"${meta.etag}"`) {
      return new Response(null, { status: 304 });
    }

    // 5. Check If-Modified-Since
    const ifModifiedSince = request.headers.get('If-Modified-Since');
    if (ifModifiedSince) {
      const ifModifiedSinceMs = new Date(ifModifiedSince).getTime();
      if (!isNaN(ifModifiedSinceMs) && meta.last_modified_at * 1000 <= ifModifiedSinceMs) {
        return new Response(null, { status: 304 });
      }
    }

    // 6. Return cached ical if available
    if (meta.cached_ical) {
      return new Response(meta.cached_ical, {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          ETag: `"${meta.etag}"`,
          'Last-Modified': toHttpDate(meta.last_modified_at),
        },
      });
    }
  }

  // 7. Query games with team names and division info
  const { results: games } = await env.DB.prepare(
    `SELECT g.game_id, g.level_id, g.home_tid, g.away_tid,
       ht.name as home_name, at.name as away_name,
       g.scheduled_at, g.venue,
       g.home_score, g.away_score, g.status, g.ical_sequence,
       d.gid, l.name as league_name, d.name     FROM games g
     LEFT JOIN teams ht ON g.home_tid = ht.tid
     LEFT JOIN teams at ON g.away_tid = at.tid
     JOIN divisions d ON g.level_id = d.level_id
     JOIN leagues l ON d.gid = l.gid
     JOIN team_divisions td ON td.tid = ? AND td.level_id = g.level_id
     ORDER BY g.scheduled_at ASC`,
  )
    .bind(tid)
    .all<GameRow>();

  // 8. Generate iCal content
  const icalContent = generateIcal(team, games ?? []);

  // 9. Compute etag
  const now = Math.floor(Date.now() / 1000);
  const lastModifiedAt = meta?.last_modified_at ?? now;
  const etag = `${tid}-${lastModifiedAt}`;

  // 10. Upsert team_feed_meta
  await env.DB.prepare(
    `INSERT INTO team_feed_meta (tid, last_modified_at, game_count, etag, cached_ical, generated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(tid) DO UPDATE SET
       last_modified_at = excluded.last_modified_at,
       game_count = excluded.game_count,
       etag = excluded.etag,
       cached_ical = excluded.cached_ical,
       generated_at = excluded.generated_at`,
  )
    .bind(tid, lastModifiedAt, (games ?? []).length, etag, icalContent, now)
    .run();

  // 11. Return response
  return new Response(icalContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      ETag: `"${etag}"`,
      'Last-Modified': toHttpDate(lastModifiedAt),
    },
  });
}
