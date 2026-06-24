# mdp-module-facebook

Facebook module for the Millions Dollar Project shell. Provides a Go/Gin backend stub that mirrors the Facebook Graph API surface, plus a Vite/React plugin (IIFE bundle) that the mdp-shell loads at runtime.

## Layout

```
mdp-module-facebook/
  plugin/        Vite IIFE bundle (React + TS)
  backend/       Go + Gin service
  manifest.json  Shell plugin manifest
```

## Backend

```bash
cd backend
go mod tidy
go run .            # serves on :8080
```

Endpoints:

- `GET  /health`
- `GET  /api/v1/facebook/me`
- `POST /api/v1/facebook/publish`
- `GET  /api/v1/facebook/posts`

## Plugin

```bash
cd plugin
pnpm install
pnpm build          # emits plugin/dist/facebook.iife.js
```

The shell loads `plugin/dist/facebook.iife.js` per `manifest.json`.

## Platform docs

- Facebook Graph API: https://developers.facebook.com/docs/graph-api

## Brain Feed

The **Brain Feed tab** is an AI-curated view of every crawled Facebook
post that has been ingested into `mdp-brain`. It sits as the 4th tab
in the Facebook Content view (after Composer / Kanban / Crawl).

**Flow:** Crawl tab → auto-ingest into Brain → Brain Feed tab →
select posts → Generate drafts → Kanban.

**Backend endpoints:**

- `GET /api/v1/facebook/brain/feed?page=1&page_size=20&status=...&search=...`
  — paginated list of ingested posts.
- `DELETE /api/v1/facebook/brain/feed/:id` — remove a single post from
  the Brain Feed.
- `POST /api/v1/facebook/brain/ingest` — bulk ingest a list of crawled
  posts (auto-called by the backend after every successful crawl).
- `POST /api/v1/facebook/brain/generate` — generate drafts for one or
  more `feedIds[]`.

**Configuration:**

- `MDP_BRAIN_BIN` — path to the `mdp-brain` binary (defaults to
  `mdp-brain` on `$PATH`). The Go backend spawns it as a stdio
  JSON-RPC subprocess.

**Schema:** see
`backend/internal/db/migrations/025_brain_feed.up.sql`
(`facebook.brain_feeds`, `facebook.brain_drafts`).
