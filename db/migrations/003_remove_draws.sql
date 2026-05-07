-- Migration 003: Remove draws column from team_divisions
-- TGB Basketball doesn't have draws.

ALTER TABLE team_divisions DROP COLUMN draws;
