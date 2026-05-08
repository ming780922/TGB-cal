import type { Env } from './index';
import { requireAuth } from './auth';

// ─── Request body types ───────────────────────────────────────────────────────

interface LeagueInput {
  gid: number;
  name: string;
}

interface DivisionInput {
  level_id: number;
  gid: number;
  name: string;
}

interface TeamInput {
  tid: number;
  name: string;
}

interface TeamDivisionInput {
  tid: number;
  level_id: number;
  wins: number;
  losses: number;
  rank?: number;
}

interface GameInput {
  game_id: number;
  level_id: number;
  home_tid?: number;
  away_tid?: number;
  scheduled_at: number;
  venue?: string;
  home_score?: number;
  away_score?: number;
  status: string;
}

interface ScrapeUpsertBody {
  league: LeagueInput;
  division: DivisionInput;
  teams: TeamInput[];
  team_divisions: TeamDivisionInput[];
  games: GameInput[];
}

// ─── Existing game row type ───────────────────────────────────────────────────

interface ExistingGame {
  game_id: number;
  scheduled_at: number;
  venue: string | null;
  home_tid: number | null;
  away_tid: number | null;
  status: string;
  home_score: number | null;
  ical_sequence: number;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(body: unknown): ScrapeUpsertBody | string {
  if (typeof body !== 'object' || body === null) return 'Request body must be a JSON object';
  const b = body as Record<string, unknown>;

  if (!b.league || typeof b.league !== 'object') return 'Missing required field: league';
  const league = b.league as Record<string, unknown>;
  if (typeof league.gid !== 'number') return 'Missing required field: league.gid';
  if (typeof league.name !== 'string') return 'Missing required field: league.name';

  if (!b.division || typeof b.division !== 'object') return 'Missing required field: division';
  const division = b.division as Record<string, unknown>;
  if (typeof division.level_id !== 'number') return 'Missing required field: division.level_id';
  if (typeof division.gid !== 'number') return 'Missing required field: division.gid';
  if (typeof division.name !== 'string') return 'Missing required field: division.name';

  if (!Array.isArray(b.teams)) return 'Missing required field: teams (must be array)';
  if (!Array.isArray(b.team_divisions)) return 'Missing required field: team_divisions (must be array)';
  if (!Array.isArray(b.games)) return 'Missing required field: games (must be array)';

  return b as unknown as ScrapeUpsertBody;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleScrapeUpsert(request: Request, env: Env): Promise<Response> {
  // Auth check
  const authError = requireAuth(request, env);
  if (authError) return authError;

  // Parse body
  let body: ScrapeUpsertBody;
  try {
    const raw = await request.json();
    const result = validate(raw);
    if (typeof result === 'string') {
      return jsonResponse({ error: result }, 400);
    }
    body = result;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const startedAt = now;

  const counts = {
    inserted: { leagues: 0, divisions: 0, teams: 0, games: 0 },
    updated: { leagues: 0, divisions: 0, teams: 0, games: 0 },
  };

  // Track which team tids had game changes (for feed meta invalidation)
  const teamsWithGameChanges = new Set<number>();
  let newTeams = 0;

  try {
    // ── 1. Upsert league ──────────────────────────────────────────────────────
    {
      const existing = await env.DB.prepare(
        'SELECT gid FROM leagues WHERE gid = ?'
      ).bind(body.league.gid).first<{ gid: number }>();

      if (!existing) {
        await env.DB.prepare(
          `INSERT INTO leagues (gid, name, created_at, updated_at) VALUES (?, ?, ?, ?)`
        ).bind(body.league.gid, body.league.name, now, now).run();
        counts.inserted.leagues++;
      } else {
        await env.DB.prepare(
          `UPDATE leagues SET name = ?, updated_at = ? WHERE gid = ?`
        ).bind(body.league.name, now, body.league.gid).run();
        counts.updated.leagues++;
      }
    }

    // ── 2. Upsert division ────────────────────────────────────────────────────
    {
      const existing = await env.DB.prepare(
        'SELECT level_id FROM divisions WHERE level_id = ?'
      ).bind(body.division.level_id).first<{ level_id: number }>();

      if (!existing) {
        await env.DB.prepare(
          `INSERT INTO divisions (level_id, gid, name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(
          body.division.level_id,
          body.division.gid,
          body.division.name,
          now,
          now
        ).run();
        counts.inserted.divisions++;
      } else {
        await env.DB.prepare(
          `UPDATE divisions SET gid = ?, name = ?, updated_at = ?
           WHERE level_id = ?`
        ).bind(
          body.division.gid,
          body.division.name,
          now,
          body.division.level_id
        ).run();
        counts.updated.divisions++;
      }
    }

    // ── 3. Upsert teams ───────────────────────────────────────────────────────
    for (const team of body.teams) {
      const existing = await env.DB.prepare(
        'SELECT tid FROM teams WHERE tid = ?'
      ).bind(team.tid).first<{ tid: number }>();

      if (!existing) {
        await env.DB.prepare(
          `INSERT INTO teams (tid, name, created_at, updated_at)
           VALUES (?, ?, ?, ?)`
        ).bind(team.tid, team.name, now, now).run();
        counts.inserted.teams++;
        newTeams++;
      } else {
        await env.DB.prepare(
          `UPDATE teams SET name = ?, updated_at = ? WHERE tid = ?`
        ).bind(team.name, now, team.tid).run();
        counts.updated.teams++;
      }
    }

    // ── 4. Upsert team_divisions ──────────────────────────────────────────────
    for (const td of body.team_divisions) {
      const existing = await env.DB.prepare(
        'SELECT tid FROM team_divisions WHERE tid = ? AND level_id = ?'
      ).bind(td.tid, td.level_id).first<{ tid: number }>();

      if (!existing) {
        await env.DB.prepare(
          `INSERT INTO team_divisions (tid, level_id, wins, losses, rank, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(td.tid, td.level_id, td.wins, td.losses, td.rank ?? null, now, now).run();
      } else {
        await env.DB.prepare(
          `UPDATE team_divisions SET wins = ?, losses = ?, rank = ?, updated_at = ?
           WHERE tid = ? AND level_id = ?`
        ).bind(td.wins, td.losses, td.rank ?? null, now, td.tid, td.level_id).run();
      }
    }

    // ── 5. Upsert games (with update logic) ───────────────────────────────────
    for (const game of body.games) {
      const existing = await env.DB.prepare(
        `SELECT g.game_id, g.scheduled_at, g.venue, g.home_tid, g.away_tid, g.status, g.home_score, s.ical_sequence
         FROM games g
         LEFT JOIN game_sync s ON g.game_id = s.game_id
         WHERE g.game_id = ?`
      ).bind(game.game_id).first<ExistingGame>();

      if (!existing) {
        // New game — INSERT
        await env.DB.prepare(
          `INSERT INTO games (game_id, level_id, home_tid, away_tid, scheduled_at, venue, home_score, away_score, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          game.game_id,
          game.level_id,
          game.home_tid ?? null,
          game.away_tid ?? null,
          game.scheduled_at,
          game.venue ?? null,
          game.home_score ?? null,
          game.away_score ?? null,
          game.status,
          now,
          now
        ).run();

        // Insert game metadata into game_sync
        const icalUid = `game-${game.game_id}@tgb.ming060.com`;
        await env.DB.prepare(
          `INSERT INTO game_sync (game_id, ical_uid, ical_sequence, updated_at)
           VALUES (?, ?, 0, ?)`
        ).bind(game.game_id, icalUid, now).run();

        counts.inserted.games++;

        // Mark home and away teams as changed
        if (game.home_tid != null) teamsWithGameChanges.add(game.home_tid);
        if (game.away_tid != null) teamsWithGameChanges.add(game.away_tid);
      } else if (existing.scheduled_at > now) {
        // Future game — compare key fields
        const changed =
          existing.scheduled_at !== game.scheduled_at ||
          (existing.venue ?? null) !== (game.venue ?? null) ||
          (existing.home_tid ?? null) !== (game.home_tid ?? null) ||
          (existing.away_tid ?? null) !== (game.away_tid ?? null) ||
          existing.status !== game.status;

        if (changed) {
          await env.DB.prepare(
            `UPDATE games SET level_id = ?, home_tid = ?, away_tid = ?, scheduled_at = ?, venue = ?, status = ?, updated_at = ?
             WHERE game_id = ?`
          ).bind(
            game.level_id,
            game.home_tid ?? null,
            game.away_tid ?? null,
            game.scheduled_at,
            game.venue ?? null,
            game.status,
            now,
            game.game_id
          ).run();

          await env.DB.prepare(
            `UPDATE game_sync SET ical_sequence = ical_sequence + 1, updated_at = ?
             WHERE game_id = ?`
          ).bind(now, game.game_id).run();

          counts.updated.games++;

          if (game.home_tid != null) teamsWithGameChanges.add(game.home_tid);
          if (game.away_tid != null) teamsWithGameChanges.add(game.away_tid);
          // Also mark old teams if they changed
          if (existing.home_tid != null) teamsWithGameChanges.add(existing.home_tid);
          if (existing.away_tid != null) teamsWithGameChanges.add(existing.away_tid);
        }
      } else {
        // Past game — only update if scores are newly available
        const incomingHasScores = game.home_score != null && game.away_score != null;
        if (existing.home_score === null && incomingHasScores) {
          await env.DB.prepare(
            `UPDATE games SET home_score = ?, away_score = ?, status = ?, updated_at = ?
             WHERE game_id = ?`
          ).bind(
            game.home_score!,
            game.away_score!,
            game.status,
            now,
            game.game_id
          ).run();

          await env.DB.prepare(
            `UPDATE game_sync SET ical_sequence = ical_sequence + 1, updated_at = ?
             WHERE game_id = ?`
          ).bind(now, game.game_id).run();

          counts.updated.games++;

          if (game.home_tid != null) teamsWithGameChanges.add(game.home_tid);
          if (game.away_tid != null) teamsWithGameChanges.add(game.away_tid);
          if (existing.home_tid != null) teamsWithGameChanges.add(existing.home_tid);
          if (existing.away_tid != null) teamsWithGameChanges.add(existing.away_tid);
        }
      }
    }

    // ── 6. Invalidate team_sync for changed teams ─────────────────────────────
    for (const tid of teamsWithGameChanges) {
      const metaExists = await env.DB.prepare(
        'SELECT tid FROM team_sync WHERE tid = ?'
      ).bind(tid).first<{ tid: number }>();

      if (metaExists) {
        await env.DB.prepare(
          `UPDATE team_sync SET last_modified_at = ?, ical_etag = '', ical_cached = NULL, updated_at = ? WHERE tid = ?`
        ).bind(now, now, tid).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO team_sync (tid, last_modified_at, ical_etag, ical_cached, ical_generated_at, updated_at)
           VALUES (?, ?, '', NULL, NULL, ?)`
        ).bind(tid, now, now).run();
      }
    }

    return jsonResponse({
      ok: true,
      inserted: counts.inserted,
      updated: counts.updated,
      new_teams: newTeams,
    }, 200);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'Database error', detail }, 500);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
