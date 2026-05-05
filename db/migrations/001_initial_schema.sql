-- Migration 001: Initial Schema
-- TGB Calendar D1 Database

-- 1. leagues
CREATE TABLE IF NOT EXISTS leagues (
  gid          TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  venue_area   TEXT,
  day_of_week  TEXT,
  gender       TEXT,
  league_type  TEXT NOT NULL CHECK(league_type IN ('regular', 'cup', 'special')),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2. divisions
CREATE TABLE IF NOT EXISTS divisions (
  level_id        TEXT PRIMARY KEY,
  gid             TEXT NOT NULL REFERENCES leagues(gid),
  season_label    TEXT,
  division_label  TEXT,
  full_title      TEXT,
  first_game_at   INTEGER,
  last_game_at    INTEGER,
  team_count      INTEGER NOT NULL DEFAULT 0,
  last_scraped_at INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 3. teams
CREATE TABLE IF NOT EXISTS teams (
  tid                  TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  name_normalized      TEXT,
  last_game_at         INTEGER,
  active_division_count INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 4. teams_fts (FTS5 virtual table)
CREATE VIRTUAL TABLE IF NOT EXISTS teams_fts USING fts5(
  name,
  content='teams',
  content_rowid='tid',
  tokenize='unicode61'
);

-- FTS5 triggers to keep teams_fts in sync with teams
CREATE TRIGGER IF NOT EXISTS teams_fts_insert AFTER INSERT ON teams BEGIN
  INSERT INTO teams_fts(rowid, name) VALUES (new.tid, new.name);
END;

CREATE TRIGGER IF NOT EXISTS teams_fts_delete AFTER DELETE ON teams BEGIN
  INSERT INTO teams_fts(teams_fts, rowid, name) VALUES ('delete', old.tid, old.name);
END;

CREATE TRIGGER IF NOT EXISTS teams_fts_update AFTER UPDATE ON teams BEGIN
  INSERT INTO teams_fts(teams_fts, rowid, name) VALUES ('delete', old.tid, old.name);
  INSERT INTO teams_fts(rowid, name) VALUES (new.tid, new.name);
END;

-- 5. team_divisions
CREATE TABLE IF NOT EXISTS team_divisions (
  tid      TEXT NOT NULL REFERENCES teams(tid) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES divisions(level_id) ON DELETE CASCADE,
  wins     INTEGER NOT NULL DEFAULT 0,
  losses   INTEGER NOT NULL DEFAULT 0,
  draws    INTEGER NOT NULL DEFAULT 0,
  rank     INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (tid, level_id)
);

-- 6. games
CREATE TABLE IF NOT EXISTS games (
  game_id           TEXT PRIMARY KEY,
  level_id          TEXT NOT NULL REFERENCES divisions(level_id),
  home_tid          TEXT REFERENCES teams(tid),
  away_tid          TEXT REFERENCES teams(tid),
  scheduled_at      INTEGER NOT NULL,
  scheduled_at_local TEXT NOT NULL,
  venue             TEXT,
  home_score        INTEGER,
  away_score        INTEGER,
  status            TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK(status IN ('scheduled', 'completed', 'postponed', 'cancelled')),
  ical_uid          TEXT NOT NULL UNIQUE,
  ical_sequence     INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 7. team_feed_meta
CREATE TABLE IF NOT EXISTS team_feed_meta (
  tid             TEXT PRIMARY KEY REFERENCES teams(tid) ON DELETE CASCADE,
  last_modified_at INTEGER NOT NULL,
  game_count      INTEGER NOT NULL DEFAULT 0,
  etag            TEXT NOT NULL,
  cached_ical     TEXT,
  generated_at    INTEGER
);

-- 8. scrape_runs
CREATE TABLE IF NOT EXISTS scrape_runs (
  run_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type   TEXT NOT NULL CHECK(target_type IN ('homepage', 'division', 'game')),
  target_key    TEXT,
  started_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at   INTEGER,
  status        TEXT NOT NULL CHECK(status IN ('running', 'success', 'failed', 'partial')),
  error_message TEXT,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_updated  INTEGER NOT NULL DEFAULT 0
);
