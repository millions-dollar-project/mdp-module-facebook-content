-- ─────────────────────────────────────────────────────────────────────────────
-- mdp-module-facebook — dev seed (pages + ai_personas)
--
-- This file is loaded on first dev-machine bootstrap to recreate the local
-- page + persona setup. It is safe to commit: the page access token is
-- stored as the placeholder `__SEED_PAGE_ACCESS_TOKEN__` and substituted at
-- load time from the `FB_PAGE_ACCESS_TOKEN` env var.
--
-- Usage:
--   # 1. Have the env var set in your shell or .env
--   export FB_PAGE_ACCESS_TOKEN="EAA..."
--
--   # 2. Load the seed
--   psql "$DATABASE_URL" -v page_token="$FB_PAGE_ACCESS_TOKEN" -f seed-dev.sql
--
--   # or use the helper script:
--   bash scripts/load-seed-dev.sh
--
-- The file is idempotent: re-running it on an already-seeded DB is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── AI personas (deterministic UUIDs so seed is reproducible) ────────────
INSERT INTO facebook.ai_personas (
    id, name, description, system_prompt, few_shot_examples,
    post_processor_type, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'EcoHome — Trường Mầm Non',
    'Persona chuyên tư vấn thiết kế & thi công trường mầm non EcoHome.',
    'Bạn là nhân viên chat Messenger của EcoHome. Tên bạn là An. Nhiệm vụ: tư vấn thiết kế & thi công trường mầm non. Trả lời ngắn gọn 1-3 câu, xưng "em", gọi khách là "anh/chị". Luôn hỏi lại: vị trí, diện tích, ngân sách dự kiến. Không bịa số điện thoại, không hứa giá. Nếu khách hỏi giá cụ thể → hẹn KTS liên hệ lại.',
    '',
    'ecohome',
    '2026-06-10 13:05:21.709273+00',
    '2026-06-10 13:05:21.709273+00'
)
ON CONFLICT (id) DO NOTHING;

-- ─── Pages (token substituted at load time from :page_token) ─────────────
-- The literal placeholder string `__SEED_PAGE_ACCESS_TOKEN__` is replaced
-- by the loader script. If you load this file by hand, do the substitution
-- before running psql (sed -i "s|__SEED_PAGE_ACCESS_TOKEN__|${FB_PAGE_ACCESS_TOKEN}|" seed-dev.sql)
-- or run with: psql ... -v page_token="$FB_PAGE_ACCESS_TOKEN" -c "SELECT 1" \
--     | sed "s|__SEED_PAGE_ACCESS_TOKEN__|:page_token|"
-- Only the columns we want to pin are listed; everything else falls back to
-- the table's DEFAULT (e.g. ai_role = 'tư vấn viên tuyển sinh').
INSERT INTO facebook.pages (
    id, page_id, page_name, page_access_token,
    is_active, posting_enabled, ai_enabled,
    created_at, updated_at,
    ai_persona_id
) VALUES (
    'f55f109d-eef0-48a6-94af-c624a7aa3338',
    '642546399435985',
    'Thiết Kế Trường Mầm Non Ecohome',
    '__SEED_PAGE_ACCESS_TOKEN__',
    true,
    true,
    true,
    '2026-06-09 16:54:31.58367+00',
    '2026-06-10 13:20:13.839593+00',
    '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

-- If the page already exists (typical re-seed case), backfill the persona
-- link so the page auto-uses the seed persona. Only touches the row when
-- ai_persona_id is currently NULL — preserves any manual override.
UPDATE facebook.pages
SET ai_persona_id = '00000000-0000-0000-0000-000000000001',
    updated_at    = NOW()
WHERE id = 'f55f109d-eef0-48a6-94af-c624a7aa3338'
  AND ai_persona_id IS NULL;

COMMIT;

-- ─── Verify ──────────────────────────────────────────────────────────────
SELECT 'pages' AS tbl, count(*) AS n FROM facebook.pages
UNION ALL
SELECT 'ai_personas', count(*) FROM facebook.ai_personas;
