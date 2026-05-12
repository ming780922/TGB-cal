import type { Env } from './index';
import { generateIcal } from './ical';
import type { GameRow } from './ical';

interface TeamSyncMeta {
  last_modified_at: number;
  ical_etag: string;
  ical_cached: string | null;
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

  // 3. Query team_sync
  const meta = await env.DB.prepare(
    'SELECT last_modified_at, ical_etag, ical_cached FROM team_sync WHERE tid = ?',
  )
    .bind(tid)
    .first<TeamSyncMeta>();

  if (meta) {
    // 4. Check If-None-Match (ETag)
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === `"${meta.ical_etag}"`) {
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
    if (meta.ical_cached) {
      return new Response(meta.ical_cached, {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          ETag: `"${meta.ical_etag}"`,
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
       g.home_score, g.away_score, g.status, gs.ical_sequence, gs.ical_uid, g.updated_at,
       d.gid, l.name as league_name, d.name     FROM games g
     LEFT JOIN teams ht ON g.home_tid = ht.tid
     LEFT JOIN teams at ON g.away_tid = at.tid
     JOIN divisions d ON g.level_id = d.level_id
     JOIN leagues l ON d.gid = l.gid
     JOIN game_sync gs ON g.game_id = gs.game_id
     WHERE (g.home_tid = ? OR g.away_tid = ?)
     ORDER BY g.scheduled_at ASC`,
  )
    .bind(tid, tid)
    .all<GameRow>();

  // 8. Generate iCal content
  const icalContent = generateIcal(team, games ?? []);

  // 9. Compute etag
  const now = Math.floor(Date.now() / 1000);
  const lastModifiedAt = meta?.last_modified_at ?? now;
  const etag = `${tid}-${lastModifiedAt}`;

  // 10. Upsert team_sync
  await env.DB.prepare(
    `INSERT INTO team_sync (tid, last_modified_at, ical_etag, ical_cached, ical_generated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tid) DO UPDATE SET
       last_modified_at = excluded.last_modified_at,
       ical_etag = excluded.ical_etag,
       ical_cached = excluded.ical_cached,
       ical_generated_at = excluded.ical_generated_at`,
  )
    .bind(tid, lastModifiedAt, etag, icalContent, now)
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
