-- 009_webhook.up.sql
-- Idempotency and replay buffer for Facebook webhook events.
-- Prevents duplicate processing when Facebook retries deliveries.

CREATE TABLE facebook.webhook_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL        -- 'messaging' | 'feed' | 'unknown'
                    CHECK (event_type IN ('messaging', 'feed', 'unknown')),
  facebook_entry_id text,             -- page ID from entry.id
  payload         jsonb NOT NULL,
  signature       text,                 -- X-Hub-Signature-256 header
  processed       boolean NOT NULL DEFAULT false,
  processed_at    timestamptz,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX webhook_events_unprocessed_idx
  ON facebook.webhook_events (created_at)
  WHERE processed = false;

CREATE INDEX webhook_events_entry_type_idx
  ON facebook.webhook_events (facebook_entry_id, event_type, created_at DESC);
