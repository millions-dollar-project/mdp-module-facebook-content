# Changelog

All notable changes to this module are documented here.

## Unreleased

### Added — Brain Feed tab

The **Brain Feed tab** is a new 4th tab in the Facebook Content view
(sits next to Composer / Kanban / Crawl) that surfaces every crawled
post that's been pushed to `mdp-brain` for AI analysis, and lets the
user turn those posts into drafts that land directly in Kanban.

- **Brain Feed tab** (4th tab): paginated AI-curated view of crawled
  posts ingested into `mdp-brain` (status filter + content search).
- **Auto-ingest after crawl**: every successful crawl now pushes the
  crawled posts through `POST /api/v1/facebook/brain/ingest` so the
  Brain Feed is populated without an extra click.
- **"Mở Brain Feed" chip**: appears next to the crawl status after a
  successful crawl — clicking it switches the view to the Brain Feed
  tab.
- **Generate drafts from feed**: select 1+ posts and click
  "Generate drafts" — one selected post produces one draft. Parallel
  cap of 5 concurrent brain MCP calls (bounded goroutine pool).
- **Bulk delete**: remove selected posts from the Brain Feed (single
  row or batch).
- **Pagination + filter**: server-driven paging (20/page), status
  filter, free-text search over post content.
- Backend endpoints:
  - `GET  /api/v1/facebook/brain/feed?page=1&page_size=20&status=...&search=...`
  - `DELETE /api/v1/facebook/brain/feed/:id`
  - `POST /api/v1/facebook/brain/ingest`
  - `POST /api/v1/facebook/brain/generate`
- DB schema: `facebook.brain_feeds`, `facebook.brain_drafts`
  (migration `025_brain_feed.up.sql`).
- MCP client: stdio JSON-RPC client to `mdp-brain`
  (`backend/internal/mcp/brain_client.go`).

### Changed

- Crawl tab: `handleRunCrawl` now auto-triggers `/brain/ingest` after a
  successful crawl (fire-and-forget; ingest failures are logged but do
  not surface to the crawl UI).
- Kanban tab: rewired to the real `useRepostQueue` hook — the
  `SEED_CARDS` fallback that shipped during the SCA port is gone.
- FacebookView: now renders 4 tabs (Composer / Kanban / Crawl /
  Brain Feed) instead of 3.

### Tech notes

- Bounded goroutine pool (`chan struct{}` semaphore cap 5) for both
  ingest and generate — prevents the brain MCP stdio from being
  overwhelmed when the user bulk-selects 50+ posts.
- Plugin uses `AbortController` to cancel stale requests when the user
  changes the filter faster than the network can resolve.
- Adapter pattern: `*Row` methods on `BrainFeedRepo` / `BrainDraftRepo`
  bridge the sqlc-generated `pgtype.*` types to the domain models so
  the service layer never imports `pgtype` directly.

### Added — Brain Dashboard

The Brain Feed tab now exposes a **dashboard** at the top so the user
can see what `mdp-brain` actually knows, drill into a feed row, and
record review decisions without leaving the tab.

- **Overview panel** (`BrainOverviewPanel`): four stat cards
  (memories / rules / profiles / graph entities), two distribution
  cards (feeds-by-status, drafts-by-status), 7-day activity line
  (ingests / generates / publishes / feedback), and any warnings
  the brain surfaces.
- **Persona panel** (`BrainPersonaPanel`): list of AI profiles known
  to the brain. Falls back to the entity graph when `list_profiles`
  isn't yet exposed.
- **Learning panel** (`BrainLearningPanel`): proposed learning
  signals with an Áp dụng button that calls
  `applyBrainLearning`. Today the brain's `apply` is a stub — the
  panel surfaces the server's note when that happens.
- **Graph stats** (`BrainGraphStats`): entity count by type plus
  top-5 entities (external_ref + type).
- **Brain Peek drawer** (`BrainPeekDrawer`): click the "Brain"
  button on any row to slide out a Modal that shows provenance
  (profile + rule refs + validation), drafts, and a feedback
  recorder (Duyệt / Từ chối / Sửa & duyệt).

**Backend (Go)**

- `BrainStatsService` aggregates feed counts, draft counts, brain
  totals, graph stats, and 7-day activity in one call. Falls back
  to zero-filled responses when the MCP stdio errors so the UI
  always has a shape to render.
- Five new HTTP handlers, each taking a small interface so the
  handlers are unit-testable without a live `mdp-brain`:
  - `GET  /api/v1/facebook/brain/overview`
  - `GET  /api/v1/facebook/brain/provenance/:id`
  - `GET  /api/v1/facebook/brain/personas`
  - `GET  /api/v1/facebook/brain/learning`
  - `POST /api/v1/facebook/brain/learning/:id/apply` (stub)
  - `POST /api/v1/facebook/brain/feedback`
  - `GET  /api/v1/facebook/brain/graph/stats`
- Handler error envelope: 502 on MCP error, 503 when the brain is
  nil, 400 on missing required fields.
