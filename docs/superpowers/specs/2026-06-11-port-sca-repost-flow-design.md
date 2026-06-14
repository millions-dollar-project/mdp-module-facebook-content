# Port SCA Crawl + Group Repost Flow → mdp-module-facebook

**Version:** 1.0
**Date:** 2026-06-11
**Status:** Awaiting user review
**Author:** brainstorm with Cương
**Scope:** Phase 2 (Crawl + Group Repost) — full feature port từ `social-content-automation` (SCA) sang `mdp-module-facebook`

---

## Executive Summary

Migrate toàn bộ luồng crawl + repost group từ SCA (Electron + Node) sang mdp-module-facebook (Tauri + Go + Playwright sidecar) để người dùng có thể:

1. Nhập URL 1 page Facebook → crawl N bài mới nhất (newest → oldest)
2. Chọn ngày mốc (`untilDate`) → lấy N bài mới nhất **CŨ HƠN HOẶC BẰNG** ngày đó
3. Cấu hình lịch đăng: calendar chọn ngày, time slots (golden hours + custom)
4. Add nhiều account (manual Playwright login, cookie persistence)
5. Add nhiều group, gán account cho group (random + manual override)
6. Plan 1 bài → N jobs (1 per account × group combination)
7. **Bonus**: per-job toggle `Bật tự động đăng` + `Ẩn danh`
8. Hàng chợ đăng hiển thị danh sách jobs, sửa date+time từng job, **KHÔNG cho set giờ quá khứ**
9. AI spin caption (OpenAI, đã có sẵn)
10. **Unit test** xác nhận crawl đúng số bài + sort newest → oldest

---

## Decisions (đã chốt với user)

| Quyết định | Lựa chọn |
|------------|----------|
| Date semantics | `untilDate` — lấy N bài mới nhất CŨ HƠN HOẶC BẰNG ngày chọn (giống SCA) |
| AI provider | OpenAI (giữ nguyên — `mdp-module-facebook` đã wire sẵn) |
| Account login | Manual Playwright login — mở browser visible, user tự nhập email/pass/2FA, cookie persist vào `profile_path` |
| UI scope | Full port UI từ SCA — calendar+slots, queue editor, group assignment table, account login dialog |
| Ẩn danh + Auto | Per-job toggle (mỗi job có 2 cờ riêng) |
| Work target | `mdp-module-facebook` submodule (KHÔNG sửa SCA) |

---

## Goals & Non-Goals

### Goals
- Port toàn bộ UX crawl + repost từ SCA sang plugin Tauri
- Giữ nguyên data semantics (untilDate, N newest, time slots, golden hours, GMT+7)
- Thêm per-job `anonymous_posting` + `auto_enabled` UI
- Test: sidecar `scraper.test.js` xác nhận crawl đúng số bài, sort đúng, untilDate filter đúng
- Test: backend `crawler_test.go` xác nhận service layer filter + sort
- Test: plugin `RepostQueueView.test.tsx` xác nhận past-time guard

### Non-Goals
- Không sửa SCA (chỉ tham khảo)
- Không thêm Kling AI integration (Phase 3 — đã có skeleton, không nằm trong scope này)
- Không thêm multi-platform (Instagram groups, ...)
- Không sửa Phase 1 (Messenger + Comments — đã done)

---

## Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────┐
│ Plugin (React IIFE)                                 │
│ ┌──────────────────┐  ┌─────────────────────┐       │
│ │ RepostCrawlSec   │→ │ RepostPlanModal     │       │
│ │ - URL + maxPosts │  │ - chọn acc, group   │       │
│ │ - untilDate      │  │ - preview grid      │       │
│ │ - calendar/slot  │  └─────────┬───────────┘       │
│ └────────┬─────────┘            │                   │
│          │                      ▼                   │
│          │           ┌─────────────────────┐        │
│          │           │ RepostQueueView     │        │
│          │           │ - danh sách hàng chờ│        │
│          │           │ - edit date/time    │        │
│          │           │ - past-time guard   │        │
│          │           │ - ẩn danh + auto    │        │
│          │           └─────────────────────┘        │
│          │                                          │
│ ┌────────▼──────────────────────────────────────┐   │
│ │ AccountLoginDialog                            │   │
│ │ - Playwright visible → user login → save ck  │   │
│ └───────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────┐   │
│ │ GroupAssignmentTable                          │   │
│ │ - manual override acc ↔ group                │   │
│ └───────────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────────┘
                  │ HTTP
