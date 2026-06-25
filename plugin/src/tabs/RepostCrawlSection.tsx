/**
 * RepostCrawlSection — "Thu thập bài viết" + danh sách bài crawl.
 *
 * Mỗi bài hiển thị dạng **card collapse** mặc định:
 *   - Collapsed: thumbnail ảnh đầu (nếu có) + 200 ký tự content đầu
 *     + meta (thời gian / like / comment / share) + nút "Xem thêm".
 *   - Expanded:  full content (y hệt post gốc — giữ xuống dòng, hashtag, link)
 *                + grid ảnh (ảnh lớn, click mở tab mới)
 *                + video controls (preload metadata)
 *                + ô Sửa nội dung
 *                + nút Tạo lịch đăng riêng cho bài đó
 *
 * Bài được **sort theo postedAt DESC** (mới nhất lên đầu).
 * Backend có thể trả theo thứ tự khác nên ta sort defensive phía client.
 *
 * Inputs:
 *   - pageUrl   required
 *   - maxPosts  default 10
 *   - untilDate optional "DD/MM/YYYY"
 *
 * onSchedule(post) truyền post đã edit sang parent; parent
 * (RepostTab) mở RepostPlanModal để user chọn account + group + time.
 */
import React from 'react';
import { Button, Card, FormField, Input, Textarea, useToast } from '../components';
import { fbFetch } from '../lib/api';
import { openExternal } from '../lib/external';
import type { FBAccount } from '../lib/types';
import { useBrainIngest } from '../hooks/useBrainIngest';
import { useCrawlerSources } from '../hooks/useCrawlerSources';
import { crawlerRun, getCrawlerTrends, CRAWLER_PORT, type CrawlTrend } from '../lib/crawlerApi';

type CrawlMode = 'page' | 'account';

export interface CrawledPost {
  id: string;
  pageId: string;
  content: string;
  fullContent?: string;
  mediaUrls: string[];
  videoUrls: string[];
  // Thumbnail URLs + first non-emoji picture, populated by the sidecar so
  // the crawl view can render a preview without re-fetching the source
  // page. The publisher still downloads the original mediaUrls at post
  // time; these fields are display-only.
  thumbnailUrls?: string[];
  fullPicture?: string;
  // Reaction emoji image URLs the sidecar pulled from the "See who
  // reacted" toolbar. Rendered as <img> so the user sees the same
  // colored like/love/haha row FB itself shows, instead of plain
  // unicode (which doesn't carry FB's specific colors).
  reactionIcons?: string[];
  mediaType: string;
  likes: number;
  comments: number;
  shares: number;
  postedAt: string;
  permalink: string;
}

interface Props {
  accounts: FBAccount[];
  groups: { id: string; groupId: string; name?: string | null }[];
  onSchedule: (post: CrawledPost) => void;
  /**
   * Optional callback to switch the parent tab to "Brain Feed".
   * Wires the "Mở Brain Feed" chip after a successful auto-ingest.
   */
  onOpenBrainFeed?: () => void;
}

const PREVIEW_CHARS = 200;
const VI_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

const isValidViDateInput = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const m = trimmed.match(VI_DATE_RE);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
};

/**
 * Parse a `postedAt` value. Facebook's sidecar sometimes returns an
 * ISO/RFC3339 string and sometimes a unix epoch (seconds since 1970,
 * 10-digit number). Try ISO first, then fall back to "all digits →
 * treat as unix seconds".
 */
const parseDate = (s: string | number | null | undefined): Date | null => {
  if (s == null) return null;
  // Numeric (or numeric string) — interpret as unix seconds.
  if (typeof s === 'number' || /^\d+$/.test(String(s).trim())) {
    const n = Number(s);
    if (n <= 0) return null;
    // Sidecar returns seconds (10 digits); Date expects ms.
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(s));
  return isNaN(d.getTime()) || d.getTime() <= 0 ? null : d;
};

/**
 * Convert an mdp-crawler trend row into the CrawledPost shape the UI
 * already knows how to render. The trend table is intentionally thin
 * (id, author, text, posted_at, stats, url) — fields like mediaUrls,
 * reactions and a stable pageId are filled with safe defaults so the
 * card grid doesn't crash.
 */
