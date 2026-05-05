import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

type Env = {
  DB: D1Database;
};

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (q === null) {
    return Response.json({ error: 'q param required' }, { status: 400 });
  }

  const { env } = getRequestContext() as { env: Env };
  const db = env.DB;

  // DEBUG: Check if we are connected to the right DB
  const countResult = await db.prepare('SELECT COUNT(*) as count FROM teams').first<{ count: number }>();
  console.log(`[api/teams/search] Total teams in DB: ${countResult?.count}`);

  try {
    let rows: { tid: number; name: string; active_division_count: number; last_game_at: string | null }[];

    if (q.length >= 2) {
      const result = await db
        .prepare(
          `SELECT t.tid, t.name, t.active_division_count, t.last_game_at
           FROM teams t
           JOIN teams_fts f ON f.rowid = t.tid
           WHERE teams_fts MATCH ?
           ORDER BY rank
           LIMIT 20`
        )
        .bind(q + '*')
        .all<{ tid: number; name: string; active_division_count: number; last_game_at: string | null }>();
      rows = result.results;
    } else {
      const result = await db
        .prepare(
          `SELECT tid, name, active_division_count, last_game_at
           FROM teams
           WHERE name LIKE ?
           LIMIT 20`
        )
        .bind('%' + q + '%')
        .all<{ tid: number; name: string; active_division_count: number; last_game_at: string | null }>();
      rows = result.results;
    }

    return Response.json({ results: rows });
  } catch (err) {
    console.error('[api/teams/search] Search error:', err);
    return Response.json({ results: [] }, { status: 500 });
  }
}
