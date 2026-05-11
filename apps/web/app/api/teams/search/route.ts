import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

type Env = { DB: D1Database };

interface TeamRow {
  tid: number;
  name: string;
  league_name: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (q === null) {
    return Response.json({ error: 'q param required' }, { status: 400 });
  }

  const { env } = getRequestContext() as { env: Env };
  const db = env.DB;

  const leagueSubquery = `(
    SELECT l.name FROM team_divisions td
    JOIN leagues l ON l.gid = td.gid
    WHERE td.tid = t.tid
    ORDER BY td.updated_at DESC LIMIT 1
  ) as league_name`;

  try {
    let rows: TeamRow[];

    if (q.length >= 2) {
      const result = await db
        .prepare(
          `SELECT t.tid, t.name, ${leagueSubquery}
           FROM teams t
           JOIN teams_fts f ON f.rowid = t.tid
           WHERE teams_fts MATCH ?
           ORDER BY rank
           LIMIT 20`
        )
        .bind(q + '*')
        .all<TeamRow>();
      rows = result.results;
    } else {
      const result = await db
        .prepare(
          `SELECT t.tid, t.name, ${leagueSubquery}
           FROM teams t
           WHERE t.name LIKE ?
           LIMIT 20`
        )
        .bind('%' + q + '%')
        .all<TeamRow>();
      rows = result.results;
    }

    return Response.json({
      results: rows.map(r => ({
        tid: r.tid,
        name: r.name,
        leagueName: r.league_name ?? '',
      })),
    });
  } catch (err) {
    console.error('[api/teams/search] error:', err);
    return Response.json({ results: [] }, { status: 500 });
  }
}
