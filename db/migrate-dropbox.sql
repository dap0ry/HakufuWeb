-- Migration: Replace google_connections table with dropbox_connections
-- This migration renames the existing google_connections table to dropbox_connections
-- and removes the unused drive_folder_id column.
--
-- Run this against the production Neon database manually:
--   1. Connect to your Neon project's SQL console or use psql
--   2. Paste the SQL below and execute it
--
-- After running this, deploy the schema.sql update (db/schema.sql) to document the change.

ALTER TABLE google_connections RENAME TO dropbox_connections;
ALTER TABLE dropbox_connections DROP COLUMN IF EXISTS drive_folder_id;
