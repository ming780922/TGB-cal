-- Migration 002: Add missing indexes
--
-- 001 shipped with exactly one index (idx_push_subscriptions_tid), so every query that
-- filters `games` by level_id, home_tid/away_tid or scheduled_at was a full table scan.
-- D1 meters rows_read as rows *touched*, not rows returned, so those scans were billed in
-- full: the per-division scraper query read ~8,400 rows to return ~24, and 24 hourly runs
-- over ~175 divisions put the account past the 5,000,000 rows_read/day free-tier limit.

-- Scraper's per-division lookup (packages/scraper/db-client.js) and the reap DELETE.
CREATE INDEX IF NOT EXISTS idx_games_level_id     ON games(level_id);

-- `(home_tid = ? OR away_tid = ?)` in the iCal feed and the team page. SQLite's OR
-- optimization needs an index on *each* branch, so both are required to avoid a scan.
CREATE INDEX IF NOT EXISTS idx_games_home_tid     ON games(home_tid);
CREATE INDEX IF NOT EXISTS idx_games_away_tid     ON games(away_tid);

-- queryPendingDivisions' scheduled_at window, and every ORDER BY g.scheduled_at.
CREATE INDEX IF NOT EXISTS idx_games_scheduled_at ON games(scheduled_at);

-- divisions.gid is a FK, not the PK; joined on in queryPendingDivisions and the iCal feed.
CREATE INDEX IF NOT EXISTS idx_divisions_gid      ON divisions(gid);

-- Homepage's ORDER BY t.updated_at DESC.
CREATE INDEX IF NOT EXISTS idx_teams_updated_at   ON teams(updated_at);