┌─────────────────▼───────────────────────────────────┐
│ Backend (Go + Gin)                                  │
│ POST /repost-crawl        {pageUrl, maxPosts, ts}   │
│ POST /repost/plan         {items[], accIds, grpIds} │
│ GET  /repost/queue        ?status=pending           │
│ PATCH /repost/jobs/:id    {scheduledAt, auto, anon} │
│ POST /accounts/:id/login                             │
│ GET  /accounts/login-sessions/:id                    │
│ POST /accounts/login-sessions/:id/cancel             │
└─────────────────┬───────────────────────────────────┘
                  │ HTTP
┌─────────────────▼───────────────────────────────────┐
│ Sidecar (Node + Playwright + Express :9090)         │
│ /crawl/page            {pageUrl, limit, untilDate}  │
│ /account/login         {profilePath}                │
│ /account/login-status  {sessionId}                  │
│ /account/login-cancel  {sessionId}                  │
│ /publish/group         {profilePath, groupId, ...}  │
└─────────────────────────────────────────────────────┘
```

---

## Database — Migration 016

**File**: `backend/internal/db/migrations/016_repost_v2.up.sql`

```sql
-- 016_repost_v2.up.sql
-- Port từ SCA: cho phép crawl page tùy ý (không cần khai báo trước trong facebook.pages)

-- Crawled posts: bỏ FK constraint, lưu URL thô
ALTER TABLE facebook.crawled_posts 
  ADD COLUMN IF NOT EXISTS source_page_url text,
  ADD COLUMN IF NOT EXISTS source_page_name text,
  ADD COLUMN IF NOT EXISTS crawled_via text NOT NULL DEFAULT 'scraper'
    CHECK (crawled_via IN ('scraper', 'graph_api')),
  ALTER COLUMN page_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crawled_posts_url_unique
  ON facebook.crawled_posts (source_url)
  WHERE source_url IS NOT NULL;

-- Login sessions (track Playwright login flow đang chạy)
CREATE TABLE IF NOT EXISTS facebook.account_login_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES facebook.fb_accounts(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled')),
  browser_pid  int,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  last_error   text
);

CREATE INDEX IF NOT EXISTS account_login_sessions_account_idx
  ON facebook.account_login_sessions (account_id, started_at DESC);

-- Repost jobs: thêm updated_at + index cho queue query
ALTER TABLE facebook.repost_jobs 
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS repost_jobs_queue_idx
  ON facebook.repost_jobs (scheduled_at, status) 
  WHERE status = 'pending' AND scheduled_at IS NOT NULL;
```

**Down**: `016_repost_v2.down.sql` (reverse các ALTER + DROP tables).

---

## Backend — services & handlers

### Service mới/cập nhật

**`internal/service/crawler.go` (mới)**

```go
package service

import (
    "context"
    "fmt"
    "sort"
    "time"

    "github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
    "github.com/millions-dollar-project/mdp-module-facebook/backend/internal/repo"
)

type CrawlRequest struct {
    PageURL   string     `json:"pageUrl" binding:"required"`
    MaxPosts  int        `json:"maxPosts" binding:"required,min=1,max=50"`
    UntilDate *time.Time `json:"untilDate,omitempty"` // inclusive: chỉ lấy posted_at <= UntilDate
}

type CrawlerService struct {
    sidecar    *SidecarClient
    crawlRepo  repo.CrawledPostRepo
}

func NewCrawlerService(sidecar *SidecarClient, crawlRepo repo.CrawledPostRepo) *CrawlerService {
    return &CrawlerService{sidecar: sidecar, crawlRepo: crawlRepo}
}

// CrawlPage gọi sidecar scraper, filter theo untilDate, sort newest → oldest, persist.
func (s *CrawlerService) CrawlPage(ctx context.Context, req CrawlRequest) ([]models.CrawledPost, error) {
    posts, err := s.sidecar.CrawlPage(ctx, req.PageURL, req.MaxPosts, req.UntilDate)
    if err != nil {
        return nil, fmt.Errorf("sidecar crawl: %w", err)
    }
    
    // Filter by untilDate (inclusive)
    if req.UntilDate != nil {
        filtered := posts[:0]
        for _, p := range posts {
            if p.PostedAt == nil || !p.PostedAt.After(*req.UntilDate) {
                filtered = append(filtered, p)
            }
        }
        posts = filtered
    }
    
    // Sort newest first
    sort.Slice(posts, func(i, j int) bool {
        ti := timeOrZero(posts[i].PostedAt)
        tj := timeOrZero(posts[j].PostedAt)
        return ti.After(tj)
    })
    
    // Truncate to MaxPosts
    if len(posts) > req.MaxPosts {
        posts = posts[:req.MaxPosts]
    }
    
    // Persist + return
    out := make([]models.CrawledPost, 0, len(posts))
    for _, p := range posts {
        cp, err := s.crawlRepo.Create(ctx, p)
        if err != nil {
            continue
        }
        out = append(out, cp)
    }
    return out, nil
}

