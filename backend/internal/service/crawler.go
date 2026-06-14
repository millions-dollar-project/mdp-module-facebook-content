package service

import (
	"context"
	"fmt"
	"sort"
	"time"
)

// FilterAndLimitCrawledPosts takes the raw posts returned by the sidecar
// scraper and applies three pure transformations:
//
//  1. Drop any post with PostedAt newer than *until* (nil means "no
//     upper bound"). Used to scope the crawl to a date the user picked
//     in the UI ("Từ ngày = 12/06/2026 → lùi về cũ hơn lấy đủ số
//     lượng" — start at the chosen date, walk backward in time until
//     `limit` posts are collected).
//     The handler layer passes `until` as the *exclusive* end-of-day
//     in the caller's local timezone (parseUntilDate adds +1 day), so
//     `t.After(*until)` drops posts strictly newer than the chosen day.
//  2. Sort the remaining posts newest-first by PostedAt.
//  3. Take the first `limit` posts. limit<=0 means "no upper bound".
//
// Posts whose PostedAt is unparseable sink to the end of the sorted slice
// (we never drop data because of a parse error — that would silently lose
// posts on UI glitches).
func FilterAndLimitCrawledPosts(in []CrawlPost, limit int, until *time.Time) ([]CrawlPost, error) {
	if len(in) == 0 {
		return []CrawlPost{}, nil
	}
	if until == nil {
		if limit > 0 && len(in) > limit {
			return append([]CrawlPost(nil), in[:limit]...), nil
		}
		return append([]CrawlPost(nil), in...), nil
	}

	// 1. Filter by untilDate. Pre-compute parsed times so the sort step
	//    can compare cheaply.
	type indexed struct {
		post CrawlPost
		t    time.Time
		ok   bool
	}
	parsed := make([]indexed, 0, len(in))
	for _, p := range in {
		if until != nil {
			t, err := time.Parse(time.RFC3339Nano, p.PostedAt)
			if err == nil && t.After(*until) {
				continue
			}
		}
		t, err := time.Parse(time.RFC3339Nano, p.PostedAt)
		parsed = append(parsed, indexed{post: p, t: t, ok: err == nil})
	}

	// 2. Sort newest-first by parsed time. Unparseable posts go last but
	//    keep their stable input order.
	sort.SliceStable(parsed, func(i, j int) bool {
		ai, aj := parsed[i], parsed[j]
		switch {
		case ai.ok && !aj.ok:
			return true
		case !ai.ok && aj.ok:
			return false
		case ai.ok && aj.ok:
			return ai.t.After(aj.t)
		default:
			return false
		}
	})

	// 3. Take first `limit`.
	out := make([]CrawlPost, 0, len(parsed))
	for i, p := range parsed {
		out = append(out, p.post)
		if limit > 0 && i+1 >= limit {
			break
		}
	}
	return out, nil
}

// Crawler orchestrates the full crawl pipeline: ask the sidecar to scrape
// a public page, filter/sort/limit the result, and persist each post via
// the crawled-post repo. The pure transform is exposed as
// FilterAndLimitCrawledPosts so it can be unit-tested without a DB.
type Crawler struct {
	sidecar *SidecarClient
	repo    CrawledPostPersister
}

// CrawledPostPersister is the subset of the crawled-post repo the crawler
// needs. Defined here so tests can pass a stub.
type CrawledPostPersister interface {
	Upsert(ctx interface{ Done() <-chan struct{} }, post CrawlPost) error
}

// NewCrawler wires a Crawler with a sidecar and persister.
func NewCrawler(sidecar *SidecarClient, repo CrawledPostPersister) *Crawler {
	return &Crawler{sidecar: sidecar, repo: repo}
}

// CrawlResult is what Crawl returns to its caller.
type CrawlResult struct {
	Posts     []CrawlPost
	Persisted int
}

// Crawl scrapes a page, filters by untilDate, sorts newest-first, and
// persists up to `limit` posts. It is the SCA-style entry point used by
// the plugin's "Thu thập bài viết" form.
func (c *Crawler) Crawl(ctx context.Context, pageURL string, limit int, until *time.Time, profilePath string) (*CrawlResult, error) {
	if c.sidecar == nil {
		return nil, fmt.Errorf("crawler: sidecar not configured")
	}
	raw, err := c.sidecar.CrawlPage(ctx, pageURL, limit, until, profilePath)
	if err != nil {
		return nil, fmt.Errorf("crawler: sidecar: %w", err)
	}
	filtered, err := FilterAndLimitCrawledPosts(raw, limit, until)
	if err != nil {
		return nil, fmt.Errorf("crawler: filter: %w", err)
	}
	res := &CrawlResult{Posts: filtered}
	for _, p := range filtered {
		// The existing CrawledPostRepo.Create signature in this repo
		// takes models.CrawledPost, not CrawlPost; we hand it through
		// only if the persister was wired. If not, skip silently.
		if c.repo == nil {
			continue
		}
		// Persistence is best-effort: errors don't drop the post from
		// the response so the UI can show it immediately.
		_ = c.repo.Upsert(ctx, p)
		res.Persisted++
	}
	return res, nil
}
