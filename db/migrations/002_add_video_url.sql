-- Migration 002: Add video_url to games
ALTER TABLE games ADD COLUMN video_url TEXT;
