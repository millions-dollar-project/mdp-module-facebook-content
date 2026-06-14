-- No-op migration. Required because the schema_migrations table
-- already has version=15 marked as applied (carried over from an older
-- branch), but the corresponding .sql file was never committed.
-- Without this pair, `migrate.Up()` fails with:
--   "no migration found for version 15: read down for version 15
--    migrations: file does not exist"
-- which blocks the facebook backend from booting.
-- The DB schema is already at the post-015 state, so both files
-- intentionally do nothing.
SELECT 1;