- Four new methods on the brain MCP client
  (`backend/internal/mcp/brain_client.go`):
  `GetProvenance`, `GetLearningState`, `QueryGraph`, `RecordFeedback`.

**Plugin (React + TypeScript)**

- Six new hooks in `plugin/src/hooks/` with polling + abort:
  `useBrainOverview`, `useBrainProvenance`, `useBrainPersonas`,
  `useBrainLearning`, `useBrainGraph`, `useBrainFeedback` (mutation).
- `lib/api/brain.ts` extended with seven dashboard methods + six
  new types in `lib/types/brain.ts`.
- Dashboard panels live at the top of `BrainFeedTab` and refresh
  whenever the user applies a learning signal or records feedback.

**Tests**

- 13 Go tests in `backend/internal/api/handlers/brain_dashboard_test.go`
  covering each handler's happy path + error envelope.
- 17 vitest tests in `plugin/src/lib/api/brain.test.ts`
  (10 prior + 7 dashboard).
- 3 vitest tests in `plugin/src/hooks/__tests__/useBrainOverview.test.ts`.

### Fixed — `mdp run module` was launching the unwired backend

`mdp run module --name facebook` (and `mdp run dev`) invoked
`go run .` from the module root, which compiled a stale
`backend/main.go` wrapper that didn't pass `SidecarURL` (or the
OpenAI key, or the comment worker) into `RouterDeps`. The result:
`/api/v1/facebook/fb-groups/from-url` and the other sidecar-backed
endpoints returned 503 "sidecar not configured" even when the
sidecar was running. The `cmd/server/main.go` entry point was
correct all along — the runner now targets it explicitly.

- `mdp-cli/cmd/run_module.go`: `go run .` → `go run ./cmd/server`.
- `mdp-cli/cmd/run_dev.go`: same change, for `mdp run dev`.
- `backend/main.go`: also patched to forward `cfg.SidecarURL` so
  `go run .` from the module root is self-consistent with
  `cmd/server/main.go`.

### Fixed — `CreateGroupFromURL` now sets `status: "active"`

`fb_groups.status` has a CHECK constraint
(`active|inactive|removed`) and no DB-side default is supplied when
the Go insert passes a non-empty string for it. The original
`CreateGroup` handler reads `status` from the request body, but
the new `CreateGroupFromURL` builds the row server-side — so it
now sets `Status: "active"` explicitly on the `models.FBGroup`
it passes to the repo.

### Changed — Add-group is now paste-a-link (URL → ID + name)

The user requested the SCA flow for adding groups: paste a Facebook
group URL and the system auto-extracts the numeric ID and display name
— no more hand-typed `groupId` + `name` fields.

**Plugin (React + TypeScript)**

- `RepostTab`: the add-group modal's three fields (Group ID, Tên nhóm,
  Tài khoản phụ trách) are reduced to two (Link nhóm, Tài khoản phụ
  trách). The submit button calls `createGroupFromUrl` instead of
  `createGroup`. After a successful add the page-status line shows
  `"Đã thêm nhóm "<name>" (ID: <id>)"` (or an "ID only, name n/a"
  variant for private groups where the page is gated).

**Backend (Go)**

- New `POST /api/v1/facebook/fb-groups/from-url` handler
  (`CreateGroupFromURL`): calls the sidecar to resolve the URL, then
  inserts the row with the extracted ID + best-effort name. The
  handler returns 400 with a Vietnamese hint when the URL is
  unparseable, 502 when the sidecar is reachable but the resolve
  failed for some other reason, and 503 when the sidecar isn't
  configured.
- New `SidecarClient.ResolveGroup(ctx, url)` method.

**Sidecar (Node.js + Playwright)**

- New `sidecar/src/group-resolver.js`:
  - `parseGroupUrl(input)` — pure regex; accepts any
    `facebook.com/groups/<numeric-id>` shape (www / m / bare host,
    with/without trailing slash, with/without `/permalink/...`
    subpath). Rejects slugged URLs and IDs shorter than 5 digits.
  - `fetchGroupNameFromPage(url)` — opens a fresh ephemeral headless
    Chromium context, navigates to the public group page, and reads
    `og:title` / `<h1>` / `<title>` (with " | Facebook" / "| Meta"
    suffixes stripped). Returns `null` for gated/private groups.
  - `resolveGroupMeta(input)` — orchestrates the two; returns
    `{ok, groupId, canonicalUrl, name}` or `{ok:false, error}`.
- New `POST /group-resolve` route in `sidecar/src/index.js`.

**Tests**

- 12 vitest cases for `parseGroupUrl` (happy paths, shape variants,
  slug rejection, short-ID rejection, non-FB rejection, empty/null
  input) and `resolveGroupMeta` (error envelope, ID-survives-when-
  name-fetch-fails).
- 3 Go tests in `backend/internal/service/sidecar_test.go`:
  `ResolveGroup_Success`, `ResolveGroup_PrivateGroup_NameNull`,
  `ResolveGroup_BadURL`.

