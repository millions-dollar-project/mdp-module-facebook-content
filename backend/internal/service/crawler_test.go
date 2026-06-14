package service

import (
	"testing"
	"time"
)

// mkPost builds a CrawlPost with PostedAt as RFC3339Nano of the given time.
func mkPost(id string, postedAt time.Time) CrawlPost {
	return CrawlPost{
		ID:       id,
		PageID:   "page-x",
		Content:  "hello " + id,
		MediaType: "text",
		PostedAt: postedAt.UTC().Format(time.RFC3339Nano),
	}
}

// TestFilterCrawledPosts_SortByPostedAtDesc verifies the filter returns
// posts sorted newest-first regardless of the sidecar's input order.
// Requirement: "lấy 10 bài mới nhất từ trên xuống" — newest to oldest.
func TestFilterCrawledPosts_PreservesFeedOrderWithoutDate(t *testing.T) {
	t1 := time.Date(2026, 6, 11, 9, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 6, 10, 9, 0, 0, 0, time.UTC)
	t3 := time.Date(2026, 6, 9, 9, 0, 0, 0, time.UTC)
	in := []CrawlPost{mkPost("mid", t2), mkPost("old", t3), mkPost("new", t1)}
	out, err := FilterAndLimitCrawledPosts(in, 10, nil)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(out) != 3 {
		t.Fatalf("expected 3 posts, got %d", len(out))
	}
	if out[0].ID != "mid" || out[1].ID != "old" || out[2].ID != "new" {
		t.Fatalf("wrong order: %v %v %v", out[0].ID, out[1].ID, out[2].ID)
	}
}

// TestFilterCrawledPosts_AppliesLimit verifies that only the top N
// newest posts are returned when limit < len(input).
func TestFilterCrawledPosts_AppliesLimit(t *testing.T) {
	base := time.Date(2026, 6, 11, 9, 0, 0, 0, time.UTC)
	in := make([]CrawlPost, 10)
	for i := range in {
		// older as i grows
		in[i] = mkPost(string(rune('a'+i)), base.Add(-time.Duration(i)*time.Hour))
	}
	out, err := FilterAndLimitCrawledPosts(in, 3, nil)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(out) != 3 {
		t.Fatalf("expected 3 posts, got %d", len(out))
	}
	if out[0].ID != "a" || out[1].ID != "b" || out[2].ID != "c" {
		t.Fatalf("wrong top-3: %v %v %v", out[0].ID, out[1].ID, out[2].ID)
	}
}

// TestFilterCrawledPosts_RespectsUntilDate verifies posts newer than
// untilDate are dropped. With untilDate=2026-06-10T12:00Z and posts
// on the 9th, 10th, 11th, only the 9th and 10th should remain (the
// 11th is strictly newer).
//
// Spec: "Từ ngày = 12/06/2026 → lùi về cũ hơn lấy đủ số lượng" —
// caller picks a date, crawl starts there and walks backward in time.
func TestFilterCrawledPosts_RespectsUntilDate(t *testing.T) {
	d9 := time.Date(2026, 6, 9, 12, 0, 0, 0, time.UTC)
	d10 := time.Date(2026, 6, 10, 12, 0, 0, 0, time.UTC)
	d11 := time.Date(2026, 6, 11, 12, 0, 0, 0, time.UTC)
	in := []CrawlPost{mkPost("d09", d9), mkPost("d10", d10), mkPost("d11", d11)}
	until := time.Date(2026, 6, 10, 12, 0, 0, 0, time.UTC)
	out, err := FilterAndLimitCrawledPosts(in, 10, &until)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(out) != 2 {
		t.Fatalf("expected 2 posts (d09+d10), got %d (%v)", len(out), idsOf(out))
	}
	// Order: d10 first, d09 second.
	if out[0].ID != "d10" || out[1].ID != "d09" {
		t.Fatalf("wrong order: %v %v", out[0].ID, out[1].ID)
	}
}

// TestFilterCrawledPosts_RespectsUntilExclusiveEndOfDay simulates
// the value Go's parseUntilDate sends to the sidecar: when the user
// picks "2026-06-10" in Asia/Ho_Chi_Minh, parseUntilDate returns
// 2026-06-11T00:00:00+07:00 = 2026-06-10T17:00:00Z. Posts at
// 23:59:59 local on the 10th (16:59:59Z) must be kept.
func TestFilterCrawledPosts_RespectsUntilExclusiveEndOfDay(t *testing.T) {
	// 2026-06-11 00:00 +07:00 == 2026-06-10 17:00:00 UTC
	until := time.Date(2026, 6, 10, 17, 0, 0, 0, time.UTC)
	postOnCutoffDay := time.Date(2026, 6, 10, 16, 59, 0, 0, time.UTC) // 23:59 +07
	postDayBefore := time.Date(2026, 6, 9, 23, 0, 0, 0, time.UTC)
	postDayAfter := time.Date(2026, 6, 10, 17, 0, 1, 0, time.UTC) // 00:00 +07 next day
	in := []CrawlPost{
		mkPost("onDay", postOnCutoffDay),
		mkPost("before", postDayBefore),
		mkPost("after", postDayAfter),
	}
	out, err := FilterAndLimitCrawledPosts(in, 10, &until)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(out) != 2 {
		t.Fatalf("expected 2 posts (onDay+before), got %d (%v)", len(out), idsOf(out))
	}
	if out[0].ID != "onDay" || out[1].ID != "before" {
		t.Fatalf("wrong order: %v %v", out[0].ID, out[1].ID)
	}
}

// TestFilterCrawledPosts_Empty verifies an empty input returns empty
// without error — used when a page has no posts or scrape failed and
// the sidecar returned a non-error empty list.
func TestFilterCrawledPosts_Empty(t *testing.T) {
	out, err := FilterAndLimitCrawledPosts(nil, 10, nil)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(out) != 0 {
		t.Fatalf("expected empty, got %d posts", len(out))
	}
}

func idsOf(posts []CrawlPost) []string {
	out := make([]string, len(posts))
	for i, p := range posts {
		out[i] = p.ID
	}
	return out
}