func timeOrZero(t *time.Time) time.Time {
    if t == nil { return time.Time{} }
    return *t
}
```

**`internal/service/repost.go` (extend)**

Thêm 3 methods:
```go
// PlanItem = 1 row trong form plan (crawled post + date + time)
type PlanItem struct {
    CrawledPostID uuid.UUID `json:"crawledPostId" binding:"required"`
    Date          string    `json:"date" binding:"required"`     // "YYYY-MM-DD" GMT+7
    Time          string    `json:"time" binding:"required"`     // "HH:MM" GMT+7
    Name          string    `json:"name,omitempty"`
}

// PlanRepost: tạo N campaigns × M accounts × K groups.
// items[i].date/time + random delay → scheduledAt cho từng campaign.
func (s *RepostCampaignService) PlanRepost(
    ctx context.Context,
    items []PlanItem,
    accountIDs, groupIDs []uuid.UUID,
    captionStyle string,
) ([]models.RepostCampaign, error)

// RescheduleJob: cập nhật scheduledAt cho 1 job. Validate: scheduledAt > now() + 1 min.
func (s *RepostCampaignService) RescheduleJob(
    ctx context.Context,
    jobID uuid.UUID,
    scheduledAt time.Time,
) (*models.RepostJob, error)

// ListQueue: lấy jobs pending, sort theo scheduledAt asc, optional filter by from/to date.
func (s *RepostCampaignService) ListQueue(
    ctx context.Context,
    status string,
    fromDate, toDate *time.Time,
) ([]models.RepostJob, error)

// SetJobFlags: bật/tắt auto_enabled + anonymous_posting cho 1 job.
func (s *RepostCampaignService) SetJobFlags(
    ctx context.Context,
    jobID uuid.UUID,
    autoEnabled, anonymous *bool,
) error
```

**`internal/service/account_login.go` (mới)**

```go
package service

type AccountLoginService struct {
    accountRepo  repo.FBAccountRepo
    sessionRepo  repo.AccountLoginSessionRepo
    sidecar      *SidecarClient
}

func (s *AccountLoginService) StartLogin(ctx, accountID uuid.UUID) (sessionID uuid.UUID, err error)
func (s *AccountLoginService) GetLoginStatus(ctx, sessionID uuid.UUID) (status, lastError string, err error)
func (s *AccountLoginService) CancelLogin(ctx, sessionID uuid.UUID) error
```

### Handlers — `internal/api/handlers/repost.go` (extend)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/repost-crawl` | `{pageUrl, maxPosts, untilDate}` | `CrawledPost[]` |
| POST | `/repost/plan` | `{items, accountIds, groupIds, captionStyle}` | `RepostCampaign[]` |
| GET | `/repost/queue` | `?status=&from=&to=` | `RepostJob[]` |
| PATCH | `/repost/jobs/:id/schedule` | `{scheduledAt}` | `RepostJob` |
| PATCH | `/repost/jobs/:id/flags` | `{autoEnabled?, anonymous?}` | `{success: bool}` |
| POST | `/accounts/:id/login` | `{}` | `{sessionId}` |
| GET | `/accounts/login-sessions/:id` | — | `{status, lastError}` |
| POST | `/accounts/login-sessions/:id/cancel` | `{}` | `{success: bool}` |

**Past-time guard** ở handler `RescheduleJob`:
```go
if scheduledAt.Before(time.Now().Add(1 * time.Minute)) {
    c.JSON(http.StatusBadRequest, gin.H{"error": "scheduledAt must be > now + 1min"})
    return
}
```

### Router updates — `internal/api/router.go`

