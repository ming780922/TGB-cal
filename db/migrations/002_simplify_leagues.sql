-- Migration 002: Simplify leagues table
-- Remove columns that are never populated or queried

ALTER TABLE leagues DROP COLUMN venue_area;
ALTER TABLE leagues DROP COLUMN day_of_week;
ALTER TABLE leagues DROP COLUMN gender;
ALTER TABLE leagues DROP COLUMN league_type;
