-- 001_init.up.sql
-- Create the facebook schema and the pgcrypto extension (for gen_random_uuid).
-- Run once, idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS facebook;
