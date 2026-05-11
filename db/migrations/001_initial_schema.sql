-- Migration 001: Initial Schema
-- TGB Calendar D1 Database (Consolidated)

-- 1. leagues
CREATE TABLE IF NOT EXISTS leagues (
  gid          INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2. divisions
CREATE TABLE IF NOT EXISTS divisions (
  level_id        INTEGER PRIMARY KEY,
  gid             INTEGER NOT NULL REFERENCES leagues(gid),
  name            TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 3. teams
CREATE TABLE IF NOT EXISTS teams (
  tid                   INTEGER PRIMARY KEY,
  name                  TEXT NOT NULL,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
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
  tid      INTEGER NOT NULL REFERENCES teams(tid) ON DELETE CASCADE,
  level_id INTEGER NOT NULL REFERENCES divisions(level_id) ON DELETE CASCADE,
  gid      INTEGER NOT NULL REFERENCES leagues(gid),
  wins     INTEGER NOT NULL DEFAULT 0,
  losses   INTEGER NOT NULL DEFAULT 0,
  rank     INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (tid, level_id, gid)
);

-- 6. games (Domain facts only)
CREATE TABLE IF NOT EXISTS games (
  game_id           INTEGER PRIMARY KEY,
  level_id          INTEGER NOT NULL REFERENCES divisions(level_id),
  home_tid          INTEGER REFERENCES teams(tid),
  away_tid          INTEGER REFERENCES teams(tid),
  scheduled_at      INTEGER NOT NULL,
  venue             TEXT,
  home_score        INTEGER,
  away_score        INTEGER,
  status            TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK(status IN ('scheduled', 'completed')),
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 7. game_sync (iCal metadata)
CREATE TABLE IF NOT EXISTS game_sync (
  game_id        INTEGER PRIMARY KEY REFERENCES games(game_id) ON DELETE CASCADE,
  ical_uid       TEXT NOT NULL UNIQUE,
  ical_sequence  INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 8. team_sync (Delivery/Cache metadata)
CREATE TABLE IF NOT EXISTS team_sync (
  tid               INTEGER PRIMARY KEY REFERENCES teams(tid) ON DELETE CASCADE,
  last_modified_at  INTEGER NOT NULL,
  ical_etag         TEXT,
  ical_cached       TEXT,
  ical_generated_at INTEGER,
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 9. push_subscriptions (Web Push)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT    NOT NULL,
  tid         INTEGER NOT NULL REFERENCES teams(tid) ON DELETE CASCADE,
  endpoint    TEXT    NOT NULL,
  p256dh      TEXT    NOT NULL,
  auth        TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (id),
  UNIQUE (endpoint, tid)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tid ON push_subscriptions(tid);
