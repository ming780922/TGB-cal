import type { Env } from './index';
import { requireAuth } from './auth';

/**
 * Games whose TGB page carries no `eid=` link yet are given a synthetic id by the scraper
 * (see PLACEHOLDER_MIN_ID in packages/scraper/division.js, the source of truth). Real TGB
 * eids are ~5 digits, so anything at or above this threshold is one of ours.
 *
 * Deliberately duplicated rather than imported: division.js loads cheerio at module top
 * level, and the worker has no dependency on packages/ — importing it would pull cheerio
 * into the Worker bundle.
 */
const PLACEHOLDER_MIN_ID = 1_000_000_000;

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
  video_url?: string;
}

interface ExistingGame {
  game_id: number;
  level_id: number;
  scheduled_at: number;
  venue: string | null;
  home_tid: number | null;
  away_tid: number | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  video_url: string | null;
  // Nullable: these come from a LEFT JOIN, so a games row with no game_sync partner
  // yields null. Typing them non-null is what hid the NOT NULL violation on ical_uid.
  ical_sequence: number | null;
  ical_uid: string | null;
}

interface ChangedEvent {
  tid: number;
  event_type: 'new_game' | 'game_completed' | 'game_rescheduled' | 'video_url_added';
  game_id: number;
  video_url?: string;
}

// ─── Phase 1: Metadata Upsert (Leagues & Divisions) ───────────────────────────

export async function handleMetadataUpsert(request: Request, env: Env): Promise<Response> {
  const authError = requireAuth(request, env);
  if (authError) return authError;

  let body: { leagues: LeagueInput[]; divisions: DivisionInput[] };
  try {
    body = await request.json();
    if (!Array.isArray(body.leagues) || !Array.isArray(body.divisions)) throw new Error('Expected arrays');
  } catch {
    return jsonResponse({ error: 'Invalid JSON body, expected leagues and divisions arrays' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);

  try {
    const stmts = [
      ...body.leagues.map(l =>
        env.DB.prepare(
          `INSERT INTO leagues (gid, name, created_at, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(gid) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
           WHERE leagues.name != excluded.name`,
        ).bind(l.gid, l.name, now, now),
      ),
      ...body.divisions.map(d =>
        env.DB.prepare(
          `INSERT INTO divisions (level_id, gid, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(level_id) DO UPDATE SET name = excluded.name, gid = excluded.gid, updated_at = excluded.updated_at
           WHERE divisions.name != excluded.name`,
        ).bind(d.level_id, d.gid, d.name, now, now),
      ),
    ];

    if (stmts.length > 0) await env.DB.batch(stmts);
    return jsonResponse({ ok: true }, 200);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'Database error', detail }, 500);
  }
}

// ─── Phase 2: Division Upsert (Teams, Standings, Games) ───────────────────────