Thêm vào nhóm repost:
```go
v1.POST("/repost-crawl", repostH.CrawlPageV2)              // override handler cũ
v1.POST("/repost/plan", repostH.PlanRepost)
v1.GET("/repost/queue", repostH.ListQueue)
v1.PATCH("/repost/jobs/:id/schedule", repostH.RescheduleJob)
v1.PATCH("/repost/jobs/:id/flags", repostH.SetJobFlags)
v1.POST("/accounts/:id/login", repostH.StartAccountLogin)
v1.GET("/accounts/login-sessions/:id", repostH.GetLoginStatus)
v1.POST("/accounts/login-sessions/:id/cancel", repostH.CancelAccountLogin)
```

---

## Sidecar

### `sidecar/src/scraper.js` (extend)

**Thay đổi**: accept `untilDate` ISO string, filter posts trước khi return.

```js
async function scrapePage(pageUrl, { limit = 10, untilDate = null, headless = true } = {}) {
  // ... existing crawl logic ...
  
  // Filter theo untilDate (inclusive: posted_at <= untilDate)
  if (untilDate) {
    const cutoff = new Date(untilDate).getTime();
    posts = posts.filter(p => {
      const t = p.postedAt ? new Date(p.postedAt).getTime() : 0;
      return t <= cutoff;
    });
  }
  
  // Sort newest first (đã làm sẵn, giữ nguyên)
  posts.sort((a, b) => {
    const ta = new Date(a.postedAt || 0).getTime();
    const tb = new Date(b.postedAt || 0).getTime();
    return tb - ta;
  });
  
  return posts.slice(0, limit);
}
```

### `sidecar/src/account-login.js` (mới)

```js
const express = require("express");
const { chromium } = require("playwright");
const path = require("path");

const router = express.Router();
const sessions = new Map(); // sessionId → {browser, context, page, status, lastError}

router.post("/login", async (req, res) => {
  const { profilePath } = req.body;
  if (!profilePath) return res.status(400).json({ error: "profilePath required" });
  
  const sessionId = crypto.randomUUID();
  const userDataDir = path.resolve(profilePath);
  
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // visible — user tự login
    channel: "chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = context.pages()[0] || (await context.newPage());
  
  sessions.set(sessionId, { context, page, status: "running", lastError: null });
  
  // Navigate to login
  page.goto("https://www.facebook.com/login").catch(() => {});
  
  // Poll for completion (URL changes away from /login)
  const pollInterval = setInterval(async () => {
    try {
      const url = page.url();
      if (!url.includes("/login") && !url.includes("/recover")) {
        const sess = sessions.get(sessionId);
        if (sess) {
          sess.status = "success";
          clearInterval(pollInterval);
          // Đợi user xem xong rồi đóng
          setTimeout(() => context.close().catch(() => {}), 5000);
        }
      }
    } catch (e) { /* ignore */ }
  }, 3000);
  
  res.json({ sessionId, pid: process.pid });
});

router.get("/login-status/:sessionId", (req, res) => {
  const sess = sessions.get(req.params.sessionId);
  if (!sess) return res.status(404).json({ error: "session not found" });
  res.json({ status: sess.status, lastError: sess.lastError });
});

router.post("/login-cancel/:sessionId", async (req, res) => {
  const sess = sessions.get(req.params.sessionId);
  if (!sess) return res.status(404).json({ error: "session not found" });
  try {
    await sess.context.close();
  } catch (e) { /* ignore */ }
  sessions.delete(req.params.sessionId);
  res.json({ success: true });
});

module.exports = router;
```

### `sidecar/src/publisher.js` (extend)

Thêm param `anonymous` để tick "Post anonymously" trong composer:

```js
async function publishToGroup({ profilePath, groupId, caption, mediaPaths = [], anonymous = false }) {
  // ... existing flow ...
  
  // Nếu anonymous = true, tìm và click "Post anonymously" toggle
  if (anonymous) {
    const anonButton = await page.$('text=Ẩn danh tên') || await page.$('text=Post anonymously');
    if (anonButton) {
      await anonButton.click();
      await page.waitForTimeout(500);
    } else {
      throw new Error("Group does not support anonymous posting");
    }
  }
  
  // ... continue with submit ...
}
```

---

## Plugin UI — port từ SCA

### File mới