### Changed — Add-account is now click-to-login (no form)

Final decision after the user cycled through 4 UX variants: clicking
**+ Thêm tài khoản** should just open Playwright at facebook.com/login
and let the user log in themselves — no form, no input. The account
row is created with an auto-generated display name
(`Tài khoản 1`, `Tài khoản 2`, …) and a unique profile path
(`~/.mdp/facebook/profiles/account-<timestamp>`). Rename is a
follow-up (not in this release).

**Plugin (React + TypeScript)**

- `RepostTab`: the entire add-account `Modal` (form, 3 fields, helper
  text, login-status panel) is removed. The "+ Thêm tài khoản" button
  now calls `handleAddAccount` directly:
  1. Generate `name = "Tài khoản <n>"` and `profilePath`.
  2. `createAccount` (returns sessionId).
  3. Poll the sidecar for up to 10 minutes.
  4. Update the page-status text on success / failure.
- The button is disabled while a login is in flight to prevent
  double-clicks spawning two browsers.
- All other modal flows (campaign, group, jobs, plan, kling) are
  unchanged.

**Backend / Sidecar (unchanged from previous releases)**

- `POST /fb-accounts` still accepts an optional `password` field for
  forward-compat. The current UI doesn't send one.
- 4 sidecar-client unit tests cover both the no-password and
  password-forwarded contracts.
- `expandHome` helper resolves `~/` in `profilePath` against
  `os.homedir()` so the auto-generated default works on Linux and
  Windows.

### Added — Repost V2 (SCA port)

### Added — Repost V2 (SCA port)

Port of the crawl → plan → group-post flow from `social-content-automation`,
adapted to the mdp-shell + Tauri architecture.

**Backend (Go)**

- Migration 017: drop `crawled_posts.page_id` FK (freeform text now),
  add `account_login_sessions` table for manual Playwright login tracking,
  add `repost_jobs.updated_at` for queue-view freshness.
- Migration 016: re-numbered from a duplicate-version 015 (the older
  `015_pages_ai_persona_id.up.sql` collided with a `015_noop_marker`
  placeholder, breaking golang-migrate on boot).
- New `Crawler` service + pure `FilterAndLimitCrawledPosts` helper with
  4 unit tests (sort-desc, limit, untilDate, empty).
- `RepostCampaignService.PlanRepost` / `RescheduleJob` / `SetJobFlagsForJob`
  / `ListQueue` / `CrawlPageV2` with `ErrPastSchedule` guard (30s grace).
- New sqlc queries: `ListAllJobs` (NULL-tolerant filters), `UpdateJob`
  (schedule + flags + bumps `updated_at`).
- New HTTP routes:
  - `POST /api/v1/facebook/crawl-page-v2` (untilDate aware)
  - `POST /api/v1/facebook/plan-repost` (multi-slot schedule)
  - `GET  /api/v1/facebook/repost-queue` (queue view)
  - `POST /api/v1/facebook/repost-jobs/:id/reschedule`
  - `POST /api/v1/facebook/repost-jobs/:id/flags`

**Sidecar (Node.js + Playwright)**

- `scrapePage` accepts `untilDate`; new `sort-filter.js` helper
  (4 vitest cases for sort/limit/untilDate/empty).
- `account-login.js`: visible Chromium with persistent profile, polls
  the in-memory session map. Endpoints
  `/account-login/start|status|cancel`.
- Publisher: if `anonymousPosting` is true, find and click the
  "Đăng ẩn danh" / "Post anonymously" switch BEFORE clicking Post
  (covers aria-labels in EN/VI, data-testid hooks, role=switch,
  and falls back to a "More options" menu).

**Plugin (React + TypeScript)**

- `lib/time.ts` GMT+7 helpers + 11 vitest cases
  (round-trip, past-time guard edge cases, offset constant).
- Hooks: `useRepostQueue` (reschedule + setFlags with past-time
  pre-check), `useAccountLogin` (start/cancel/reset with 2s polling).
- New sub-modes in `RepostTab`: Phân công, Đăng nhập, Crawl, Lên lịch,
  Lịch chờ.
- `RepostCrawlSection`, `RepostPlanModal`, `RepostQueueView`,
  `AccountLoginDialog`, `GroupAssignmentTable` are new components.

**Tests**

- 4 Go tests: `FilterAndLimitCrawledPosts` (sort/limit/untilDate/empty).
- 4 Go tests: `EnsureFuture` (past/now/grace/future) + PlanRepost
  validation (past item, empty, missing IDs).
- 4 vitest tests: sidecar `filterAndLimitPosts`.
- 11 vitest tests: plugin `lib/time.ts`.

## 0.1.0 - 2026-06-06

### Added

- Initial scaffold: Go/Gin backend stub and Vite/React plugin.
- Manifest at module root for shell discovery.
- Stub endpoints: `/health`, `/api/v1/facebook/me`, `/api/v1/facebook/publish`, `/api/v1/facebook/posts`.
