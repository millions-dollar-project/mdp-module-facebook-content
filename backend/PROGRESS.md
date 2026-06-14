# Backend progress — mdp-module-facebook

Last updated: 2026-06-12
Commit: `69b39c7` — feat: migrate social-content-automation features into module facebook

## 2026-06-12 — Repost/Inbox UI cleanup

### Status: ✅ COMPLETE (plugin build pass)

### Changes
- Inbox customer list:
  - widened the page selector/dropdown area
  - fixed the "AI trang" row layout so the status dot sits next to the label instead of stretching to the far edge
  - removed duplicate green indicators and made the dot reflect `currentPage.aiEnabled` (green when ON, gray when OFF)
- Repost tab:
  - removed visible `Chiến dịch` and `Kling AI` sub-tabs from the Repost header
  - kept the internal campaign plumbing used by the Crawl → schedule workflow
  - updated `Đăng nhóm` so there is no `Tất cả` account filter; selecting an account shows only that account's pending queue
  - auto-selects the relevant account after creating a schedule from Crawl

### Verification
- `npm.cmd run build` in `mdp-module-facebook/plugin` — PASS
- copied `plugin/dist/facebook.iife.js` and `plugin/dist/style.css` to `mdp-shell/plugins/facebook/` for shell reload

## Phase 1 — Messenger AI + Comment Auto-Reply

### Status: ✅ COMPLETE (backend build + test pass, plugin build pass)

### Endpoints (29 total, 14 new)

| Method | Path | Service |
|---|---|---|
| GET  | `/health` | health |
| GET  | `/me` | meta |
| GET  | `/webhook` | Webhook.VerifyGET |
| POST | `/webhook` | Webhook.ReceivePOST |
| GET  | `/api/v1/facebook/pages` | Pages.List |
| POST | `/api/v1/facebook/add-page` | Pages.Add |
| POST | `/api/v1/facebook/update-page` | Pages.Update |
| POST | `/api/v1/facebook/delete-page` | Pages.Delete |
| POST | `/api/v1/facebook/test-page-connection` | Pages.TestConnection |
| POST | `/api/v1/facebook/toggle-page-posting` | Pages.TogglePosting |
| POST | `/api/v1/facebook/update-page-persona` | Pages.UpdatePersona |
| GET  | `/api/v1/facebook/config` | Config.Get |
| POST | `/api/v1/facebook/config` | Config.Save |
| GET  | `/api/v1/facebook/content-queue` | Queue.List |
| POST | `/api/v1/facebook/update-queue-status` | Queue.UpdateStatus |
| POST | `/api/v1/facebook/publish-now` | Queue.PublishNow |
| POST | `/api/v1/facebook/regenerate-content` | Queue.RegenerateContent (echo stub) |
| POST | `/api/v1/facebook/delete-from-queue` | Queue.Delete |
| GET  | `/api/v1/facebook/scheduled-posts` | Scheduler.List |
| POST | `/api/v1/facebook/schedule-post` | Scheduler.Schedule |
| POST | `/api/v1/facebook/publish-scheduled-now` | Scheduler.PublishNow |
| POST | `/api/v1/facebook/cancel-schedule` | Scheduler.Cancel |
| POST | `/api/v1/facebook/publish` | Publisher (legacy) |
| GET  | `/api/v1/facebook/conversations` | Inbox.ListConversations |
| GET  | `/api/v1/facebook/conversations/:id/messages` | Inbox.GetMessages |
| POST | `/api/v1/facebook/conversations/:id/send` | Inbox.SendMessage |
| POST | `/api/v1/facebook/conversations/:id/toggle-ai` | Inbox.ToggleAI |
| POST | `/api/v1/facebook/conversations/:id/mark-read` | Inbox.MarkRead |
| GET  | `/api/v1/facebook/comments` | Comments.ListComments |
| POST | `/api/v1/facebook/comments/process` | Comments.ProcessComments |
| POST | `/api/v1/facebook/comments/:id/like` | Comments.LikeComment |
| POST | `/api/v1/facebook/comments/:id/reply` | Comments.ReplyComment |
| POST | `/api/v1/facebook/comments/:id/private-reply` | Comments.PrivateReply |