export async function handleDivisionUpsert(request: Request, env: Env): Promise<Response> {
  const authError = requireAuth(request, env);
  if (authError) return authError;

  let body: { teams: TeamInput[]; team_divisions: TeamDivisionInput[]; games: GameInput[] };
  try {
    body = await request.json();
    if (!Array.isArray(body.teams) || !Array.isArray(body.team_divisions) || !Array.isArray(body.games))
      throw new Error('Expected arrays');
  } catch {
    return jsonResponse({ error: 'Invalid JSON body, expected teams, team_divisions, and games arrays' }, 400);
  }

  // Validated before any write: the reap in phase 3 issues a DELETE keyed on the caller's
  // level_id, and the game ids are interpolated into an IN list.
  if (body.games.some(g => !Number.isSafeInteger(g.game_id) || g.game_id <= 0)) {
    return jsonResponse({ error: 'Every game_id must be a positive safe integer' }, 400);
  }
  if (new Set(body.games.map(g => g.level_id)).size > 1) {
    return jsonResponse({ error: 'All games must belong to a single level_id' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const counts = { teams_inserted: 0, teams_updated: 0, team_divisions: 0, games_inserted: 0, games_updated: 0 };
  const changedEvents: ChangedEvent[] = [];

  try {
    // ── 1. Batch upsert teams ────────────────────────────────────────────────
    if (body.teams.length > 0) {
      await env.DB.batch(
        body.teams.map(t =>
          env.DB.prepare(
            `INSERT INTO teams (tid, name, created_at, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(tid) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
             WHERE teams.name != excluded.name`,
          ).bind(t.tid, t.name, now, now),
        ),
      );
    }

    // ── 2. Batch upsert team_divisions ───────────────────────────────────────
    if (body.team_divisions.length > 0) {
      await env.DB.batch(
        body.team_divisions.map(td =>
          env.DB.prepare(
            `INSERT INTO team_divisions (tid, level_id, gid, wins, losses, rank, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(tid, level_id, gid) DO UPDATE SET
               wins = excluded.wins, losses = excluded.losses, rank = excluded.rank, updated_at = excluded.updated_at`,
          ).bind(td.tid, td.level_id, td.gid, td.wins, td.losses, td.rank ?? null, now, now),
        ),
      );
    }

    // ── 3. Process games ─────────────────────────────────────────────────────
    if (body.games.length === 0) {
      return jsonResponse({ ok: true, counts, changed: [] }, 200);
    }

    const levelId = body.games[0].level_id;
    // Safe to interpolate: every id was proven a positive safe integer above.
    const incomingIds = body.games.map(g => g.game_id);
    const incomingIdList = incomingIds.join(',');

    // This division's games *and* any incoming id that already exists elsewhere. Without the
    // second clause a game that collided with — or moved from — another division looks new,
    // gets a plain INSERT, and the primary-key violation discards the whole batch.
    const { results: existingGames } = await env.DB.prepare(
      `SELECT g.game_id, g.level_id, g.scheduled_at, g.venue, g.home_tid, g.away_tid,
              g.status, g.home_score, g.away_score, g.video_url, s.ical_sequence, s.ical_uid
       FROM games g
       LEFT JOIN game_sync s ON g.game_id = s.game_id
       WHERE g.level_id = ? OR g.game_id IN (${incomingIdList})`,
    )
      .bind(levelId)
      .all<ExistingGame>();

    const existingById = new Map(existingGames.map(g => [g.game_id, g]));
    const incomingIdSet = new Set(incomingIds);
    // Promotion candidates: placeholders in *this* division that this scrape no longer lists.
    // When the real eid appears (or the scraper's hash changes) the new row inherits their
    // ical_uid, so subscribers don't see the event vanish and reappear.
    const tempGames = existingGames.filter(
      g => g.level_id === levelId && g.game_id >= PLACEHOLDER_MIN_ID && !incomingIdSet.has(g.game_id),
    );
    // A claimed placeholder leaves the pool: letting two games inherit one row's ical_uid
    // trips the UNIQUE constraint on game_sync.ical_uid.
    const claimedTempIds = new Set<number>();

    const deleteStmts: ReturnType<D1Database['prepare']>[] = [];
    const writeStmts: ReturnType<D1Database['prepare']>[] = [];

    for (const game of body.games) {
      let existing = existingById.get(game.game_id) ?? null;
      let inheritedSync: { uid: string | null; seq: number | null } | null = null;

      // Promotion: incoming real game_id replaces a temp placeholder
      if (!existing && game.home_tid != null && game.away_tid != null) {
        const available = tempGames.filter(g => !claimedTempIds.has(g.game_id));
        const exactMatch = available.find(
          g => g.home_tid === game.home_tid && g.away_tid === game.away_tid && g.scheduled_at === game.scheduled_at,
        );
        const scheduledMatches = available.filter(
          g => g.home_tid === game.home_tid && g.away_tid === game.away_tid && g.status === 'scheduled',
        );
        const claim = exactMatch ?? (scheduledMatches.length === 1 ? scheduledMatches[0] : null);
        if (claim) {
          inheritedSync = { uid: claim.ical_uid, seq: claim.ical_sequence };
          claimedTempIds.add(claim.game_id);
          deleteStmts.push(env.DB.prepare('DELETE FROM games WHERE game_id = ?').bind(claim.game_id));
        }
      }

      if (!existing) {
        // Insert new game
        // A promoted placeholder can have no game_sync row at all, so both fields need a floor.
        const icalUid = inheritedSync?.uid ?? `game-${game.game_id}@tgb.ming060.com`;
        const icalSeq = inheritedSync ? (inheritedSync.seq ?? 0) + 1 : 0;

        // ON CONFLICT rather than a bare INSERT: D1.batch() is a single transaction, so one
        // constraint violation would discard the teams and standings written alongside.
        writeStmts.push(
          env.DB.prepare(
            `INSERT INTO games (game_id, level_id, home_tid, away_tid, scheduled_at, venue, home_score, away_score, status, video_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(game_id) DO UPDATE SET
               level_id = excluded.level_id, home_tid = excluded.home_tid, away_tid = excluded.away_tid,
               scheduled_at = excluded.scheduled_at, venue = excluded.venue,
               home_score = excluded.home_score, away_score = excluded.away_score,
               status = excluded.status, video_url = COALESCE(excluded.video_url, games.video_url),
               updated_at = excluded.updated_at`,
          ).bind(
            game.game_id, game.level_id,
            game.home_tid ?? null, game.away_tid ?? null,
            game.scheduled_at, game.venue ?? null,
            game.home_score ?? null, game.away_score ?? null,
            game.status, game.video_url ?? null, now, now,
          ),
        );
        // The conflict clause deliberately leaves ical_uid alone — preserving it is what keeps
        // existing calendar subscriptions pointing at the same event.
        writeStmts.push(
          env.DB.prepare(
            `INSERT INTO game_sync (game_id, ical_uid, ical_sequence, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(game_id) DO UPDATE SET
               ical_sequence = game_sync.ical_sequence + 1, updated_at = excluded.updated_at`,
          ).bind(game.game_id, icalUid, icalSeq, now),
        );

        counts.games_inserted++;
        if (game.home_tid) changedEvents.push({ tid: game.home_tid, event_type: 'new_game', game_id: game.game_id });
        if (game.away_tid) changedEvents.push({ tid: game.away_tid, event_type: 'new_game', game_id: game.game_id });
      } else if (existing.scheduled_at > now) {
        // Future game: update if schedule/teams changed
        const changed =
          existing.scheduled_at !== game.scheduled_at ||
          (existing.venue ?? null) !== (game.venue ?? null) ||
          (existing.home_tid ?? null) !== (game.home_tid ?? null) ||
          (existing.away_tid ?? null) !== (game.away_tid ?? null) ||
          existing.status !== game.status;

        if (changed) {
          writeStmts.push(
            env.DB.prepare(
              `UPDATE games SET level_id=?, home_tid=?, away_tid=?, scheduled_at=?, venue=?, status=?, updated_at=? WHERE game_id=?`,
            ).bind(game.level_id, game.home_tid ?? null, game.away_tid ?? null, game.scheduled_at, game.venue ?? null, game.status, now, game.game_id),
          );
          writeStmts.push(
            env.DB.prepare(`UPDATE game_sync SET ical_sequence = ical_sequence + 1, updated_at = ? WHERE game_id = ?`).bind(now, game.game_id),
          );
          counts.games_updated++;
          for (const tid of [game.home_tid, game.away_tid, existing.home_tid, existing.away_tid]) {
            if (tid) changedEvents.push({ tid, event_type: 'game_rescheduled', game_id: game.game_id });
          }
        }
      } else {
        // Past game: write scores if newly available, or video_url if newly added
        const incomingHasScores = game.home_score != null && game.away_score != null;
        const videoAdded = game.video_url != null && existing.video_url == null;

        if (existing.home_score === null && incomingHasScores) {
          writeStmts.push(
            env.DB.prepare(`UPDATE games SET home_score=?, away_score=?, status=?, video_url=COALESCE(?, video_url), updated_at=? WHERE game_id=?`).bind(
              game.home_score!, game.away_score!, game.status, game.video_url ?? null, now, game.game_id,
            ),
          );
          writeStmts.push(
            env.DB.prepare(`UPDATE game_sync SET ical_sequence = ical_sequence + 1, updated_at = ? WHERE game_id = ?`).bind(now, game.game_id),
          );
          counts.games_updated++;
          for (const tid of [game.home_tid, game.away_tid, existing.home_tid, existing.away_tid]) {
            if (tid) changedEvents.push({ tid, event_type: 'game_completed', game_id: game.game_id });
          }
        } else if (videoAdded) {
          writeStmts.push(
            env.DB.prepare(`UPDATE games SET video_url=?, updated_at=? WHERE game_id=?`).bind(
              game.video_url!, now, game.game_id,
            ),
          );
          writeStmts.push(
            env.DB.prepare(`UPDATE game_sync SET ical_sequence = ical_sequence + 1, updated_at = ? WHERE game_id = ?`).bind(now, game.game_id),
          );
          counts.games_updated++;
          for (const tid of [game.home_tid, game.away_tid, existing.home_tid, existing.away_tid]) {
            if (tid) changedEvents.push({ tid, event_type: 'video_url_added', game_id: game.game_id, video_url: game.video_url! });
          }
        }
      }
    }

    // Placeholders this scrape no longer lists are gone for good — cancelled, rescheduled, or
    // re-hashed under a newer id scheme. Left behind they surface as duplicate fixtures.
    // game_sync follows via ON DELETE CASCADE.
    const reapStmt = env.DB.prepare(
      `DELETE FROM games
       WHERE level_id = ? AND game_id >= ? AND game_id NOT IN (${incomingIdList})`,
    ).bind(levelId, PLACEHOLDER_MIN_ID);

    await env.DB.batch([...deleteStmts, ...writeStmts, reapStmt]);

    // ── 4. Batch invalidate team_sync for affected teams ─────────────────────
    const affectedTids = [...new Set(changedEvents.map(e => e.tid))];
    if (affectedTids.length > 0) {
      await env.DB.batch(
        affectedTids.map(tid =>
          env.DB.prepare(
            `INSERT INTO team_sync (tid, last_modified_at, ical_etag, ical_cached, ical_generated_at, updated_at)
             VALUES (?, ?, '', NULL, NULL, ?)
             ON CONFLICT(tid) DO UPDATE SET
               last_modified_at = excluded.last_modified_at, ical_etag = '', ical_cached = NULL, updated_at = excluded.updated_at`,
          ).bind(tid, now, now),
        ),
      );
    }

    // Deduplicate changed events: one per (tid, event_type)
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
