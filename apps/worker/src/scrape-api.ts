import type { Env } from './index';
import { requireAuth } from './auth';

// ─── Request body types ───────────────────────────────────────────────────────

interface LeagueInput {
  gid: number;
  name: string;
  venue_area?: string;
  day_of_week?: string;
  gender?: string;
  league_type: string;
}

interface DivisionInput {
  level_id: number;
  gid: number;
  season_label: string;
  division_label?: string;
  full_title: string;
  first_game_at?: number;
  last_game_at?: number;
  team_count: number;
}

interface TeamInput {
  tid: number;
  name: string;
  name_normalized: string;
}

interface TeamDivisionInput {
  tid: number;
  level_id: number;
  wins: number;
  losses: number;
  draws: number;
  rank?: number;
}

interface GameInput {
  game_id: number;
  level_id: number;
  home_tid?: number;
  away_tid?: number;
  scheduled_at: number;
  scheduled_at_local: string;
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
  if (typeof league.league_type !== 'string') return 'Missing required field: league.league_type';

  if (!b.division || typeof b.division !== 'object') return 'Missing required field: division';
  const division = b.division as Record<string, unknown>;
  if (typeof division.level_id !== 'number') return 'Missing required field: division.level_id';
  if (typeof division.gid !== 'number') return 'Missing required field: division.gid';
  if (typeof division.season_label !== 'string') return 'Missing required field: division.season_label';
  if (typeof division.full_title !== 'string') return 'Missing required field: division.full_title';
  if (typeof division.team_count !== 'number') return 'Missing required field: division.team_count';

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
          `INSERT INTO leagues (gid, name, venue_area, day_of_week, gender, league_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          body.league.gid,
          body.league.name,
          body.league.venue_area ?? null,
          body.league.day_of_week ?? null,
          body.league.gender ?? null,
          body.league.league_type,
          now,
          now
        ).run();
        counts.inserted.leagues++;
      } else {
        await env.DB.prepare(
          `UPDATE leagues SET name = ?, venue_area = ?, day_of_week = ?, gender = ?, league_type = ?, updated_at = ?
           WHERE gid = ?`
        ).bind(
          body.league.name,
          body.league.venue_area ?? null,
          body.league.day_of_week ?? null,
          body.league.gender ?? null,
          body.league.league_type,
          now,
          body.league.gid
        ).run();
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
          `INSERT INTO divisions (level_id, gid, season_label, division_label, full_title, first_game_at, last_game_at, team_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          body.division.level_id,
          body.division.gid,
          body.division.season_label,
          body.division.division_label ?? null,
          body.division.full_title,
          body.division.first_game_at ?? null,
          body.division.last_game_at ?? null,
          body.division.team_count,
          now,
          now
        ).run();
        counts.inserted.divisions++;
      } else {
        await env.DB.prepare(
          `UPDATE divisions SET gid = ?, season_label = ?, division_label = ?, full_title = ?, first_game_at = ?, last_game_at = ?, team_count = ?, updated_at = ?
           WHERE level_id = ?`
        ).bind(
          body.division.gid,
          body.division.season_label,
          body.division.division_label ?? null,
          body.division.full_title,
          body.division.first_game_at ?? null,
          body.division.last_game_at ?? null,
          body.division.team_count,
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
          `INSERT INTO teams (tid, name, name_normalized, active_division_count, created_at, updated_at)
           VALUES (?, ?, ?, 0, ?, ?)`
        ).bind(team.tid, team.name, team.name_normalized, now, now).run();
        counts.inserted.teams++;
        newTeams++;
      } else {
        await env.DB.prepare(
          `UPDATE teams SET name = ?, name_normalized = ?, updated_at = ? WHERE tid = ?`
        ).bind(team.name, team.name_normalized, now, team.tid).run();
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
          `INSERT INTO team_divisions (tid, level_id, wins, losses, draws, rank, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(td.tid, td.level_id, td.wins, td.losses, td.draws, td.rank ?? null, now, now).run();
      } else {
        await env.DB.prepare(
          `UPDATE team_divisions SET wins = ?, losses = ?, draws = ?, rank = ?, updated_at = ?
           WHERE tid = ? AND level_id = ?`
        ).bind(td.wins, td.losses, td.draws, td.rank ?? null, now, td.tid, td.level_id).run();
      }
    }

    // ── 5. Upsert games (with update logic) ───────────────────────────────────
    for (const game of body.games) {
      const existing = await env.DB.prepare(
        `SELECT game_id, scheduled_at, venue, home_tid, away_tid, status, home_score, ical_sequence
         FROM games WHERE game_id = ?`
      ).bind(game.game_id).first<ExistingGame>();

      if (!existing) {
        // New game — INSERT
        const icalUid = `game-${game.game_id}@tgb.ming060.com`;
        await env.DB.prepare(
          `INSERT INTO games (game_id, level_id, home_tid, away_tid, scheduled_at, scheduled_at_local, venue, home_score, away_score, status, ical_uid, ical_sequence, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
        ).bind(
          game.game_id,
          game.level_id,
          game.home_tid ?? null,
          game.away_tid ?? null,
          game.scheduled_at,
          game.scheduled_at_local,
          game.venue ?? null,
          game.home_score ?? null,
          game.away_score ?? null,
          game.status,
          icalUid,
          now,
          now
        ).run();
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
            `UPDATE games SET level_id = ?, home_tid = ?, away_tid = ?, scheduled_at = ?, scheduled_at_local = ?, venue = ?, status = ?, ical_sequence = ?, updated_at = ?
             WHERE game_id = ?`
          ).bind(
            game.level_id,
            game.home_tid ?? null,
            game.away_tid ?? null,
            game.scheduled_at,
            game.scheduled_at_local,
            game.venue ?? null,
            game.status,
            existing.ical_sequence + 1,
            now,
            game.game_id
          ).run();
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
            `UPDATE games SET home_score = ?, away_score = ?, status = ?, ical_sequence = ?, updated_at = ?
             WHERE game_id = ?`
          ).bind(
            game.home_score!,
            game.away_score!,
            game.status,
            existing.ical_sequence + 1,
            now,
            game.game_id
          ).run();
          counts.updated.games++;

          if (game.home_tid != null) teamsWithGameChanges.add(game.home_tid);
          if (game.away_tid != null) teamsWithGameChanges.add(game.away_tid);
          if (existing.home_tid != null) teamsWithGameChanges.add(existing.home_tid);
          if (existing.away_tid != null) teamsWithGameChanges.add(existing.away_tid);
        }
      }
    }

    // ── 6. Invalidate team_feed_meta for changed teams ────────────────────────
    for (const tid of teamsWithGameChanges) {
      const metaExists = await env.DB.prepare(
        'SELECT tid FROM team_feed_meta WHERE tid = ?'
      ).bind(tid).first<{ tid: number }>();

      if (metaExists) {
        await env.DB.prepare(
          `UPDATE team_feed_meta SET last_modified_at = ?, etag = '', cached_ical = NULL WHERE tid = ?`
        ).bind(now, tid).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO team_feed_meta (tid, last_modified_at, game_count, etag, cached_ical, generated_at)
           VALUES (?, ?, 0, '', NULL, NULL)`
        ).bind(tid, now).run();
      }
    }

    // ── 7. Update divisions.last_scraped_at ───────────────────────────────────
    await env.DB.prepare(
      `UPDATE divisions SET last_scraped_at = ? WHERE level_id = ?`
    ).bind(now, body.division.level_id).run();

    // ── 8. Insert scrape_runs record ──────────────────────────────────────────
    const finishedAt = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO scrape_runs (target_type, target_key, started_at, finished_at, status, rows_inserted, rows_updated)
       VALUES ('division', ?, ?, ?, 'success', ?, ?)`
    ).bind(
      String(body.division.level_id),
      startedAt,
      finishedAt,
      counts.inserted.leagues + counts.inserted.divisions + counts.inserted.teams + counts.inserted.games,
      counts.updated.leagues + counts.updated.divisions + counts.updated.teams + counts.updated.games
    ).run();

    return jsonResponse({
      ok: true,
      inserted: counts.inserted,
      updated: counts.updated,
      new_teams: newTeams,
    }, 200);
  } catch (err: unknown) {
    // Try to log a failed scrape_runs entry (best-effort)
    try {
      const finishedAt = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `INSERT INTO scrape_runs (target_type, target_key, started_at, finished_at, status, rows_inserted, rows_updated)
         VALUES ('division', ?, ?, ?, 'failed', 0, 0)`
      ).bind(String(body.division.level_id), startedAt, finishedAt).run();
    } catch {
      // ignore secondary error
    }

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
