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
  gid: number;
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

interface ChangedEvent {
  tid: number;
  event_type: 'new_game' | 'game_completed' | 'game_rescheduled';
  game_id: number;
}

// ─── Phase 1: Metadata Upsert (Leagues & Divisions) ───────────────────────────

export async function handleMetadataUpsert(request: Request, env: Env): Promise<Response> {
  const authError = requireAuth(request, env);
  if (authError) return authError;

  let body: { leagues: LeagueInput[], divisions: DivisionInput[] };
  try {
    body = await request.json();
    if (!Array.isArray(body.leagues) || !Array.isArray(body.divisions)) throw new Error('Expected arrays');
  } catch {
    return jsonResponse({ error: 'Invalid JSON body, expected leagues and divisions arrays' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const counts = { leagues_inserted: 0, leagues_updated: 0, div_inserted: 0, div_updated: 0 };

  try {
    // Upsert Leagues
    for (const league of body.leagues) {
      const existing = await env.DB.prepare('SELECT gid, name FROM leagues WHERE gid = ?').bind(league.gid).first<{ gid: number; name: string }>();
      if (!existing) {
        await env.DB.prepare(`INSERT INTO leagues (gid, name, created_at, updated_at) VALUES (?, ?, ?, ?)`).bind(league.gid, league.name, now, now).run();
        counts.leagues_inserted++;
      } else if (existing.name !== league.name) {
        await env.DB.prepare(`UPDATE leagues SET name = ?, updated_at = ? WHERE gid = ?`).bind(league.name, now, league.gid).run();
        counts.leagues_updated++;
      }
    }

    // Upsert Divisions
    for (const div of body.divisions) {
      const existing = await env.DB.prepare('SELECT level_id, gid, name FROM divisions WHERE level_id = ? AND gid = ?').bind(div.level_id, div.gid).first<{ level_id: number; gid: number; name: string }>();
      if (!existing) {
        await env.DB.prepare(`INSERT INTO divisions (level_id, gid, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).bind(div.level_id, div.gid, div.name, now, now).run();
        counts.div_inserted++;
      } else if (existing.name !== div.name) {
        await env.DB.prepare(`UPDATE divisions SET name = ?, updated_at = ? WHERE level_id = ? AND gid = ?`).bind(div.name, now, div.level_id, div.gid).run();
        counts.div_updated++;
      }
    }

    return jsonResponse({ ok: true, counts }, 200);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'Database error', detail }, 500);
  }
}

// ─── Phase 2: Division Upsert (Teams, Standings, Games) ───────────────────────

export async function handleDivisionUpsert(request: Request, env: Env): Promise<Response> {
  const authError = requireAuth(request, env);
  if (authError) return authError;

  let body: { teams: TeamInput[], team_divisions: TeamDivisionInput[], games: GameInput[] };
  try {
    body = await request.json();
    if (!Array.isArray(body.teams) || !Array.isArray(body.team_divisions) || !Array.isArray(body.games)) throw new Error('Expected arrays');
  } catch {
    return jsonResponse({ error: 'Invalid JSON body, expected teams, team_divisions, and games arrays' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const counts = { teams_inserted: 0, teams_updated: 0, team_divisions: 0, games_inserted: 0, games_updated: 0 };
  const changedEvents: ChangedEvent[] = [];
  const recordEvent = (tid: number | null | undefined, event_type: ChangedEvent['event_type'], game_id: number) => {
    if (tid != null) changedEvents.push({ tid, event_type, game_id });
  };

  try {
    // Upsert Teams
    for (const team of body.teams) {
      const existing = await env.DB.prepare('SELECT tid, name FROM teams WHERE tid = ?').bind(team.tid).first<{ tid: number; name: string }>();
      if (!existing) {
        await env.DB.prepare(`INSERT INTO teams (tid, name, created_at, updated_at) VALUES (?, ?, ?, ?)`).bind(team.tid, team.name, now, now).run();
        counts.teams_inserted++;
      } else if (existing.name !== team.name) {
        await env.DB.prepare(`UPDATE teams SET name = ?, updated_at = ? WHERE tid = ?`).bind(team.name, now, team.tid).run();
        counts.teams_updated++;
      }
    }

    // Upsert Standings (team_divisions)
    for (const td of body.team_divisions) {
      const existing = await env.DB.prepare('SELECT tid, wins, losses, rank FROM team_divisions WHERE tid = ? AND level_id = ? AND gid = ?').bind(td.tid, td.level_id, td.gid).first<{ tid: number; wins: number; losses: number; rank: number | null }>();
      if (!existing) {
        await env.DB.prepare(`INSERT INTO team_divisions (tid, level_id, gid, wins, losses, rank, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(td.tid, td.level_id, td.gid, td.wins, td.losses, td.rank ?? null, now, now).run();
        counts.team_divisions++;
      } else if (existing.wins !== td.wins || existing.losses !== td.losses || existing.rank !== (td.rank ?? null)) {
        await env.DB.prepare(`UPDATE team_divisions SET wins = ?, losses = ?, rank = ?, updated_at = ? WHERE tid = ? AND level_id = ? AND gid = ?`).bind(td.wins, td.losses, td.rank ?? null, now, td.tid, td.level_id, td.gid).run();
        counts.team_divisions++;
      }
    }

    // Upsert Games (with promotion/matching logic)
    for (const game of body.games) {
      let existing = await env.DB.prepare(
        `SELECT g.game_id, g.scheduled_at, g.venue, g.home_tid, g.away_tid, g.status, g.home_score, s.ical_sequence, s.ical_uid
         FROM games g
         LEFT JOIN game_sync s ON g.game_id = s.game_id
         WHERE g.game_id = ?`
      ).bind(game.game_id).first<ExistingGame & { ical_uid: string }>();

      let inheritedSync: { uid: string; seq: number } | null = null;

      // Promotion Fallback
      if (!existing && game.home_tid != null && game.away_tid != null) {
        const matched = await env.DB.prepare(
          `SELECT g.game_id, g.scheduled_at, g.venue, g.status, s.ical_uid, s.ical_sequence
           FROM games g
           JOIN game_sync s ON g.game_id = s.game_id
           WHERE g.level_id = ? AND g.home_tid = ? AND g.away_tid = ? AND g.scheduled_at = ? AND g.game_id >= 1000000000`
        ).bind(game.level_id, game.home_tid, game.away_tid, game.scheduled_at).first<ExistingGame & { ical_uid: string }>();

        if (matched) {
          inheritedSync = { uid: matched.ical_uid, seq: matched.ical_sequence };
          await env.DB.prepare('DELETE FROM games WHERE game_id = ?').bind(matched.game_id).run();
        } else {
          const gamesBetweenTeams = await env.DB.prepare(
            `SELECT g.game_id, g.scheduled_at, g.venue, g.status, s.ical_uid, s.ical_sequence
             FROM games g
             JOIN game_sync s ON g.game_id = s.game_id
             WHERE g.level_id = ? AND g.home_tid = ? AND g.away_tid = ? AND g.status = 'scheduled'`
          ).bind(game.level_id, game.home_tid, game.away_tid).all<ExistingGame & { ical_uid: string }>();

          if (gamesBetweenTeams.results.length === 1) {
            const matched = gamesBetweenTeams.results[0];
            inheritedSync = { uid: matched.ical_uid, seq: matched.ical_sequence };
            await env.DB.prepare('DELETE FROM games WHERE game_id = ?').bind(matched.game_id).run();
          }
        }
      }

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

        const icalUid = inheritedSync ? inheritedSync.uid : `game-${game.game_id}@tgb.ming060.com`;
        const icalSeq = inheritedSync ? inheritedSync.seq + 1 : 0;
        
        await env.DB.prepare(
          `INSERT INTO game_sync (game_id, ical_uid, ical_sequence, updated_at)
           VALUES (?, ?, ?, ?)`
        ).bind(game.game_id, icalUid, icalSeq, now).run();

        counts.games_inserted++;
        recordEvent(game.home_tid, 'new_game', game.game_id);
        recordEvent(game.away_tid, 'new_game', game.game_id);
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
          ).bind(game.level_id, game.home_tid ?? null, game.away_tid ?? null, game.scheduled_at, game.venue ?? null, game.status, now, game.game_id).run();

          await env.DB.prepare(`UPDATE game_sync SET ical_sequence = ical_sequence + 1, updated_at = ? WHERE game_id = ?`).bind(now, game.game_id).run();

          counts.games_updated++;
          recordEvent(game.home_tid, 'game_rescheduled', game.game_id);
          recordEvent(game.away_tid, 'game_rescheduled', game.game_id);
          recordEvent(existing.home_tid, 'game_rescheduled', game.game_id);
          recordEvent(existing.away_tid, 'game_rescheduled', game.game_id);
        }
      } else {
        // Past game — only update if scores are newly available
        const incomingHasScores = game.home_score != null && game.away_score != null;
        if (existing.home_score === null && incomingHasScores) {
          await env.DB.prepare(`UPDATE games SET home_score = ?, away_score = ?, status = ?, updated_at = ? WHERE game_id = ?`).bind(game.home_score!, game.away_score!, game.status, now, game.game_id).run();
          await env.DB.prepare(`UPDATE game_sync SET ical_sequence = ical_sequence + 1, updated_at = ? WHERE game_id = ?`).bind(now, game.game_id).run();

          counts.games_updated++;
          recordEvent(game.home_tid, 'game_completed', game.game_id);
          recordEvent(game.away_tid, 'game_completed', game.game_id);
          recordEvent(existing.home_tid, 'game_completed', game.game_id);
          recordEvent(existing.away_tid, 'game_completed', game.game_id);
        }
      }
    }

    // Invalidate team feeds
    const teamsWithGameChanges = new Set(changedEvents.map(e => e.tid));
    for (const tid of teamsWithGameChanges) {
      const metaExists = await env.DB.prepare('SELECT tid FROM team_sync WHERE tid = ?').bind(tid).first<{ tid: number }>();
      if (metaExists) {
        await env.DB.prepare(`UPDATE team_sync SET last_modified_at = ?, ical_etag = '', ical_cached = NULL, updated_at = ? WHERE tid = ?`).bind(now, now, tid).run();
      } else {
        await env.DB.prepare(`INSERT INTO team_sync (tid, last_modified_at, ical_etag, ical_cached, ical_generated_at, updated_at) VALUES (?, ?, '', NULL, NULL, ?)`).bind(tid, now, now).run();
      }
    }

    // Deduplicate: one entry per (tid, event_type) — keep first game_id seen
    const seen = new Set<string>();
    const dedupedChanged = changedEvents.filter(e => {
      const key = `${e.tid}:${e.event_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return jsonResponse({ ok: true, counts, changed: dedupedChanged }, 200);
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
