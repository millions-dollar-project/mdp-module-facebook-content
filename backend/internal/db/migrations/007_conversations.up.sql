-- 007_conversations.up.sql
-- Messenger conversations and messages. Mirrors the SCA facebook_graph.db
-- schema but uses PostgreSQL native types.

CREATE TABLE facebook.conversations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id            uuid NOT NULL REFERENCES facebook.pages(id) ON DELETE CASCADE,
  customer_id        text NOT NULL,          -- Facebook PSID
  customer_name      text NOT NULL DEFAULT 'Khách ẩn danh',
  last_message_preview text,
  last_message_time  timestamptz,
  unread_count       integer NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'closed', 'archived')),
  ai_enabled         boolean NOT NULL DEFAULT true,
  contacted          boolean NOT NULL DEFAULT false,
  priority_score     integer NOT NULL DEFAULT 50,
  conversation_summary text,
  collected_info     jsonb NOT NULL DEFAULT '{}'::jsonb,
  reset_at           timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX conversations_page_customer_idx
  ON facebook.conversations (page_id, customer_id);

CREATE INDEX conversations_page_updated_idx
  ON facebook.conversations (page_id, updated_at DESC)
  WHERE status = 'open';

CREATE TABLE facebook.messages (
  id                 text PRIMARY KEY,         -- Facebook message ID or generated
  conversation_id    uuid NOT NULL REFERENCES facebook.conversations(id) ON DELETE CASCADE,
  sender_id          text NOT NULL,
  sender_type        text NOT NULL DEFAULT 'customer'
                         CHECK (sender_type IN ('page', 'customer', 'system')),
  content            text NOT NULL,
  message_type       text NOT NULL DEFAULT 'text'
                         CHECK (message_type IN ('text', 'image', 'video', 'file', 'comment')),
  is_from_page       boolean NOT NULL DEFAULT false,
  is_ai_generated    boolean NOT NULL DEFAULT false,
  is_read            boolean NOT NULL DEFAULT false,
  sent_at            timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_sent_idx
  ON facebook.messages (conversation_id, sent_at DESC);

CREATE INDEX messages_sender_idx
  ON facebook.messages (sender_id, sent_at DESC);

-- Track AI-replied messages to prevent duplicate replies on webhook retries.
CREATE TABLE facebook.ai_replied (
  inbound_message_id text PRIMARY KEY,
  outbound_message_id text,
  conversation_id    uuid NOT NULL REFERENCES facebook.conversations(id) ON DELETE CASCADE,
  replied_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_replied_conversation_idx
  ON facebook.ai_replied (conversation_id, replied_at DESC);
