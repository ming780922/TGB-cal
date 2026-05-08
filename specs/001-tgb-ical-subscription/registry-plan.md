# Registry Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple game domain data from iCal delivery metadata by moving UID/Sequence/Cache fields to dedicated registry tables.

**Architecture:** Implement a "Sidecar Registry" pattern. The core `games` table will be stripped of iCal fields. New `game_sync` and `team_sync` tables will handle protocol-specific mapping and caching.

**Tech Stack:** Cloudflare D1 (SQLite), Cloudflare Workers (TypeScript).

---

### Task 1: Database Migration

**Files:**
- Create: `db/migrations/002_registry_sync.sql`

- [ ] **Step 1: Define the migration script**
Create the script to create new tables, migrate existing data, and clean up the old schema.

```sql
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
```

- [ ] **Step 2: Apply migration locally**
Run: `pnpm db:migrate`
Expected: Success.

- [ ] **Step 3: Verify schema**
Run: `npx wrangler d1 export tgb-calendar --local --output /tmp/schema.sql && grep -E "game_sync|team_sync" /tmp/schema.sql`
Expected: Both tables exist.

- [ ] **Step 4: Commit**
```bash
git add db/migrations/002_registry_sync.sql
git commit -m "db: migrate to registry sync tables"
```

---

### Task 2: Update iCal Generator Interface

**Files:**
- Modify: `apps/worker/src/ical.ts`

- [ ] **Step 1: Update GameRow interface**
The `GameRow` will now receive iCal fields from the joined query.

```typescript
// apps/worker/src/ical.ts

export interface GameRow {
  game_id: number;
  // ... other fields ...
  ical_sequence: number;
  ical_uid: string; // Add this
  updated_at: number;
  // ...
}
```

- [ ] **Step 2: Update generateIcal to use ical_uid from row**
Instead of hardcoding the UID generation, use the one from the database.

```typescript
// apps/worker/src/ical.ts
// ...
  for (const game of games) {
    const uid = game.ical_uid; // Use retrieved UID
    const dtstamp = formatUtc(game.updated_at);
// ...
```

- [ ] **Step 3: Verify build**
Run: `pnpm --filter @tgb-calendar/worker build`
Expected: Success (or errors in ical-route.ts which we will fix next).

- [ ] **Step 4: Commit**
```bash
git add apps/worker/src/ical.ts
git commit -m "feat: update iCal generator to use registry fields"
```

---

### Task 3: Refactor iCal Route (Delivery)

**Files:**
- Modify: `apps/worker/src/ical-route.ts`

- [ ] **Step 1: Update TeamFeedMeta interface and query**
Rename interface and update query to use `team_sync`.

```typescript
// apps/worker/src/ical-route.ts

interface TeamSyncMeta {
  last_modified_at: number;
  ical_etag: string;
  ical_cached: string | null;
}

// ... in handleIcalRequest ...
const meta = await env.DB.prepare(
  'SELECT last_modified_at, ical_etag, ical_cached FROM team_sync WHERE tid = ?',
).bind(tid).first<TeamSyncMeta>();
```

- [ ] **Step 2: Update HTTP headers logic**
Use `ical_etag` and `ical_cached`.

- [ ] **Step 3: Update Game query with JOIN**
Join with `game_sync` to get `ical_uid` and `ical_sequence`.

```sql
SELECT g.*, gs.ical_uid, gs.ical_sequence, ...
FROM games g
JOIN game_sync gs ON g.game_id = gs.game_id
...
```

- [ ] **Step 4: Update Upsert logic for team_sync**
Update the cache saving logic to use `team_sync`.

- [ ] **Step 5: Verify build**
Run: `pnpm --filter @tgb-calendar/worker build`

- [ ] **Step 6: Commit**
```bash
git add apps/worker/src/ical-route.ts
git commit -m "feat: refactor iCal route to use registry tables"
```

---

### Task 4: Refactor Scrape API (Ingestion)

**Files:**
- Modify: `apps/worker/src/scrape-api.ts`

- [ ] **Step 1: Update Game upsert logic**
Remove `ical_uid` and `ical_sequence` from `games` INSERT/UPDATE.
Add logic to upsert into `game_sync`.

```typescript
// apps/worker/src/scrape-api.ts

// 1. Insert/Update games (domain only)
// 2. Upsert game_sync (metadata)
const icalUid = `game-${game.game_id}@tgb.ming060.com`;
await env.DB.prepare(
  `INSERT INTO game_sync (game_id, ical_uid, ical_sequence, updated_at)
   VALUES (?, ?, 0, ?)
   ON CONFLICT(game_id) DO UPDATE SET
     ical_sequence = CASE WHEN ? THEN ical_sequence + 1 ELSE ical_sequence END,
     updated_at = ?`
).bind(game.game_id, icalUid, now, isChanged, now).run();
```

- [ ] **Step 2: Update Team metadata invalidation**
Update to use `team_sync`.

- [ ] **Step 3: Final build check**
Run: `pnpm --filter @tgb-calendar/worker build`

- [ ] **Step 4: Commit**
```bash
git add apps/worker/src/scrape-api.ts
git commit -m "feat: refactor scrape api to manage registry tables"
```

---

### Task 5: End-to-End Verification

- [ ] **Step 1: Run local dev server**
Run: `pnpm dev`

- [ ] **Step 2: Test Ingestion**
Use a tool like `curl` or a test script to hit the local `/api/scrape/upsert` with a sample payload.

- [ ] **Step 3: Test Feed**
Request an iCal feed for a team.
Verify the UID is correct and `DTSTAMP` is a valid UTC string.

- [ ] **Step 4: Verify Purity**
Run: `npx wrangler d1 export tgb-calendar --local --output /tmp/final.sql`
Verify `games` table has no `ical_` columns.