| File (mới) | Port từ SCA | Chức năng |
|------------|-------------|-----------|
| `plugin/src/sections/Repost/RepostCrawlSection.tsx` | `RepostCrawlSection.tsx` | Form: URL + maxPosts + untilDate + calendar + time slots + post picker + Import |
| `plugin/src/sections/Repost/RepostPlanModal.tsx` | `ImportCampaignModal.tsx` | Modal: chọn account, group, preview 10×10 grid |
| `plugin/src/sections/Repost/RepostQueueView.tsx` | `CampaignTrackingPanel.tsx` (một phần) | Queue list + edit date/time + auto/anon toggles + past-time guard |
| `plugin/src/sections/Repost/AccountLoginDialog.tsx` | `AccountLoginDialog.tsx` | Playwright visible dialog + poll status |
| `plugin/src/sections/Repost/GroupAssignmentTable.tsx` | `GroupAssignmentTable.tsx` | Bảng acc ↔ group manual override |
| `plugin/src/sections/Repost/index.ts` | — | barrel export |

### File refactor

**`plugin/src/tabs/RepostTab.tsx`** — refactor sub-tabs:
- **Crawl**: dùng `RepostCrawlSection` + `RepostPlanModal`
- **Queue**: dùng `RepostQueueView`
- **Tài khoản**: list + button "Login" mở `AccountLoginDialog`
- **Nhóm**: list + dùng `GroupAssignmentTable` cho manual override
- **Kling AI**: giữ nguyên (Phase 3)

### CSS

Port các Tailwind class của SCA sang file `plugin/src/styles.css` dạng utility:
- `.repost-card`, `.repost-calendar-day`, `.repost-time-slot`, `.repost-queue-row`, ...

Hoặc viết CSS module mới. Decision sẽ chốt khi implement.

### Past-time guard (UI)

Trong `RepostQueueView.tsx`:
```tsx
const minScheduleTimeToday = (): string => {
  const now = new Date(Date.now() + 2 * 60_000); // buffer 2 phút
  return now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
};

const isTimeInFuture = (dateStr: string, timeStr: string): boolean => {
  const target = new Date(`${dateStr}T${timeStr}:00+07:00`);
  return target.getTime() > Date.now() + 60_000;
};

<input
  type="time"
  min={editingDate === todayVN ? minScheduleTimeToday() : undefined}
  onChange={(e) => setEditingTime(e.target.value)}
  onBlur={() => {
    if (!isTimeInFuture(editingDate, editingTime)) {
      alert("Không thể lên lịch giờ đã qua. Vui lòng chọn giờ trong tương lai.");
      resetEdit();
    } else {
      void commitReschedule();
    }
  }}
/>
```

### Ẩn danh + Auto toggle (UI)

Trong mỗi row của `RepostQueueView`:
```tsx
<div className="repost-queue-row__flags">
  <label>
    <input
      type="checkbox"
      checked={job.autoEnabled}
      onChange={(e) => patchJobFlags(job.id, { autoEnabled: e.target.checked })}
    />
    Bật tự động đăng
  </label>
  <label>
    <input
      type="checkbox"
      checked={job.anonymousPosting}
      onChange={(e) => patchJobFlags(job.id, { anonymous: e.target.checked })}
    />
    Ẩn danh
  </label>
</div>
```

---

## Tests

### 1. Sidecar — `sidecar/src/scraper.test.js` (vitest)

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { scrapePage } from "./scraper.js";

vi.mock("playwright", () => ({
  chromium: { launchPersistentContext: vi.fn() },
}));

describe("scraper", () => {
  // Build mock HTML với N posts, mỗi post có postedAt khác nhau
  function buildMockHtml(posts) {
    // ... mock DOM bằng cheerio + jsdom
  }
  
  it("returns N newest posts in descending order", async () => {
    // Mock page có 30 posts, gọi limit=10
    // Expect: trả 10 posts, posts[0].postedAt > posts[1].postedAt > ... > posts[9].postedAt
  });
  
  it("respects limit param", async () => {
    // Mock 20 posts, limit=5
    // Expect: trả đúng 5 posts
  });
  
  it("filters by untilDate (inclusive)", async () => {
    // Mock posts từ 2026-06-01 → 2026-06-15
    // untilDate = 2026-06-10
    // Expect: chỉ trả posts posted at <= 2026-06-10
  });
  
  it("returns empty array if no posts older than untilDate", async () => {
    // Mock 5 posts newest
    // untilDate = 2020-01-01 (rất cũ)
    // Expect: trả []
  });
  
  it("preserves newest-first order after untilDate filter", async () => {
    // Mock posts: [newest, old, newer, oldest]
    // untilDate = old.postedAt
    // Expect: trả [newest, old], với newest > old
  });
});
```

### 2. Backend — `backend/internal/service/crawler_test.go`

```go
func TestCrawlerService_FilterByUntilDate(t *testing.T) {
    // Mock sidecar trả 10 posts với postedAt khác nhau
    // UntilDate = middle.postedAt
    // Expect: chỉ trả posts postedAt <= middle.postedAt
}

