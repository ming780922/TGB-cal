import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isPlaceholderGameId } from './division.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Run wrangler from apps/worker where it is installed and wrangler.toml lives
const WORKER_DIR = resolve(__dirname, '../../apps/worker');
const DB_NAME = 'tgb-cal';

const LOCAL = process.env.DB_TARGET === 'local';
const TARGET = LOCAL ? '--local --persist-to ../../apps/web/.wrangler/state' : '--remote';

function wrangler(args, opts = {}) {
  return execSync(`npx wrangler d1 execute ${DB_NAME} ${TARGET} ${args}`, {
    encoding: 'utf8',
    cwd: WORKER_DIR,
    ...opts,
  });
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(Math.trunc(v));
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function queryD1(sql) {
  const flat = sql.replace(/\s+/g, ' ').trim();
  const out = wrangler(`--command ${JSON.stringify(flat)} --json`);
  return JSON.parse(out)[0]?.results ?? [];
}

// D1 occasionally rejects a remote import while another is still settling. These are
// transient and unrelated to the SQL, so a short backoff clears them; constraint
// violations are surfaced immediately.
const TRANSIENT_D1_PATTERNS = [
  /long-running import/i,
  /D1_RESET_DO/,
  /Network connection lost/i,
  /internal error/i,
];

function isTransientD1Error(err) {
  const text = `${err?.message ?? ''}${err?.stdout ?? ''}${err?.stderr ?? ''}`;
  return TRANSIENT_D1_PATTERNS.some(p => p.test(text));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function executeD1(stmts) {
  const sql = (Array.isArray(stmts) ? stmts : [stmts]).join('\n');
  if (!sql.trim()) return;
  const tmp = join(tmpdir(), `d1_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(tmp, sql + '\n');
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        // Piped rather than inherited so the retry check can read wrangler's diagnostics;
        // the output is echoed to keep the CI log identical to before.
        process.stdout.write(wrangler(`--file ${tmp}`) ?? '');
        return;
      } catch (err) {
        process.stdout.write(`${err.stdout ?? ''}${err.stderr ?? ''}`);
        if (attempt >= 3 || !isTransientD1Error(err)) throw err;
        console.warn(`  - Transient D1 error (attempt ${attempt}/3), retrying in ${attempt * 5}s...`);
        sleepSync(attempt * 5000);
      }
    }
  } finally {
    unlinkSync(tmp);
  }
}

export function upsertMetadata(leagues, divisions) {
  const now = Math.floor(Date.now() / 1000);
  executeD1([
    ...leagues.map(l =>
      `INSERT INTO leagues (gid, name, created_at, updated_at) VALUES (${esc(l.gid)}, ${esc(l.name)}, ${now}, ${now})
       ON CONFLICT(gid) DO UPDATE SET name=excluded.name, updated_at=${now} WHERE leagues.name != excluded.name;`
    ),
    ...divisions.map(d =>
      `INSERT INTO divisions (level_id, gid, name, created_at, updated_at) VALUES (${esc(d.level_id)}, ${esc(d.gid)}, ${esc(d.name)}, ${now}, ${now})
       ON CONFLICT(level_id) DO UPDATE SET name=excluded.name, gid=excluded.gid, updated_at=${now} WHERE divisions.name != excluded.name;`
    ),
  ]);
}

/**
 * Decide which of a division's existing games the current scrape says are gone.
 *
 * A game the division page no longer lists is cancelled, rescheduled out, or (for placeholders)
 * re-hashed under the current id scheme. Left in place it lingers forever as a phantom fixture.
 *
 * Placeholders are reaped unconditionally: they carry no TGB identity, so a missing one is never
 * recoverable. Real eids are reaped only while still in the future — a *past* real-eid game
 * vanishing from the page is far more likely a parse hiccup or a markup change than a
 * cancellation, and a completed game is history worth keeping.
 *
 * Games already claimed for placeholder→eid promotion are excluded: they are deleted by the
 * promotion path, and reaping them again would double-count the division's cancellations.
 *
 * Known limitation: a real-eid game that moves to a different division is reaped here and
 * re-inserted fresh by the new division's scrape, losing its ical_uid. Placeholders already
 * behave this way; the future-only guard keeps the blast radius small.
 *
 * Pure — exported for tests.
 */
export function selectCancelledGames(existingGames, { levelId, scrapedIds, claimedTempIds, now }) {
  const scraped = new Set(scrapedIds);
  return existingGames.filter(g =>
    g.level_id === levelId &&
    !scraped.has(g.game_id) &&
    !claimedTempIds.has(g.game_id) &&
    (isPlaceholderGameId(g.game_id) || g.scheduled_at > now)
  );
}

export function upsertDivisionData(teams, teamDivisions, games) {
  const now = Math.floor(Date.now() / 1000);
  const counts = { teams_inserted: 0, teams_updated: 0, team_divisions: 0, games_inserted: 0, games_updated: 0, games_deleted: 0 };
  const changedEvents = [];

  const teamStmts = teams.map(t =>
    `INSERT INTO teams (tid, name, created_at, updated_at) VALUES (${esc(t.tid)}, ${esc(t.name)}, ${now}, ${now})
     ON CONFLICT(tid) DO UPDATE SET name=excluded.name, updated_at=${now} WHERE teams.name != excluded.name;`
  );

  const tdStmts = teamDivisions.map(td =>
    `INSERT INTO team_divisions (tid, level_id, gid, wins, losses, rank, created_at, updated_at)
     VALUES (${esc(td.tid)}, ${esc(td.level_id)}, ${esc(td.gid)}, ${td.wins}, ${td.losses}, ${esc(td.rank ?? null)}, ${now}, ${now})
     ON CONFLICT(tid, level_id, gid) DO UPDATE SET wins=excluded.wins, losses=excluded.losses, rank=excluded.rank, updated_at=${now};`
  );

  if (games.length === 0) {
    executeD1([...teamStmts, ...tdStmts]);
    return { counts, changed: [] };
  }

  const levelId = games[0].level_id;
  const scrapedIds = games.map(g => Math.trunc(g.game_id));

  // Look up this division's games *and* any scraped id that already exists elsewhere.
  // Without the second clause a game that collided with, or moved from, another division
  // looks new, gets a plain INSERT, and the primary-key violation rolls back the whole
  // division — teams and standings included.
  const existingGames = queryD1(
    `SELECT g.game_id, g.level_id, g.scheduled_at, g.venue, g.home_tid, g.away_tid,
            g.status, g.home_score, g.away_score, g.video_url, s.ical_sequence, s.ical_uid
     FROM games g LEFT JOIN game_sync s ON g.game_id = s.game_id
     WHERE g.level_id = ${levelId} OR g.game_id IN (${scrapedIds.join(',')})`
  );

  const existingById = new Map(existingGames.map(g => [g.game_id, g]));
  // Placeholder rows in this division are promotion candidates: when the real eid finally
  // appears (or our hash changes) the new row inherits their ical_uid instead of the
  // subscriber seeing the event vanish and come back.
  const tempGames = existingGames.filter(
    g => g.level_id === levelId && isPlaceholderGameId(g.game_id) && !scrapedIds.includes(g.game_id)
  );
  const claimedTempIds = new Set();

  const deleteStmts = [];
  const gameStmts = [];

  for (const game of games) {
    const existing = existingById.get(game.game_id) ?? null;
    let inheritedSync = null;

    if (!existing && game.home_tid != null && game.away_tid != null) {
      // A claimed placeholder is removed from the pool: letting two games inherit the same
      // row's ical_uid trips the UNIQUE constraint on game_sync.ical_uid.
      const available = tempGames.filter(g => !claimedTempIds.has(g.game_id));
      const exactMatch = available.find(g =>
        g.home_tid === game.home_tid && g.away_tid === game.away_tid && g.scheduled_at === game.scheduled_at
      );
      const scheduled = available.filter(g =>
        g.home_tid === game.home_tid && g.away_tid === game.away_tid && g.status === 'scheduled'
      );
      const claim = exactMatch ?? (scheduled.length === 1 ? scheduled[0] : null);
      if (claim) {
        inheritedSync = {
          uid: claim.ical_uid,
          seq: claim.ical_sequence,
          moved:
            claim.scheduled_at !== game.scheduled_at ||
            (claim.venue ?? null) !== (game.venue ?? null),
        };
        claimedTempIds.add(claim.game_id);
        deleteStmts.push(`DELETE FROM games WHERE game_id = ${claim.game_id};`);
      }
    }

    if (!existing) {
      // ical_uid/ical_sequence come from a LEFT JOIN, so they are NULL whenever a games row
      // exists without its game_sync partner — inheriting blindly violates NOT NULL.
      const uid = inheritedSync?.uid ?? `game-${game.game_id}@tgb.ming060.com`;
      const seq = inheritedSync ? (inheritedSync.seq ?? 0) + 1 : 0;
      // ON CONFLICT rather than a bare INSERT: wrangler runs the division's statements as one
      // all-or-nothing file, so a single constraint violation would discard the teams and
      // standings written alongside these games.
      gameStmts.push(
        `INSERT INTO games (game_id, level_id, home_tid, away_tid, scheduled_at, venue, home_score, away_score, status, video_url, created_at, updated_at)
         VALUES (${esc(game.game_id)}, ${esc(game.level_id)}, ${esc(game.home_tid)}, ${esc(game.away_tid)}, ${esc(game.scheduled_at)}, ${esc(game.venue)}, ${esc(game.home_score)}, ${esc(game.away_score)}, ${esc(game.status)}, ${esc(game.video_url)}, ${now}, ${now})
         ON CONFLICT(game_id) DO UPDATE SET level_id=excluded.level_id, home_tid=excluded.home_tid, away_tid=excluded.away_tid,
           scheduled_at=excluded.scheduled_at, venue=excluded.venue, home_score=excluded.home_score,
           away_score=excluded.away_score, status=excluded.status, video_url=excluded.video_url, updated_at=${now};`
      );
      gameStmts.push(
        `INSERT INTO game_sync (game_id, ical_uid, ical_sequence, updated_at) VALUES (${esc(game.game_id)}, ${esc(uid)}, ${seq}, ${now})
         ON CONFLICT(game_id) DO UPDATE SET ical_sequence = game_sync.ical_sequence + 1, updated_at=${now};`
      );
      counts.games_inserted++;
      // Which branch a game lands in says nothing about what happened to it: a fixture TGB
      // published without an eid lives under a placeholder id and reappears under its real eid
      // once it has been played, so an unseen game_id is routinely a finished game. Classify by
      // the scraped state instead. A claimed placeholder is a fixture subscribers already have,
      // so nothing but a genuine time/venue move is worth a push.
      const eventType =
        game.home_score != null && game.away_score != null ? 'game_completed'
        : inheritedSync ? (inheritedSync.moved ? 'game_rescheduled' : null)
        : 'new_game';
      if (eventType) {
        for (const tid of [game.home_tid, game.away_tid]) {
          if (tid) changedEvents.push({ tid, event_type: eventType, game_id: game.game_id });
        }
      }
    } else if (existing.scheduled_at > now) {
      const changed =
        existing.scheduled_at !== game.scheduled_at ||
        (existing.venue ?? null) !== (game.venue ?? null) ||
        (existing.home_tid ?? null) !== (game.home_tid ?? null) ||
        (existing.away_tid ?? null) !== (game.away_tid ?? null) ||
        existing.status !== game.status;
      if (changed) {
        gameStmts.push(
          `UPDATE games SET level_id=${esc(game.level_id)}, home_tid=${esc(game.home_tid)}, away_tid=${esc(game.away_tid)},
           scheduled_at=${esc(game.scheduled_at)}, venue=${esc(game.venue)}, status=${esc(game.status)}, updated_at=${now}
           WHERE game_id=${esc(game.game_id)};`
        );
        gameStmts.push(
          `UPDATE game_sync SET ical_sequence = ical_sequence + 1, updated_at=${now} WHERE game_id=${esc(game.game_id)};`
        );
        counts.games_updated++;
        for (const tid of [game.home_tid, game.away_tid, existing.home_tid, existing.away_tid]) {
          if (tid) changedEvents.push({ tid, event_type: 'game_rescheduled', game_id: game.game_id });
        }
      }
    } else {
      const hasScores = game.home_score != null && game.away_score != null;
      const videoAdded = existing.video_url == null && game.video_url != null;

      if (existing.home_score === null && hasScores) {
        gameStmts.push(
          `UPDATE games SET home_score=${esc(game.home_score)}, away_score=${esc(game.away_score)}, status=${esc(game.status)}, video_url=${esc(game.video_url)}, updated_at=${now}
           WHERE game_id=${esc(game.game_id)};`
        );
        gameStmts.push(
          `UPDATE game_sync SET ical_sequence = ical_sequence + 1, updated_at=${now} WHERE game_id=${esc(game.game_id)};`
        );
        counts.games_updated++;
        for (const tid of [game.home_tid, game.away_tid, existing.home_tid, existing.away_tid]) {
          if (tid) changedEvents.push({ tid, event_type: 'game_completed', game_id: game.game_id });
        }
      } else if (videoAdded) {
        gameStmts.push(
          `UPDATE games SET video_url=${esc(game.video_url)}, updated_at=${now} WHERE game_id=${esc(game.game_id)};`
        );
        counts.games_updated++;
        for (const tid of [game.home_tid, game.away_tid]) {
          if (tid) changedEvents.push({ tid, event_type: 'video_url_added', game_id: game.game_id, video_url: game.video_url });
        }
      }
    }
  }

  const cancelled = selectCancelledGames(existingGames, { levelId, scrapedIds, claimedTempIds, now });

  const reapStmts = cancelled.length > 0
    ? [`DELETE FROM games WHERE game_id IN (${cancelled.map(g => Math.trunc(g.game_id)).join(',')});`]
    : [];
  counts.games_deleted = cancelled.length;

  // Every reaped game's teams must have their iCal cache busted, or the feed keeps serving the
  // cancelled VEVENT forever (the team page reads D1 live, so it self-corrects — the cache does
  // not). Only *future* cancellations are worth waking a subscriber's phone for, so past ones
  // contribute to affectedTids without becoming a push event.
  const cancelledTids = new Set();
  for (const g of cancelled) {
    for (const tid of [g.home_tid, g.away_tid]) {
      if (!tid) continue;
      cancelledTids.add(tid);
      if (g.scheduled_at > now) {
        changedEvents.push({ tid, event_type: 'game_cancelled', game_id: g.game_id });
      }
    }
  }

  const affectedTids = [...new Set([...changedEvents.map(e => e.tid), ...cancelledTids])];

  const syncStmts = affectedTids.map(tid =>
    `INSERT INTO team_sync (tid, last_modified_at, ical_etag, ical_cached, ical_generated_at, updated_at)
     VALUES (${tid}, ${now}, '', NULL, NULL, ${now})
     ON CONFLICT(tid) DO UPDATE SET last_modified_at=${now}, ical_etag='', ical_cached=NULL, updated_at=${now};`
  );

  executeD1([...teamStmts, ...tdStmts, ...deleteStmts, ...gameStmts, ...reapStmts, ...syncStmts]);

  const seen = new Set();
  const changed = changedEvents.filter(e => {
    const key = `${e.tid}:${e.event_type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { counts, changed };
}

// Games older than this stop being chased hourly. Without a lower bound the video_url IS NULL
// clause never stops matching — most past games never get a video — so every division that has
// ever played stays "pending" forever and the hourly run re-scrapes all of them. full-scrape.js
// still sweeps everything once a day, so a score or video that lands later is not lost, it just
// arrives on the daily pass instead of the hourly one.
const PENDING_WINDOW_SECONDS = 7 * 86400;

export function queryPendingDivisions() {
  return queryD1(
    `SELECT DISTINCT d.level_id, d.gid, d.name as division_name, l.name as league_name
     FROM games g
     JOIN divisions d ON g.level_id = d.level_id
     JOIN leagues l ON d.gid = l.gid
     WHERE g.scheduled_at < unixepoch()
       AND g.scheduled_at > unixepoch() - ${PENDING_WINDOW_SECONDS}
       AND (g.status != 'completed' OR g.video_url IS NULL)`
  );
}

export function querySubscriptions(tids) {
  if (tids.length === 0) return [];
  return queryD1(
    `SELECT ps.endpoint, ps.p256dh, ps.auth, ps.tid, ps.id, t.name as team_name
     FROM push_subscriptions ps
     JOIN teams t ON t.tid = ps.tid
     WHERE ps.tid IN (${tids.join(',')})`
  );
}

export function deleteSubscription(tid, endpoint) {
  executeD1(`DELETE FROM push_subscriptions WHERE endpoint = ${esc(endpoint)} AND tid = ${tid};`);
}
