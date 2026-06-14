# seed-dev

Local dev seed for the Facebook module: a single page (Thiết Kế Trường Mầm Non
Ecohome) + a single AI persona (EcoHome). Use this to bootstrap a teammate's
DB so they don't lose the test setup when they `git pull`.

## Quick start

```bash
# 1. Make sure your .env has the page token (only the seed loader needs it;
#    the token never lands in the repo)
export FB_PAGE_ACCESS_TOKEN="EAA..."

# 2. Load the seed (idempotent)
bash backend/seed/scripts/load-seed-dev.sh
```

On Windows:

```powershell
$env:FB_PAGE_ACCESS_TOKEN = "EAA..."
powershell -ExecutionPolicy Bypass -File backend\seed\scripts\load-seed-dev.ps1
```

Or via Makefile (from `backend/`):

```bash
make seed-dev
```

## What gets loaded

- `facebook.ai_personas` — 1 row: `EcoHome — Trường Mầm Non` (deterministic
  UUID `00000000-0000-0000-0000-000000000001`)
- `facebook.pages` — 1 row: `Thiết Kế Trường Mầm Non Ecohome`
  (page_id `642546399435985`, local UUID `f55f109d-eef0-48a6-94af-c624a7aa3338`)

Conversations, messages, and comments are NOT seeded — those are local
test data each dev accumulates themselves.

## Token safety

The page access token is a Meta secret. The seed file ships with the
placeholder `__SEED_PAGE_ACCESS_TOKEN__` so the token is never committed.
The loader substitutes it from `$FB_PAGE_ACCESS_TOKEN` at runtime.

If you accidentally commit a real `EAA...` string, the pre-commit
`secret-scan.sh` hook will block the commit.

## Updating the seed

When you change the schema of `pages` or `ai_personas`, regenerate the seed
on a DB that has the canonical data:

```bash
# 1. From inside backend/
docker exec mdp-facebook-pg pg_dump -U facebook -d facebook \
    --data-only --inserts \
    --table=facebook.pages \
    --table=facebook.ai_personas > seed/seed-dev.sql

# 2. Manually:
#    - replace the EAA... token with __SEED_PAGE_ACCESS_TOKEN__
#    - wrap each INSERT in ON CONFLICT (id) DO NOTHING
#    - add a banner matching the existing file
```

Or just edit the seed file by hand if you know the row shape.
