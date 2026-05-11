-- db/migrations/002_push_subscriptions.sql
CREATE TABLE push_subscriptions (
  id          TEXT    NOT NULL,
  tid         INTEGER NOT NULL REFERENCES teams(tid) ON DELETE CASCADE,
  endpoint    TEXT    NOT NULL,
  p256dh      TEXT    NOT NULL,
  auth        TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (id),
  UNIQUE (endpoint, tid)
);

CREATE INDEX idx_push_subscriptions_tid ON push_subscriptions(tid);
