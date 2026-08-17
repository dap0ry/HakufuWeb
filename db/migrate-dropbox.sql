-- Migration: Replace google_connections table with dropbox_connections
-- This migration renames the existing google_connections table to dropbox_connections
-- and removes the unused drive_folder_id column.
--
-- *** ORDERING WARNING ***
-- This migration MUST run BEFORE db/apply-schema.js (or any other schema-creation
-- step) against any database that still has data in google_connections. schema.sql
-- contains `create table if not exists dropbox_connections`; if that runs first, it
-- creates an empty dropbox_connections table, and the ALTER TABLE ... RENAME below
-- then fails with "relation dropbox_connections already exists" — orphaning the real
-- connection row that's still sitting in google_connections.
--
-- Run this against the production Neon database manually:
--   1. Connect to your Neon project's SQL console or use psql
--   2. Paste the SQL below and execute it
--   3. Only then deploy the schema.sql update (db/schema.sql) to document the change.

BEGIN;
ALTER TABLE google_connections RENAME TO dropbox_connections;
ALTER TABLE dropbox_connections DROP COLUMN IF EXISTS drive_folder_id;
COMMIT;