func TestCrawlerService_SortNewestFirst(t *testing.T) {
    // Mock sidecar trả posts theo order bất kỳ
    // Expect: trả về sort theo postedAt desc
}

func TestCrawlerService_RespectsMaxPosts(t *testing.T) {
    // Mock 30 posts, maxPosts=10
    // Expect: trả đúng 10
}
```

### 3. Backend — `backend/internal/api/handlers/repost_test.go`

```go
func TestRescheduleJob_PastTime(t *testing.T) {
    // Setup: 1 job pending
    // PATCH scheduledAt = now - 1h
    // Expect: 400 Bad Request
}

func TestRescheduleJob_FutureTime(t *testing.T) {
    // Setup: 1 job pending
    // PATCH scheduledAt = now + 1h
    // Expect: 200, job.scheduledAt updated
}

func TestListQueue_PendingSortedAsc(t *testing.T) {
    // Setup: 3 jobs pending với scheduledAt khác nhau
    // GET /repost/queue?status=pending
    // Expect: trả 3 jobs, sort by scheduledAt asc
}
```

### 4. Plugin — `plugin/src/sections/Repost/RepostQueueView.test.tsx`

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RepostQueueView } from "./RepostQueueView";

describe("RepostQueueView", () => {
  it("renders queue list", async () => {
    // Mock useRepostQueue returns 3 jobs
    // Expect: 3 rows
  });
  
  it("date input min = today", () => {
    // Render 1 job
    // Expect: date input có min = hôm nay (VN timezone)
  });
  
  it("time input min = currentTime+buffer for today", () => {
    // Render 1 job scheduled today
    // Expect: time input min >= current time
  });
  
  it("rejects past time on blur", async () => {
    // Mock PATCH endpoint
    // Set time to past → blur
    // Expect: alert shown, PATCH not called
  });
  
  it("accepts future time on blur", async () => {
    // Mock PATCH endpoint
    // Set time to future → blur
    // Expect: PATCH called with correct ISO timestamp
  });
  
  it("ẩn danh toggle calls PATCH /flags", async () => {
    // Click anonymous checkbox
    // Expect: PATCH called with { anonymous: true }
  });
  
  it("bật tự động đăng toggle calls PATCH /flags", async () => {
    // Click auto checkbox
    // Expect: PATCH called with { autoEnabled: true }
  });
});
```

---

## Files thay đổi (tổng kết)

### Backend (~10 file)
- `internal/db/migrations/016_repost_v2.up.sql` (mới)
- `internal/db/migrations/016_repost_v2.down.sql` (mới)
- `internal/service/crawler.go` (mới)
- `internal/service/repost.go` (extend: thêm 4 methods)
- `internal/service/account_login.go` (mới)
- `internal/api/handlers/repost.go` (extend: thêm 8 handlers)
- `internal/api/router.go` (thêm 8 routes)
- `internal/repo/repost.go` (extend: thêm repo cho account_login_sessions)
- `internal/service/crawler_test.go` (mới)
- `internal/api/handlers/repost_test.go` (mới)

### Sidecar (~3 file)
- `src/scraper.js` (extend: untilDate param)
- `src/account-login.js` (mới)
- `src/scraper.test.js` (mới)
- `src/publisher.js` (extend: anonymous param)

### Plugin (~6 file mới + 1 refactor + 1 test)
- `src/sections/Repost/RepostCrawlSection.tsx` (mới)
- `src/sections/Repost/RepostPlanModal.tsx` (mới)
- `src/sections/Repost/RepostQueueView.tsx` (mới)
- `src/sections/Repost/AccountLoginDialog.tsx` (mới)
- `src/sections/Repost/GroupAssignmentTable.tsx` (mới)
- `src/sections/Repost/index.ts` (mới)
- `src/sections/Repost/RepostQueueView.test.tsx` (mới)
- `src/tabs/RepostTab.tsx` (refactor)
- `src/styles.css` (extend — thêm class repost-*)

---

## Data flow chi tiết

