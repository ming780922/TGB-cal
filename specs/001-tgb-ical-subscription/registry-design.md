# Design Doc: Decoupling Game Domain from Delivery Metadata

**Date:** 2026-05-08  
**Topic:** Database Purity and Generic Protocol Registry

## 1. Problem Statement
The current database schema mingles core game facts (time, score, venue) with protocol-specific delivery metadata (iCal UID, iCal Sequence). This "impure" design:
- Hardcodes the system to iCal, making it difficult to support other delivery protocols (e.g., Google Calendar API, Push Notifications, Discord Hooks).
- Makes the core `games` table "noisy" with fields irrelevant to the basketball domain.
- Requires modifying domain logic to handle delivery-specific versioning logic.

## 2. Proposed Architecture (Option A: Mono-Registry)

We will implement a "Sidecar Registry" pattern. The core tables (`games`, `teams`) will contain only domain facts. All metadata required for syncing or delivering that data to external systems will reside in specialized "Sync" tables.

### 2.1 Database Schema Changes

#### `game_sync` (New Table)
Stores the mapping between a game and external protocol identifiers.
- `game_id`: Primary Key, Foreign Key to `games.game_id`.
- `ical_uid`: Stable UID for iCal.
- `ical_sequence`: Version counter for iCal.
- `updated_at`: Timestamp of the last metadata change.

#### `team_sync` (Replacing `team_feed_meta`)
Renamed and generalized to handle caching for multiple potential formats.
- `tid`: Primary Key, Foreign Key to `teams.tid`.
- `last_modified_at`: Domain-level last modified time.
- `ical_etag`: iCal-specific ETag.
- `ical_cached`: Cached iCal string.
- `ical_generated_at`: Timestamp of cache generation.

### 2.2 Data Flow Refactoring

#### Ingestion (Scrape API)
1. Update `leagues`, `divisions`, `teams`, `team_divisions`.
2. Update `games` (domain fields only).
3. Update `game_sync`:
    - If new game: Create row with `ical_uid` and `sequence = 0`.
    - If existing game changed: Increment `ical_sequence`.
4. Update `team_sync`:
    - Mark `last_modified_at` and invalidate `ical_cached`/`ical_etag` for affected teams.

#### Delivery (iCal Feed)
1. Join `games` with `game_sync` to retrieve both domain facts and iCal metadata.
2. Join `teams` with `team_sync` to handle caching logic.

## 3. Implementation Steps

1. **Migration:**
    - Create `game_sync`.
    - Create `team_sync`.
    - Migrate data from `games` and `team_feed_meta` to the new tables.
    - Remove `ical_uid`, `ical_sequence` from `games`.
    - Drop `team_feed_meta`.
2. **Worker Update:**
    - Update `GameRow` interface and database queries in `ical.ts` and `ical-route.ts`.
    - Update `handleScrapeUpsert` logic in `scrape-api.ts` to manage the registry.
3. **Verification:**
    - Verify scraper ingestion still works.
    - Verify iCal feeds still return stable UIDs and incremented sequences.
