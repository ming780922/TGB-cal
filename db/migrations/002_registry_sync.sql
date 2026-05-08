-- db/migrations/002_registry_sync.sql

-- 1. Create game_sync
CREATE TABLE IF NOT EXISTS game_sync (
  game_id        INTEGER PRIMARY KEY REFERENCES games(game_id) ON DELETE CASCADE,
  ical_uid       TEXT NOT NULL UNIQUE,
  ical_sequence  INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2. Create team_sync
CREATE TABLE IF NOT EXISTS team_sync (
  tid               INTEGER PRIMARY KEY REFERENCES teams(tid) ON DELETE CASCADE,
  last_modified_at  INTEGER NOT NULL,
  ical_etag         TEXT,
  ical_cached       TEXT,
  ical_generated_at INTEGER,
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 3. Migrate data from games to game_sync
INSERT INTO game_sync (game_id, ical_uid, ical_sequence, updated_at)
SELECT game_id, ical_uid, ical_sequence, updated_at FROM games;

-- 4. Migrate data from team_feed_meta to team_sync
INSERT INTO team_sync (tid, last_modified_at, ical_etag, ical_cached, ical_generated_at, updated_at)
SELECT tid, last_modified_at, etag, cached_ical, generated_at, unixepoch() FROM team_feed_meta;

-- 5. Drop old table
DROP TABLE team_feed_meta;

-- 6. Recreate games without ical fields (SQLite doesn't support DROP COLUMN easily)
CREATE TABLE games_new (
  game_id           INTEGER PRIMARY KEY,
  level_id          INTEGER NOT NULL REFERENCES divisions(level_id),
  home_tid          INTEGER REFERENCES teams(tid),
  away_tid          INTEGER REFERENCES teams(tid),
  scheduled_at      INTEGER NOT NULL,
  venue             TEXT,
  home_score        INTEGER,
  away_score        INTEGER,
  status            TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK(status IN ('scheduled', 'completed', 'postponed', 'cancelled')),
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO games_new (game_id, level_id, home_tid, away_tid, scheduled_at, venue, home_score, away_score, status, created_at, updated_at)
SELECT game_id, level_id, home_tid, away_tid, scheduled_at, venue, home_score, away_score, status, created_at, updated_at FROM games;

DROP TABLE games;
ALTER TABLE games_new RENAME TO games;