### Flow A: Crawl + plan
```
1. User mở tab Repost → Crawl
2. Nhập pageUrl + maxPosts + untilDate (optional)
3. Cấu hình calendar (chọn ngày) + time slots
4. Click "Crawl"
   → Plugin: POST /repost-crawl {pageUrl, maxPosts, untilDate}
   → Backend: service.CrawlPage → sidecar.ScrapePage → filter+sort → DB
   → Trả CrawledPost[] → plugin hiển thị
5. User chọn posts + click "Plan"
   → Modal mở → chọn accountIds + groupIds + captionStyle
   → Plugin: POST /repost/plan {items, accountIds, groupIds, captionStyle}
   → Backend: service.PlanRepost
     - Mỗi item = 1 campaign
     - Mỗi campaign × M accounts × K groups = M×K jobs
     - Caption spin qua OpenAI
   → Trả RepostCampaign[] → plugin chuyển sang Queue
```

### Flow B: Account login
```
1. User mở tab Tài khoản → click "Login" trên 1 acc
2. AccountLoginDialog mở
3. Plugin: POST /accounts/:id/login → service.StartLogin
   → sidecar /account/login {profilePath}
   → Playwright launch visible → navigate /login → user login
   → Trả sessionId
4. Plugin poll: GET /accounts/login-sessions/:id mỗi 3s
5. Khi sidecar detect URL không còn /login → status=success
6. User click "Đóng dialog" → sidecar close context
```

### Flow C: Edit queue
```
1. User mở tab Queue
2. Plugin: GET /repost/queue?status=pending → trả jobs sorted by scheduled_at asc
3. Mỗi row có: time input, date input, "Bật tự động đăng" toggle, "Ẩn danh" toggle
4. User sửa time → onBlur
   → Validate isTimeInFuture(date, time)
   → Nếu fail: alert + reset
   → Nếu pass: PATCH /repost/jobs/:id/schedule {scheduledAt: ISO}
5. User tick "Ẩn danh"
   → PATCH /repost/jobs/:id/flags {anonymous: true}
6. User tick "Bật tự động đăng"
   → PATCH /repost/jobs/:id/flags {autoEnabled: true}
7. Worker backend (existing `internal/service/scheduler.go`) pick up jobs có
   autoEnabled=true AND scheduled_at <= now
```

### Flow D: Worker publishes
```
1. Scheduler tick (existing) → tìm job pending + autoEnabled + due
2. service.RunJob(job)
   → Check group access: sidecar.CheckGroupAccess
   → Nếu OK: sidecar.PublishToGroup({anonymous: job.anonymous_posting, ...})
   → Sidecar mở Playwright profile, navigate group, post (toggle anon nếu cần)
   → Update job status + post_url
```

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Ẩn danh không có sẵn trên mọi group | Medium | UI hiển thị warning khi tick; sidecar throw rõ ràng nếu không tìm thấy toggle; cho phép retry sau khi user un-tick |
| Cookie expire | Medium | UI badge "Last verified"; periodic check tự động (Phase 2.1) |
| Playwright head crash khi login | Low | Session tracking + recover; cancel endpoint |
| Time zone confusion (UTC vs GMT+7) | High | Tất cả `untilDate` parse theo GMT+7; tất cả `scheduledAt` convert sang UTC trước khi lưu DB; UI hiển thị GMT+7 |
| Concurrent logins cùng account | Low | UI disable "Login" khi session running; backend 409 conflict |

---

## Open questions (resolved 2026-06-11)

1. **Date semantics**: `untilDate` — lấy N bài mới nhất CŨ HƠN HOẶC BẰNG ngày chọn (giống SCA).
2. **AI provider**: OpenAI (giữ).
3. **Account login flow**: Manual Playwright visible.
4. **UI scope**: Full port UI từ SCA.
5. **Ẩn danh + Auto**: Per-job toggle.

---

## Out of scope (Phase 2.1+)

- Anti-detect (proxy, fingerprint rotation, stealth)
- Auto warm-up account
- 2FA auto-resolve
- Bulk CSV import 100 groups (Phase 1A nếu cần)
- Per-acc caption style (Phase 2)
- Multi-platform (Instagram, TikTok)
- Periodic cookie verify

---

## Sign-off

- [ ] User reviewed spec
- [ ] Risks acknowledged
- [ ] Scope agreed
- [ ] Phase 1 tasks created (next: writing-plans skill)