### DB schema (9 tables in `facebook` schema)
- `facebook.pages` — page registry, `page_id` UNIQUE, **8 AI persona columns** (`ai_role`, `ai_industry`, `ai_tone`, `ai_price_list`, `ai_location_info`, `ai_contact_channel`, `ai_extra_rules`, `ai_system_prompt`)
- `facebook.config` — singleton (id=1)
- `facebook.content_queue` — drafts in review pipeline
- `facebook.scheduled_posts` — scheduled + history
- `facebook.post_history` — published posts
- `facebook.conversations` — Messenger threads (UUID id, FK pages.id)
- `facebook.messages` — conversation turns (text ID, FK conversations.id)
- `facebook.ai_replied` — idempotency for AI replies (text inbound id, FK conversations.id)
- `facebook.comments` — post comments (text id, FK pages.id)
- `facebook.comment_replies` — public/private replies (UUID id, FK comments.id)
- `facebook.webhook_events` — raw webhook buffer with HMAC verify

### New backend files

```
backend/
  internal/
    ai/openai.go              # thin ChatGPT client (retry, temperature, max_tokens)
    models/conversation.go    # Conversation + Message + CollectedInfo + AIReplied
    models/page.go            # Page + AIPersona structs
    models/comment.go         # Comment + CommentReply + CommentAnalysis + WebhookEvent
    repo/conversations.go     # sqlc-backed repo (UUID↔string mapping)
    repo/messages.go          # lightweight message repo
    repo/comments.go          # comment repo + atomic claim
    repo/webhook.go           # webhook event repo
    service/inbox.go          # conversation sync, message send, webhook handler
    service/ai_responder.go   # per-page persona lookup, prompt builder, slot extraction
    service/comment_monitor.go # auto-like, auto-reply, PM, sentiment/intent classify
    service/webhook.go        # HMAC-SHA256 verify, payload parse, dispatch
    api/handlers/inbox.go     # Inbox HTTP adapter
    api/handlers/comments.go  # Comments HTTP adapter (reply + private-reply wired)
    api/handlers/webhook.go   # Webhook HTTP adapter
    api/handlers/pages.go     # added UpdatePersona endpoint
  internal/db/migrations/
    007_conversations.up.sql
    008_comments.up.sql
    009_webhook.up.sql
    011_page_persona.up.sql   # 8 AI persona columns on facebook.pages
  internal/db/queries/
    conversations.sql
    messages.sql
    comments.sql
    webhook.sql
    pages.sql                 # added UpdatePagePersona query
```

### Plugin updates
- `useConversations(pageId)`, `useMessages(convId)`, `useComments(pageId)` — hooks updated for real backend
- `InboxTab.tsx` — wired to real endpoints, toggle AI per conversation
- `CommentsTab.tsx` — wired to real endpoints, inline reply/PM, run monitor
- `PagesTab.tsx` — modal **Cấu hình AI 🤖** per page: role, industry, tone, price list, location, contact, extra rules, system prompt override
- `lib/api.ts` — `fbFetch` now unwraps `{ data: T }` envelope automatically

### Verification (2026-06-09)
- `go build ./...` — PASS
- `go test ./...` — **all PASS**
- `npx tsc --noEmit` (plugin) — PASS
- `npx vite build` (plugin) — PASS (233 kB IIFE)
- Graph client extended: GetConversations, GetMessages, SendTextMessage, GetComments, ReplyToComment, LikeComment, SendPrivateReply, GetUserProfile, GetPosts

### Configuration for Phase 1
Add to `.env`:
```
OPENAI_API_KEY=sk-...
FACEBOOK_APP_SECRET=...
```