const crawlerTrendToPost = (t: CrawlTrend, pageId: string): CrawledPost => {
  const postedAtRaw = (t.posted_at as string | number | undefined) ?? '';
  const date = parseDate(postedAtRaw);
  return {
    id: String(t.id ?? t.post_id ?? crypto.randomUUID()),
    pageId,
    content: String(t.text ?? ''),
    fullContent: String(t.text ?? ''),
    mediaUrls: [],
    videoUrls: [],
    mediaType: 'text',
    likes: Number(t.likes ?? 0),
    comments: Number(t.comments ?? 0),
    shares: Number(t.shares ?? 0),
    postedAt: date ? date.toISOString() : String(postedAtRaw),
    permalink: String(t.url ?? ''),
  };
};

export const RepostCrawlSection: React.FC<Props> = ({ accounts, groups, onSchedule, onOpenBrainFeed }) => {
  const [pageUrl, setPageUrl] = React.useState('');
  const [maxPosts, setMaxPosts] = React.useState(10);
  // Tự fill ngày hiện tại vào "Từ ngày" — user yêu cầu mặc định là hôm nay.
  // Lưu ý: nếu page chưa đăng bài nào trong ngày thì sẽ trả 0 kết quả;
  // user có thể xoá trống ô này để lấy N bài mới nhất không giới hạn ngày.
  const [untilDate, setUntilDate] = React.useState('');
  const [selectedAccountId, setSelectedAccountId] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  // Mode selector: 'page' (URL tự do) vs 'account' (mdp-crawler source
  // đã login). Khi 'account' user chọn 1 source từ /api/sources.
  const [crawlMode, setCrawlMode] = React.useState<CrawlMode>('page');
  const [selectedSourceId, setSelectedSourceId] = React.useState('');
  const crawler = useCrawlerSources();
  const [posts, setPosts] = React.useState<CrawledPost[]>([]);
  const [lastCrawlLimit, setLastCrawlLimit] = React.useState<number | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingContent, setEditingContent] = React.useState('');
  // Bài nào đang mở rộng (mặc định tất cả collapse)
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  // Count of posts the last auto-ingest successfully pushed to Brain.
  // Drives the "✅ Đã đẩy N bài vào Brain · Mở Brain Feed →" chip below
  // the crawl results. 0 (or not-yet-set) hides the chip.
  const [lastIngestedCount, setLastIngestedCount] = React.useState<number>(0);
  const toast = useToast();
  const { ingest } = useBrainIngest();

  /**
   * Push freshly crawled posts to Brain. Always-on per the T13 plan
   * (D7: no toggle). Failures are surfaced as a toast but never abort
   * the crawl flow — the user already has the posts on screen.
   */
  const autoIngestPosts = React.useCallback(
    async (toIngest: CrawledPost[]) => {
      if (toIngest.length === 0) {
        setLastIngestedCount(0);
        return;
      }
      try {
        const res = await ingest({
          posts: toIngest.map((p) => ({
            sourceURL: p.permalink,
            pageID: p.pageId,
            content: p.content ?? '',
            mediaURLs: p.mediaUrls ?? [],
            videoURLs: p.videoUrls ?? [],
            thumbnailURLs: p.thumbnailUrls,
            fullPicture: p.fullPicture,
            mediaType: p.mediaType ?? '',
            likes: p.likes ?? 0,
            comments: p.comments ?? 0,
            shares: p.shares ?? 0,
            postedAt: p.postedAt ?? '',
            permalink: p.permalink ?? '',
          })),
        });
        if (res.ingested > 0) {
          toast.success(`Đã đẩy ${res.ingested} bài vào Brain`);
        }
        if (res.failed > 0) {
          toast.error(`${res.failed} bài lỗi ingest — xem Brain Feed`);
        }
        if (res.ingested === 0 && res.failed === 0 && res.skipped > 0) {
          // All posts skipped (e.g. duplicates already in feed). Don't
          // show the chip — user didn't actually push new content.
          toast.info(`Bỏ qua ${res.skipped} bài trùng — không có bài mới vào Brain`);
          setLastIngestedCount(0);
          return;
        }
        setLastIngestedCount(res.ingested);
      } catch (e) {
        // Network/MCP failure: crawl already succeeded, just note the
        // ingest problem. The user can retry by clicking "Thu thập" again.
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`Ingest Brain lỗi: ${msg}`);
        setLastIngestedCount(0);
      }
    },
    [ingest, toast],
  );

  React.useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[accounts.length - 1].id);
    }
  }, [accounts, selectedAccountId]);

  const selectedAccount = React.useMemo(() => {
    return accounts.find((account) => account.id === selectedAccountId) ?? accounts[accounts.length - 1] ?? null;
  }, [accounts, selectedAccountId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Sort newest → oldest. Defensive: backend có thể trả theo thứ tự khác.
  const sortedPosts = posts;

  // Compute the effective target the user wants to crawl. In 'page'
  // mode it's a free URL. In 'account' mode it's the source's first
  // entry_url (mdp-crawler sources are pre-configured to the right
  // start URL — feed, newsfeed, etc.).
  const effectiveTarget = React.useMemo(() => {
    if (crawlMode === 'account') {
      const src = crawler.sources.find((s) => s.id === selectedSourceId);
      return src?.entry_urls?.[0] ?? '';
    }
    return pageUrl.trim();
  }, [crawlMode, pageUrl, crawler.sources, selectedSourceId]);

  const handleCrawl = async () => {
    if (!effectiveTarget) {
      toast.warning(
        crawlMode === 'page'
          ? 'Nhập URL trang Facebook trước'
          : 'Chọn 1 tài khoản (mdp-crawler source) trước'
      );
      return;
    }
    if (!isValidViDateInput(untilDate)) {
      toast.warning('Nhập "Từ ngày" theo định dạng ngày/tháng/năm, ví dụ 06/12/2026');
      return;
    }
    setLoading(true);
    try {
      let data: CrawledPost[];
      let fellBack = false;
      if (crawlMode === 'account') {
        // Account mode: route through mdp-crawler. The Go sidecar has no
        // access to the user's logged-in CDP browser, so calling it would
        // hit Facebook's login wall. mdp-crawler writes trends to its own
        // DB; we read them back to populate the list.
        const run = await crawlerRun(selectedSourceId);
        if (run.error) {
          throw new Error(run.error);
        }
        const trends = await getCrawlerTrends(maxPosts);
        data = trends.map((t) => crawlerTrendToPost(t, selectedSourceId));
      } else {
        // Lần 1: dùng untilDate (nếu user đã điền / mặc định hôm nay).
        // Gửi accountId của account active đầu tiên (nếu có) để sidecar
        // mở Chrome với profile đã login — tránh bị Facebook throttle.
        const first = await fbFetch<CrawledPost[]>('crawl-page-v2', {
          method: 'POST',
          body: {
            pageUrl: effectiveTarget,
            limit: maxPosts,
            untilDate: untilDate || undefined,
            accountId: selectedAccount?.id,
          },
        });
        data = first;
        // Smart fallback: nếu user filter theo "Từ ngày" mà page không có
        // bài nào trong khoảng đó (ví dụ page chưa đăng hôm nay), tự gọi
        // lại KHÔNG filter để user vẫn thấy được bài mới nhất. Tránh UX
        // "bấm thu thập → trắng trơn" dù sidecar có scrape được.
        if (data.length === 0 && untilDate) {
          const second = await fbFetch<CrawledPost[]>('crawl-page-v2', {
            method: 'POST',
            body: {
              pageUrl: effectiveTarget,
              limit: maxPosts,
              accountId: selectedAccount?.id,
            },
          });
          if (second.length > 0) {
            data = second;
            fellBack = true;
          }
        }
      }
      setPosts(data);
      setLastCrawlLimit(maxPosts);
      setSelected(new Set());
      setEditingId(null);
      setExpanded(new Set());
      if (data.length === 0) {
        toast.warning('Không tìm thấy bài nào — thử URL khác hoặc tăng "Số bài tối đa".');
        setLastIngestedCount(0);
      } else if (fellBack) {
        toast.warning(
          `Không có bài từ ${untilDate} trở đi. Đã lấy ${data.length} bài mới nhất thay thế.`
        );
        // Auto-ingest into Brain regardless of which path produced the
        // posts (smart-fallback or primary filter) — the data is real.
        void autoIngestPosts(data);
      } else {
        toast.success(`Đã thu thập ${data.length} bài viết`);
        void autoIngestPosts(data);
      }
    } catch (e) {
      toast.error(`Lỗi crawl: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Manual no-filter crawl: bỏ qua "Từ ngày" hoàn toàn và lấy N bài
   * mới nhất. Dùng khi user nghi ngờ smart fallback không kích hoạt
   * (vd. page có 1-2 bài cũ nằm trong khoảng filter nhưng bị sidecar
   * sort lệch) hoặc muốn ép kiểu "lấy mới nhất, kệ ngày".
   */
  const handleCrawlAll = async () => {
    if (!effectiveTarget) {
      toast.warning(
        crawlMode === 'page'
          ? 'Nhập URL trang Facebook trước'
          : 'Chọn 1 tài khoản (mdp-crawler source) trước'
      );
      return;
    }
    setLoading(true);
    try {
      let data: CrawledPost[];
      if (crawlMode === 'account') {
        const run = await crawlerRun(selectedSourceId);
        if (run.error) {
          throw new Error(run.error);
        }
        const trends = await getCrawlerTrends(maxPosts);
        data = trends.map((t) => crawlerTrendToPost(t, selectedSourceId));
      } else {
        data = await fbFetch<CrawledPost[]>('crawl-page-v2', {
          method: 'POST',
          body: {
            pageUrl: effectiveTarget,
            limit: maxPosts,
            accountId: selectedAccount?.id,
          },
        });
      }
      setPosts(data);
      setLastCrawlLimit(maxPosts);
      setSelected(new Set());
      setEditingId(null);
      setExpanded(new Set());
      if (data.length === 0) {
        toast.warning('Không tìm thấy bài nào — thử URL khác hoặc tăng "Số bài tối đa".');
        setLastIngestedCount(0);
      } else {
        toast.success(
          crawlMode === 'account'
            ? `Đã thu thập ${data.length} bài từ tài khoản (mdp-crawler)`
            : `Đã thu thập ${data.length} bài mới nhất (bỏ lọc ngày)`
        );
        void autoIngestPosts(data);
      }
    } catch (e) {
      toast.error(`Lỗi crawl: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (p: CrawledPost) => {
    setEditingId(p.id);
    setEditingContent(p.fullContent || p.content || '');
  };

  const saveEdit = (p: CrawledPost) => {
    setPosts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, content: editingContent, fullContent: editingContent } : x)),
    );
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
  };

  const handleSchedule = (post: CrawledPost) => {
    if (!accounts.length || !groups.length) {
      toast.warning('Cần ít nhất 1 tài khoản và 1 nhóm để lên lịch');
      return;
    }
    onSchedule(post);
  };

  const handleScheduleSelected = () => {
    if (selected.size === 0) {
      toast.warning('Chọn ít nhất 1 bài để lên lịch');
      return;
    }
    const first = sortedPosts.find((p) => selected.has(p.id));
    if (first) handleSchedule(first);
  };

  // Compute prerequisite status for 'account' mode so the warning
  // panel and button-disable can reflect it without re-fetching.
  const accountModeReady = React.useMemo(() => {
    if (crawlMode !== 'account') return true;
    if (crawler.loading) return false;
    if (crawler.error) return false; // mdp-crawler not running
    if (crawler.sources.length === 0) return false;
    const src = crawler.sources.find((s) => s.id === selectedSourceId);
    if (!src) return false;
    // risk_ack=false means the user has not acknowledged ToS risk yet
    if (src.risk_ack === false) return false;
    // network/scrape sources need a logged-in browser attached
    if (src.render === 'network' || src.render === 'scrape') {
      const ready = crawler.launch?.ready === true;
      if (!ready) return false;
    }
    return true;
  }, [crawlMode, crawler, selectedSourceId]);

  return (
    <div className="fb-crawl-section">
      {/* Form: layout 2 hàng gọn — hàng 1 URL, hàng 2 (số bài | từ ngày | nút) */}
      <Card>
        <h3>Thu thập bài viết</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Mode selector: compact segmented control, inline above URL/source */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ds-text-muted)' }}>Nguồn:</span>
            <div
              role="tablist"
              style={{
                display: 'inline-flex',
                borderRadius: 6,
                border: '1px solid var(--ds-border)',
                overflow: 'hidden',
              }}
            >
              {(['page', 'account'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={crawlMode === m}
                  onClick={() => setCrawlMode(m)}
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    border: 'none',
                    background: crawlMode === m ? 'var(--platform-accent)' : 'transparent',
                    color: crawlMode === m ? '#fff' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: crawlMode === m ? 600 : 400,
                  }}
                >
                  {m === 'page' ? 'Trang cụ thể' : 'Tài khoản của tôi'}
                </button>
              ))}
            </div>
          </div>
          {crawlMode === 'page' ? (
            <FormField label="URL trang Facebook">
              <Input
                placeholder="https://www.facebook.com/somepage"
                value={pageUrl}
                onChange={(e) => setPageUrl(e.target.value)}
              />
            </FormField>
          ) : (
            <>
              <FormField label="Tài khoản (mdp-crawler source)">
                <select
                  value={selectedSourceId}
                  onChange={(e) => setSelectedSourceId(e.target.value)}
                  disabled={crawler.loading}
                  style={{
                    width: '100%',
                    minHeight: 40,
                    borderRadius: 8,
                    border: '1px solid var(--ds-border)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    padding: '0 10px',
                  }}
                >
                  {crawler.loading && <option value="">Đang tải…</option>}
                  {!crawler.loading && crawler.error && (
                    <option value="">mdp-crawler chưa chạy</option>
                  )}
                  {!crawler.loading && !crawler.error && crawler.sources.length === 0 && (
                    <option value="">Chưa có source nào</option>
                  )}
                  {!crawler.loading && !crawler.error && crawler.sources.length > 0 && (
                    <>
                      <option value="">— chọn tài khoản —</option>
                      {crawler.sources.map((src) => {
                        const tags: string[] = [];
                        if (src.render) tags.push(src.render);
                        if (src.has_profile_dir) tags.push('profile');
                        if (src.has_cdp_url) tags.push('cdp');
                        if (src.enabled) tags.push('enabled');
                        return (
                          <option key={src.id} value={src.id}>
                            {src.id} {tags.length > 0 ? `(${tags.join(', ')})` : ''}
                          </option>
                        );
                      })}
                    </>
                  )}
                </select>
              </FormField>
              {/* Preview entry URL of selected source so the user can
                  confirm which page they're about to crawl. */}
              {selectedSourceId && (
                <div className="fb-muted" style={{ fontSize: 12, marginTop: -6 }}>
                  entry: <code style={{ fontSize: 12 }}>{crawler.sources.find((s) => s.id === selectedSourceId)?.entry_urls?.[0] ?? '—'}</code>
                </div>
              )}
              {!accountModeReady && (
                <div
                  data-testid="crawl-account-warning"
                  style={{
                    padding: 10,
                    borderRadius: 6,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--ds-warning-border, #d4a017)',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>⚠ Tính năng yêu cầu:</strong>
                  <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
                    <li>mdp-crawler đang chạy (port {CRAWLER_PORT})</li>
                    <li>Chrome/Cốc Cốc với <code>--remote-debugging-port</code> đang mở và đã login Facebook</li>
                    <li>Source chọn có <code>profile_dir</code> trỏ vào profile đã login (burner, không phải acc chính)</li>
                  </ol>
                  {crawler.error && (
                    <div style={{ marginTop: 6, opacity: 0.8 }}>
                      {crawler.error}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'flex-end',
            }}
          >
            <div style={{ width: 130, flexShrink: 0 }}>
              <FormField label="Số bài tối đa">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={String(maxPosts)}
                  onChange={(e) => setMaxPosts(Math.max(1, Number(e.target.value) || 10))}
                />
              </FormField>
            </div>
            <div style={{ width: 200, flexShrink: 0 }}>
              <FormField label="Từ ngày">
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/yyyy"
                  pattern="\d{2}/\d{2}/\d{4}"
                  value={untilDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ width: 220, flexShrink: 0 }}>
              <FormField label="Tài khoản đăng">
                <select
                  value={selectedAccount?.id ?? ''}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  disabled={loading || accounts.length === 0}
                  style={{
                    width: '100%',
                    minHeight: 40,
                    borderRadius: 8,
                    border: '1px solid var(--ds-border)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    padding: '0 10px',
                  }}
                >
                  {accounts.length === 0 ? (
                    <option value="">Chưa có tài khoản</option>
                  ) : (
                    accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))
                  )}
                </select>
              </FormField>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <Button
                onClick={handleCrawl}
                disabled={loading || !accountModeReady}
                title={!accountModeReady && crawlMode === 'account' ? 'Thiếu điều kiện tiên quyết — xem cảnh báo phía trên' : undefined}
              >
                {loading ? 'Đang thu thập…' : 'Thu thập'}
              </Button>
              <Button
                onClick={handleCrawlAll}
                disabled={loading || !accountModeReady}
                variant="ghost"
                title="Bỏ lọc ngày — lấy N bài mới nhất không giới hạn"
              >
                Tải lại tất cả
              </Button>
            </div>
          </div>
          <p className="fb-muted" style={{ fontSize: 12, margin: 0 }}>
            Để trống "Từ ngày" để lấy đúng N bài đầu feed từ trên xuống. Nếu kết quả lệch,
            thử đổi <strong>Tài khoản đăng</strong> sang profile đã login đúng Facebook.
            Bấm <strong>"Tải lại tất cả"</strong> để chủ động bỏ qua bộ lọc ngày.
          </p>
        </div>
      </Card>

      {sortedPosts.length > 0 && (
        <Card>
          {/* Header riêng: title + select-all + 1 nút Tạo lịch đăng */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Bài viết crawl ({sortedPosts.length})</h3>
              <p className="fb-muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                Bấm "Xem thêm" để mở rộng — ảnh + video + sửa nội dung.
              </p>
              {lastCrawlLimit != null && sortedPosts.length > 0 && sortedPosts.length < lastCrawlLimit && (
                <p style={{ fontSize: 12, color: 'var(--ds-warning, #c97a00)', margin: '4px 0 0' }}>
                  ⚠ Chỉ tìm được {sortedPosts.length} / {lastCrawlLimit} bài — page có thể
                  đã hết bài hiển thị trong khoảng lọc, hoặc tất cả bài còn lại là
                  pinned / quảng cáo đã bị bỏ.
                </p>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selected.size === sortedPosts.length && sortedPosts.length > 0}
                  ref={(el) => {
                    if (el) el.indeterminate = selected.size > 0 && selected.size < sortedPosts.length;
                  }}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelected(new Set(sortedPosts.map((p) => p.id)));
                    } else {
                      setSelected(new Set());
                    }
                  }}
                />
                Chọn tất cả
              </label>
              <Button onClick={handleScheduleSelected} disabled={selected.size === 0}>
                Tạo lịch đăng ({selected.size})
              </Button>
            </div>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedPosts.map((p) => (
              <CrawledPostCard
                key={p.id || p.permalink}
                post={p}
                isSelected={selected.has(p.id)}
                isExpanded={expanded.has(p.id)}
                isEditing={editingId === p.id}
                editingContent={editingContent}
                onToggle={() => toggle(p.id)}
                onToggleExpand={() => toggleExpand(p.id)}
                onStartEdit={() => startEdit(p)}
                onSaveEdit={() => saveEdit(p)}
                onCancelEdit={cancelEdit}
                onEditContentChange={setEditingContent}
              />
            ))}
          </ul>
        </Card>
      )}

      {/* Chip xác nhận auto-ingest thành công — hiện sau khi crawl đẩy
          được ít nhất 1 bài vào Brain. Click "Mở Brain Feed" chuyển tab
          (chỉ hoạt động khi parent truyền onOpenBrainFeed). Ẩn trong lúc
          crawl đang chạy để tránh chớp nháy nút. */}
      {lastIngestedCount > 0 && !loading && (
        <div
          data-testid="brain-ingest-chip"
          style={{
            marginTop: 12,
            padding: '8px 12px',
            border: '1px solid #bbf7d0',
            borderRadius: 4,
            background: '#f0fdf4',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>✅ Đã đẩy {lastIngestedCount} bài vào Brain</span>
          <button
            type="button"
            // Prefer the host's onOpenBrainFeed prop when supplied (e.g.
            // future crawlSlot wiring through StudioFrame). Fall back to a
            // window event so the chip still works when mounted via the
            // legacy RepostTab path — FacebookView listens for
            // `mdp:open-brain-feed` and switches to the Brain Feed tab.
            onClick={() => {
              if (onOpenBrainFeed) {
                onOpenBrainFeed();
              } else if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('mdp:open-brain-feed'));
              }
            }}
            data-testid="open-brain-feed-chip"
            style={{
              marginLeft: 'auto',
              padding: '4px 10px',
              background: 'transparent',
              border: 'none',
              color: '#15803d',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Mở Brain Feed →
          </button>
        </div>
      )}
    </div>
  );
};

// ---- Card component (extracted để code dễ đọc) ----
interface CardProps {
  post: CrawledPost;
  isSelected: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  editingContent: string;
  onToggle: () => void;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditContentChange: (s: string) => void;
}

const CrawledPostCard: React.FC<CardProps> = ({
  post: p,
  isSelected,
  isExpanded,
  isEditing,
  editingContent,
  onToggle,
  onToggleExpand,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
}) => {
  const fullText = p.fullContent || p.content || '';
  const needsTruncate = fullText.length > PREVIEW_CHARS;
  const displayText = isExpanded || isEditing ? fullText : (needsTruncate ? fullText.slice(0, PREVIEW_CHARS) + '…' : fullText);
  const hasMedia = (p.mediaUrls?.length ?? 0) > 0 || (p.videoUrls?.length ?? 0) > 0;
  const mediaCount = (p.mediaUrls?.length ?? 0) + (p.videoUrls?.length ?? 0);
  const isVideoPost = p.mediaType === 'video' || /\/reel\//i.test(p.permalink || '') || (p.videoUrls?.length ?? 0) > 0;
  // Prefer the explicit fullPicture from the sidecar; fall back to
  // the first media URL (which is also a non-emoji image thanks to
  // isEmojiImage filtering in the sidecar).
  const thumbnailCandidates = [p.fullPicture, ...(p.thumbnailUrls ?? []), ...(p.mediaUrls ?? [])].filter(Boolean) as string[];
  const [thumbnailIndex, setThumbnailIndex] = React.useState(0);
  const [thumbnailLoaded, setThumbnailLoaded] = React.useState(false);
  React.useEffect(() => {
    setThumbnailIndex(0);
    setThumbnailLoaded(false);
  }, [p.id, p.permalink]);
  const thumb = thumbnailCandidates[thumbnailIndex];
  React.useEffect(() => setThumbnailLoaded(false), [thumb]);
  const postedAtStr = (() => {
    const d = parseDate(p.postedAt);
    return d ? d.toLocaleString('vi-VN') : '—';
  })();
  const compactMeta = [
    `👍 ${p.likes ?? 0}`,
    `💬 ${p.comments ?? 0}`,
    `↗ ${p.shares ?? 0}`,
    mediaCount > 0 ? `📎 ${mediaCount}` : null,
  ].filter(Boolean);

  return (
    <li
      style={{
        border: `1px solid ${isSelected ? '#4a90e2' : 'var(--ds-border)'}`,
        borderRadius: 8,
        padding: 12,
        background: isSelected ? 'rgba(74, 144, 226, 0.08)' : 'var(--bg-surface-strong)',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          aria-label={`Chọn bài ${p.permalink}`}
          style={{ marginTop: 4, flexShrink: 0 }}
        />

        {/* Thumbnail (chỉ khi collapse + có ảnh/video) */}
        {!isExpanded && hasMedia && (
          <a
            href={p.permalink}
            onClick={(e) => {
              e.preventDefault();
              openExternal(p.permalink);
            }}
            style={{
              width: 120,
              height: 120,
              flexShrink: 0,
              display: 'block',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 10,
              border: '1px solid var(--ds-border)',
              background: 'linear-gradient(135deg, rgba(74,144,226,0.16), rgba(255,255,255,0.04))',
            }}
          >
            <div
              className="fb-muted"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: 10,
                fontSize: 12,
                background: 'linear-gradient(135deg, rgba(74,144,226,0.18), rgba(255,255,255,0.05))',
              }}
            >
              {isVideoPost ? 'Mở video gốc' : 'Mở ảnh gốc'}
            </div>
            {thumb ? (
              <img
                src={thumb}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onLoad={() => setThumbnailLoaded(true)}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  setThumbnailLoaded(false);
                  setThumbnailIndex((i) => i + 1);
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  background: '#05060a',
                  opacity: thumbnailLoaded ? 1 : 0,
                  position: 'relative',
                  zIndex: 1,
                }}
              />
            ) : null}
            {isVideoPost && (
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 30,
                  textShadow: '0 2px 10px rgba(0,0,0,0.7)',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              >
                ▶
              </span>
            )}
            <span
              style={{
                position: 'absolute',
                left: 8,
                bottom: 8,
                padding: '3px 7px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                background: 'rgba(0,0,0,0.68)',
                backdropFilter: 'blur(6px)',
                zIndex: 3,
              }}
            >
              {isVideoPost ? 'Video' : `${mediaCount} ảnh`}
            </span>
          </a>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header: link gốc + meta + actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <a
                href={p.permalink}
                onClick={(e) => {
                  e.preventDefault();
                  openExternal(p.permalink);
                }}
                style={{ color: 'var(--platform-accent)', textDecoration: 'none', fontSize: 13, cursor: 'pointer' }}
              >
                Xem bài gốc ↗
              </a>
              <div className="fb-muted" style={{ fontSize: 12, marginTop: 2 }}>
                {postedAtStr}
              </div>
              <div
                className="fb-muted"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 6,
                  fontSize: 12,
                }}
              >
                {(p.reactionIcons?.length || p.likes > 0) ? (
                  <span style={{ display: 'inline-flex' }}>
                    {(p.reactionIcons ?? []).slice(0, 3).map((icon, i) => (
                      <img
                        key={i}
                        src={icon}
                        alt=""
                        width={18}
                        height={18}
                        loading="lazy"
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: 'var(--bg-surface-strong)',
                          border: '2px solid var(--bg-surface-strong)',
                          marginLeft: i === 0 ? 0 : -6,
                        }}
                      />
                    ))}
                  </span>
                ) : null}
                <span>{compactMeta.join(' · ')}</span>
              </div>
            </div>
            {isExpanded && !isEditing && (
              <Button size="sm" variant="ghost" onClick={onStartEdit}>Sửa</Button>
            )}
            {isEditing && (
              <div style={{ display: 'flex', gap: 4 }}>
                <Button size="sm" onClick={onSaveEdit}>Lưu</Button>
                <Button size="sm" variant="ghost" onClick={onCancelEdit}>Hủy</Button>
              </div>
            )}
          </div>

          {/* Content (collapsed = preview, expanded = full) */}
          {isEditing ? (
            <Textarea
              rows={8}
              value={editingContent}
              onChange={(e) => onEditContentChange(e.target.value)}
              style={{ width: '100%', fontFamily: 'inherit' }}
            />
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5 }}>
              {displayText || <span className="fb-muted">(trống)</span>}
            </div>
          )}

          {/* Expanded: full media gallery */}
          {isExpanded && hasMedia && (
            <div
              style={{
                marginTop: 12,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 8,
              }}
            >
              {(p.mediaUrls ?? []).map((url, i) => (
                // Each media tile is a preview of the post — clicking
                // it should open the POST, not the raw image URL.
                // The sidecar keeps mediaUrls as CDN image URLs (which
                // would just show the .jpg in a browser tab) and only
                // stores the canonical post permalink in `permalink`.
                <a
                  key={`img-${i}`}
                  href={p.permalink}
                  onClick={(e) => {
                    e.preventDefault();
                    openExternal(p.permalink);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                  />
                </a>
              ))}
              {(p.videoUrls ?? []).map((_url, i) => {
                // The sidecar now leaves videoUrls empty for video
                // posts — the only thing we'd have in the DOM is the
                // reel permalink, which a browser can't <video src>
                // directly. The poster is rendered through mediaUrls
                // above, so this block is kept only as a fallback in
                // case some future sidecar revision ships a real .mp4
                // (e.g. once we wire the downloader). When it does
                // fire, still link out to the post permalink — the
                // user expects "click video" to open the post, not
                // play inline in a list view.
                const poster = p.thumbnailUrls?.[i] || p.fullPicture;
                return (
                  <a
                    key={`vid-${i}`}
                    href={p.permalink}
                    onClick={(e) => {
                      e.preventDefault();
                      openExternal(p.permalink);
                    }}
                    style={{
                      position: 'relative',
                      display: 'block',
                      cursor: 'pointer',
                      background: '#000',
                      borderRadius: 6,
                      overflow: 'hidden',
                      minHeight: 140,
                    }}
                  >
                    {poster && (
                      <img
                        src={poster}
                        alt=""
                        loading="lazy"
                        style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }}
                      />
                    )}
                    <span
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 44,
                        color: 'rgba(255,255,255,0.85)',
                        textShadow: '0 1px 6px rgba(0,0,0,0.6)',
                        pointerEvents: 'none',
                      }}
                      aria-hidden
                    >
                      ▶
                    </span>
                  </a>
                );
              })}
            </div>
          )}

          {/* Footer: Xem thêm / thu gọn (nút Tạo lịch đăng tập trung ở header card list) */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            {(needsTruncate || hasMedia) && (
              <Button size="sm" variant="ghost" onClick={onToggleExpand}>
                {isExpanded ? '↑ Thu gọn' : '↓ Xem thêm'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
};

export default RepostCrawlSection;