## Phase 2 — Crawl → Spin → Schedule → Group Repost

### Status: ✅ BACKEND + PLUGIN WIRED (build pass, awaiting sidecar runtime test)

### New endpoints (10)

| Method | Path | Handler |
|---|---|---|
| GET  | `/api/v1/facebook/repost-campaigns` | Repost.ListCampaigns |
| POST | `/api/v1/facebook/repost-campaigns` | Repost.CreateCampaign |
| POST | `/api/v1/facebook/repost-campaigns/:id/run` | Repost.RunCampaign |
| GET  | `/api/v1/facebook/repost-campaigns/:id/jobs` | Repost.GetCampaignJobs |
| POST | `/api/v1/facebook/crawl` | Repost.CrawlPage |
| GET  | `/api/v1/facebook/crawled-posts` | Repost.ListCrawledPosts |
| GET  | `/api/v1/facebook/fb-accounts` | Repost.ListAccounts |
| POST | `/api/v1/facebook/fb-accounts` | Repost.CreateAccount |
| GET  | `/api/v1/facebook/fb-groups` | Repost.ListGroups |
| POST | `/api/v1/facebook/fb-groups` | Repost.CreateGroup |

### DB schema (5 new tables)
- `facebook.crawled_posts` — scraped posts from source pages
- `facebook.fb_accounts` — Playwright profiles (cookies, status)
- `facebook.fb_groups` — target groups with assigned account FK
- `facebook.repost_campaigns` — crawl→spin→schedule campaign
- `facebook.repost_jobs` — one row per account→group posting task

### New backend files
```
sidecar/
  package.json              # Express + Playwright micro-service
  src/index.js              # routes: /crawl, /group-check, /group-post, /kling/generate
  src/scraper.js            # feed scraper with Vietnamese date parsing
  src/publisher.js          # group posting + access check via Playwright
  src/kling.js              # Kling AI image/video generation automation
backend/
  internal/db/migrations/010_repost.up.sql
  internal/db/queries/repost.sql
  internal/models/repost.go
  internal/repo/repost.go
  internal/service/sidecar.go    # HTTP client to sidecar
  internal/service/repost.go     # CreateCampaign (OpenAI spin), CrawlPage, RunCampaign
  internal/api/handlers/repost.go
```

### Plugin updates
- `RepostTab.tsx` — fully wired to real backend: campaigns, accounts, groups, crawl
- `hooks/useRepost.ts` — `useRepostCampaigns`, `useFBAccounts`, `useFBGroups`, `useCrawledPostsReal`
- `lib/types.ts` — added `FBAccount`, `FBGroup`, `RepostCampaign`, `RepostJob`, `CrawledPostReal`

### Configuration for Phase 2
Add to `.env`:
```
SIDECAR_URL=http://localhost:9001
OPENAI_API_KEY=sk-...
```

## Phase 3 — Kling AI

### Status: ✅ BACKEND + PLUGIN WIRED (build pass, awaiting sidecar runtime test)

### New endpoints (2)

| Method | Path | Handler |
|---|---|---|
| POST | `/api/v1/facebook/kling/images` | Kling.GenerateImages |
| POST | `/api/v1/facebook/kling/videos` | Kling.GenerateVideos |

### Sidecar routes
- `POST /kling/generate` — `type: "image" | "video"`, `prompt`, `count`
- Polls `kling.ai/app/omni/new` DOM for results, downloads to local disk

### New backend files
```
backend/
  internal/api/handlers/kling.go
```

### Plugin updates
- `RepostTab.tsx` sub-tab **Kling AI** — prompt input, count selector, generate image/video buttons, result gallery
- `hooks/useRepost.ts` — `generateKlingImages`, `generateKlingVideos`

### Open work
- Real webhook subscription setup on Facebook App Dashboard
- Background worker for continuous comment monitoring (currently on-demand)
- Analytics aggregation
- Token encryption at rest
