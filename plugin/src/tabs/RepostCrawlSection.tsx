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
import { Button, Card, FormField, Input, Modal, Textarea, useToast } from '../components';
import { fbFetch } from '../lib/api';
import { openExternal } from '../lib/external';
import type { FBAccount, CrawledPostReal } from '../lib/types';
import { useBrainIngest } from '../hooks/useBrainIngest';
import { useFBAccounts, createAccount, pollAccountLoginStatus } from '../hooks/useRepost';

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

export const RepostCrawlSection: React.FC<Props> = ({ groups, onSchedule, onOpenBrainFeed }) => {
  // Hardcoded newsfeed URL — Phase 2 user request: "không dùng crawler,
  // cứng hiển thị facebook.com làm crawl newsfeed". Declared FIRST so
  // every useMemo / handler closure below can capture it without
  // tripping the temporal dead zone (TDZ) at first render.
  const NEWSFEED_URL = 'https://www.facebook.com/';

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

  // "Thêm tài khoản Facebook" — credentials-first. User nhập name + email +
  // password; backend tạo row rồi forward password cho sidecar tự mở browser
  // ở chế độ visible, điền form login, chờ user xác minh 2FA/checkpoint.
  // Password KHÔNG bao giờ được persist xuống DB.
  const { data: fbAccounts, reload: reloadAccounts } = useFBAccounts();
  // Auto-pick first kit-account for the "Tài khoản crawler" dropdown so
  // the user has a sensible default once the kit list loads.
  React.useEffect(() => {
    if (!selectedSourceId && fbAccounts && fbAccounts.length > 0) {
      setSelectedSourceId(fbAccounts[fbAccounts.length - 1].name);
    }
  }, [fbAccounts, selectedSourceId]);
  const [accModalOpen, setAccModalOpen] = React.useState(false);
  // 2-step "Thêm tài khoản" UX: chỉ cần đặt tên, hệ thống tự mở browser
  // FB login. Email/password/cookies JSON vẫn optional — bấm "Nâng cao"
  // để bung ra. Tên mặc định acc-NNN+1 lấy từ tài khoản hiện có.
  const [accForm, setAccForm] = React.useState({
    name: '',
    profilePath: '',
    email: '',
    password: '',
    cookiesJson: '',
  });
  const [accShowAdvanced, setAccShowAdvanced] = React.useState(false);
  const [accSubmitting, setAccSubmitting] = React.useState(false);
  const [accLoginStatus, setAccLoginStatus] = React.useState<string>('');
  const [accLoginErr, setAccLoginErr] = React.useState<string>('');

  // Tên mặc định cho account mới: acc-NNN+1 với N = max trong tên acc-NNN hiện có.
  const defaultAccName = React.useMemo(() => {
    let max = 0;
    for (const a of fbAccounts ?? []) {
      const m = /^acc-(\d+)$/.exec(a.name ?? '');
      if (m) {
        const v = parseInt(m[1], 10);
        if (Number.isFinite(v) && v > max) max = v;
      }
    }
    return `acc-${(max + 1).toString().padStart(3, '0')}`;
  }, [fbAccounts]);

  // Auto-fill name + slug khi mở modal lần đầu.
  React.useEffect(() => {
    if (accModalOpen && !accForm.name) {
      setAccForm((s) => ({
        ...s,
        name: defaultAccName,
        profilePath: s.profilePath || `~/.mdp/facebook/profiles/${defaultAccName}`,
      }));
    }
  }, [accModalOpen, defaultAccName, accForm.name]);

  // Auto-fill profile path slug từ name lần đầu name được set (nếu user chưa sửa).
  React.useEffect(() => {
    if (!accForm.profilePath && accForm.name) {
      const slug = accForm.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (slug) setAccForm((s) => ({ ...s, profilePath: `~/.mdp/facebook/profiles/${slug}` }));
    }
  }, [accForm.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const pollAndClose = React.useCallback(
    async (sessionId: string, onSuccess: () => void) => {
      setAccLoginStatus('Đang chờ đăng nhập trong trình duyệt…');
      for (let i = 0; i < 300; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const s = await pollAccountLoginStatus(sessionId);
          setAccLoginStatus(
            s.status === 'completed'
              ? 'Đăng nhập thành công'
              : s.status === 'failed'
              ? 'Đăng nhập thất bại'
              : s.status === 'running'
              ? 'Đang chờ bạn xác minh (2FA / checkpoint) trong trình duyệt…'
              : s.status
          );
          if (s.status === 'completed') {
            onSuccess();
            return;
          }
          if (s.status === 'failed' || s.status === 'expired') {
            setAccLoginErr(s.lastError || s.status);
            return;
          }
        } catch {
          // transient — keep polling
        }
      }
    },
    []
  );

  const handleAddAccount = async () => {
    setAccSubmitting(true);
    setAccLoginErr('');
    setAccLoginStatus('');
    try {
      const out = await createAccount({
        name: accForm.name,
        profilePath: accForm.profilePath,
        email: accForm.email || undefined,
        cookiesJson: accForm.cookiesJson || undefined,
        password: accForm.password || undefined,
      });
      reloadAccounts();
      if (out.sessionId) {
        await pollAndClose(out.sessionId, () => {
          // Re-fetch the account list once login completes so the
          // dropdown shows the freshly-persisted appState (healthStatus,
          // lastUsedAt) — not the "pending" stub from create-time.
          reloadAccounts();
          setAccModalOpen(false);
          setAccForm({ name: '', profilePath: '', email: '', password: '', cookiesJson: '' });
          toast.success(`Đã tạo và đăng nhập "${accForm.name}"`);
        });
      } else {
        setAccModalOpen(false);
        setAccForm({ name: '', profilePath: '', email: '', password: '', cookiesJson: '' });
        if (out.loginErr) {
          toast.warning(`Đã tạo tài khoản nhưng đăng nhập thất bại: ${out.loginErr}`);
        } else {
          toast.success(`Đã tạo tài khoản "${accForm.name}"`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAccLoginErr(msg);
      toast.error(`Lỗi tạo tài khoản: ${msg}`);
    } finally {
      setAccSubmitting(false);
    }
  };

  const closeAccModal = () => {
    if (accSubmitting) return;
    setAccModalOpen(false);
    setAccLoginErr('');
    setAccLoginStatus('');
    setAccForm({ name: '', profilePath: '', email: '', password: '', cookiesJson: '' });
    setAccShowAdvanced(false);
  };

  React.useEffect(() => {
    if (!selectedAccountId && fbAccounts.length > 0) {
      setSelectedAccountId(fbAccounts[fbAccounts.length - 1].id);
    }
  }, [fbAccounts, selectedAccountId]);

  const selectedAccount = React.useMemo(() => {
    return fbAccounts.find((account) => account.id === selectedAccountId) ?? fbAccounts[fbAccounts.length - 1] ?? null;
  }, [fbAccounts, selectedAccountId]);

  /**
   * Push freshly crawled posts to Brain. Always-on per the T13 plan
   * (D7: no toggle). Failures are surfaced as a toast but never abort
   * the crawl flow — the user already has the posts on screen.
   *
   * The currently-selected kit account's UUID is forwarded so the
   * resulting brain_feed rows and brain MCP ingest both carry the
   * `account_id` scope. Empty UUID keeps the legacy "default" scope
   * (e.g. when the user has not picked a kit account yet).
   */
  const autoIngestPosts = React.useCallback(
    async (toIngest: CrawledPost[]) => {
      if (toIngest.length === 0) {
        setLastIngestedCount(0);
        return;
      }
      const accountUUID = selectedAccount?.uuid ?? '';
      try {
        const res = await ingest({
          req: {
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
          },
          accountId: accountUUID,
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
    [ingest, toast, selectedAccount],
  );

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
  // mode it's a free URL. In 'account' mode (kit-accounts) it's the
  // hardcoded newsfeed URL — the selected kit-account is who fetches
  // it, not where they fetch from.
  const effectiveTarget = React.useMemo(() => {
    if (crawlMode === 'account') {
      return NEWSFEED_URL;
    }
    return pageUrl.trim();
  }, [crawlMode, pageUrl]);

  const handleCrawl = async () => {
    if (!effectiveTarget) {
      toast.warning(
        crawlMode === 'page'
          ? 'Nhập URL trang Facebook trước'
          : 'Chọn 1 tài khoản Facebook trước'
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
        // Phase 2: account mode hits the Go backend's /crawl endpoint
        // directly with the selected kit-account's name. The backend
        // proxies to the Playwright sidecar which uses the kit-account's
        // persisted profile (~/.mdp/facebook/profiles/<name>/) for
        // cookies. We DO NOT depend on mdp-crawler for the crawl.
        const raw = await fbFetch<CrawledPostReal[] | { data?: CrawledPostReal[]; error?: string }>(
          'crawl',
          {
            method: 'POST',
            body: {
              pageUrl: NEWSFEED_URL,
              pageId: selectedSourceId,
              limit: maxPosts,
            },
          },
        );
        if (raw && typeof raw === 'object' && 'error' in raw && (raw as { error?: string }).error) {
          throw new Error((raw as { error: string }).error);
        }
        const list = Array.isArray(raw) ? raw : raw?.data ?? [];
        data = list.map((t: CrawledPostReal) => ({
          id: String(t.id ?? t.fbPostId ?? crypto.randomUUID()),
          pageId: selectedSourceId,
          content: String(t.content ?? ''),
          fullContent: String(t.content ?? ''),
          mediaUrls: t.mediaUrls ?? [],
          videoUrls: [],
          mediaType: (t.mediaType as 'text' | 'photo' | 'video' | 'link') ?? 'text',
          likes: Number(t.likes ?? 0),
          comments: Number(t.comments ?? 0),
          shares: Number(t.shares ?? 0),
          postedAt: String(t.postedAt ?? ''),
          permalink: String(t.permalink ?? ''),
        }));
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
          : 'Chọn 1 tài khoản Facebook trước'
      );
      return;
    }
    setLoading(true);
    try {
      let data: CrawledPost[];
      if (crawlMode === 'account') {
        // Phase 2: same path as handleCrawl — kit-account + newsfeed.
        const raw = await fbFetch<CrawledPostReal[] | { data?: CrawledPostReal[]; error?: string }>(
          'crawl',
          {
            method: 'POST',
            body: {
              pageUrl: NEWSFEED_URL,
              pageId: selectedSourceId,
              limit: maxPosts,
            },
          },
        );
        if (raw && typeof raw === 'object' && 'error' in raw && (raw as { error?: string }).error) {
          throw new Error((raw as { error: string }).error);
        }
        const list = Array.isArray(raw) ? raw : raw?.data ?? [];
        data = list.map((t: CrawledPostReal) => ({
          id: String(t.id ?? t.fbPostId ?? crypto.randomUUID()),
          pageId: selectedSourceId,
          content: String(t.content ?? ''),
          fullContent: String(t.content ?? ''),
          mediaUrls: t.mediaUrls ?? [],
          videoUrls: [],
          mediaType: (t.mediaType as 'text' | 'photo' | 'video' | 'link') ?? 'text',
          likes: Number(t.likes ?? 0),
          comments: Number(t.comments ?? 0),
          shares: Number(t.shares ?? 0),
          postedAt: String(t.postedAt ?? ''),
          permalink: String(t.permalink ?? ''),
        }));
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
            ? `Đã thu thập ${data.length} bài từ tài khoản "${selectedSourceId}"`
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
    if (!fbAccounts.length || !groups.length) {
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
  //
  // Phase 2: account mode now uses kit-accounts (~/mdp-data/accounts/)
  // instead of mdp-crawler sources. The only requirement is that the
  // user has selected a kit-account — there's no CDP / launch /
  // network probe gating the "Thu thập" button.
  const accountModeChecks = React.useMemo(() => {
    const checks: { ok: boolean; msg: string }[] = [];
    if (crawlMode !== 'account') return checks;
    if (fbAccounts === undefined) {
      checks.push({ ok: false, msg: 'Đang tải danh sách tài khoản…' });
      return checks;
    }
    if (!selectedSourceId) {
      checks.push({ ok: false, msg: 'Chưa chọn tài khoản' });
    } else {
      checks.push({ ok: true, msg: `Đang dùng tài khoản "${selectedSourceId}"` });
    }
    return checks;
  }, [crawlMode, fbAccounts, selectedSourceId]);

  const accountModeReady = accountModeChecks.every((c) => c.ok);

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
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              {/* Source picker (mdp-crawler YAML). Render-mode badges go
                  inside each <option> so the dropdown stays self-explanatory. */}
              <FormField
                label={
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span>Tài khoản crawler</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setAccModalOpen(true)}
                      data-testid="open-add-account"
                    >
                      + Thêm tài khoản
                    </Button>
                  </span>
                }
              >
                <select
                  value={selectedSourceId}
                  onChange={(e) => setSelectedSourceId(e.target.value)}
                  disabled={fbAccounts === undefined}
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
                  {/* Phase 2: list kit-accounts (~/mdp-data/accounts/) instead
                      of mdp-crawler sources. The kit-accounts backend lives
                      at /api/v1/facebook/kit-accounts and returns
                      {accounts: [{name, platform, status, ...}]}.
                      This is the source of truth for "Tài khoản của tôi"
                      so users see accounts they've actually logged into
                      via the kit-accounts login flow. */}
                  {fbAccounts === undefined && <option value="">Đang tải…</option>}
                  {fbAccounts !== undefined && fbAccounts.length === 0 && (
                    <option value="">Chưa có tài khoản — bấm "+ Thêm tài khoản"</option>
                  )}
                  {fbAccounts !== undefined && fbAccounts.length > 0 && (
                    <>
                      <option value="">— chọn —</option>
                      {fbAccounts.map((acc) => (
                        <option key={acc.id} value={acc.name}>
                          {acc.name}
                          {acc.status ? ` · ${acc.status}` : ''}
                          {acc.lastUsedAt
                            ? ` · dùng ${new Date(acc.lastUsedAt).toLocaleDateString('vi-VN')}`
                            : ''}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {selectedSourceId && (
                  <div className="fb-muted" style={{ fontSize: 11, marginTop: 4 }}>
                    {fbAccounts?.find((a) => a.name === selectedSourceId)?.profilePath ?? ''}
                  </div>
                )}
              </FormField>
            </div>
          )}
          {/* Filter row + action buttons in a single line on wide screens. */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'flex-end',
            }}
          >
            <div style={{ width: 110, flexShrink: 0 }}>
              <FormField label="Số bài">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={String(maxPosts)}
                  onChange={(e) => setMaxPosts(Math.max(1, Number(e.target.value) || 10))}
                />
              </FormField>
            </div>
            <div style={{ width: 150, flexShrink: 0 }}>
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
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <Button
                onClick={handleCrawlAll}
                disabled={loading || !accountModeReady}
                variant="ghost"
                title="Bỏ lọc ngày — lấy N bài mới nhất không giới hạn"
              >
                Tải lại tất cả
              </Button>
              <Button
                onClick={handleCrawl}
                disabled={loading || !accountModeReady}
                title={!accountModeReady && crawlMode === 'account' ? 'Thiếu điều kiện tiên quyết — xem cảnh báo bên dưới' : undefined}
              >
                {loading ? 'Đang thu thập…' : 'Thu thập'}
              </Button>
            </div>
          </div>
          {/* Compact warning row — only when account mode is missing a
              prerequisite. One row per failing condition so the user
              can see exactly which check is blocking the button. The
              CDP row also gets a manual "Khởi động Chrome" button so
              the user doesn't have to wait for the 30s auto-launch
              poll to clear it. */}
          {crawlMode === 'account' && !accountModeReady && (
            <div
              data-testid="crawl-account-warning"
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--ds-warning-border, #d4a017)',
                fontSize: 12,
                color: 'var(--text-primary)',
                lineHeight: 1.6,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span><strong>⚠ Cần:</strong></span>
              {accountModeChecks.map((c, i) => (
                <span
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    opacity: c.ok ? 0.55 : 1,
                  }}
                >
                  <span style={{ width: 14 }}>{c.ok ? '✓' : '✗'}</span>
                  <span style={{ flex: 1 }}>{c.msg}</span>
                </span>
              ))}
            </div>
          )}
          <p className="fb-muted" style={{ fontSize: 12, margin: 0 }}>
            Để trống "Từ ngày" để lấy đúng N bài đầu feed từ trên xuống. Nếu kết quả lệch,
            thử đổi <strong>Tài khoản đăng</strong> sang profile đã login đúng Facebook.
            Bấm <strong>"Tải lại tất cả"</strong> để chủ động bỏ qua bộ lọc ngày.
          </p>
        </div>
      </Card>

      {/* Modal "Thêm tài khoản Facebook" — credentials-first. Sidecar tự
          mở Chrome ở chế độ visible, điền email + password, và chờ user xác
          minh 2FA/checkpoint nếu cần. Password KHÔNG bao giờ được lưu DB. */}
      <Modal
        open={accModalOpen}
        onClose={closeAccModal}
        title="Thêm tài khoản Facebook"
        footer={
          <>
            <Button variant="ghost" onClick={closeAccModal} disabled={accSubmitting}>
              Hủy
            </Button>
            <Button
              onClick={handleAddAccount}
              disabled={accSubmitting || !accForm.name}
            >
              {accSubmitting ? 'Đang mở trình duyệt…' : 'Thêm + mở trình duyệt đăng nhập'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormField label="Tên hiển thị" required>
            <Input
              value={accForm.name}
              onChange={(e) => setAccForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="vd: Nguyễn Văn A"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !accSubmitting) void handleAddAccount();
              }}
            />
          </FormField>
          {/* Profile path is fixed — derived from the account name. Show it
              as a muted caption so the user can confirm the on-disk path
              before pressing the action button. Not editable. */}
          <p
            className="fb-muted"
            style={{ fontSize: 12, margin: 0, fontFamily: 'var(--ds-font-mono, monospace)' }}
            data-testid="acc-profile-path-hint"
          >
            Profile: {accForm.profilePath || `~/.mdp/facebook/profiles/${accForm.name}`}
          </p>
          <p className="fb-muted" style={{ fontSize: 12, margin: 0 }}>
            Bấm <strong>Thêm + mở trình duyệt đăng nhập</strong> để hệ thống tự
            mở Chrome ở chế độ hiện, điền email + mật khẩu rồi chờ bạn xác
            minh 2FA / checkpoint nếu Facebook yêu cầu.
          </p>
          <button
            type="button"
            onClick={() => setAccShowAdvanced((v) => !v)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'var(--ds-info, #4a7fcb)',
              cursor: 'pointer',
              fontSize: 12,
              alignSelf: 'flex-start',
            }}
            data-testid="acc-advanced-toggle"
          >
            {accShowAdvanced ? '▾ Ẩn tùy chọn nâng cao' : '▸ Tùy chọn nâng cao (email + mật khẩu / cookies)'}
          </button>
          {accShowAdvanced && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FormField label="Email / SĐT đăng nhập">
                <Input
                  type="email"
                  value={accForm.email}
                  onChange={(e) => setAccForm((s) => ({ ...s, email: e.target.value }))}
                  placeholder="email hoặc số điện thoại"
                />
              </FormField>
              <FormField
                label="Mật khẩu"
                hint="Chỉ dùng để đăng nhập 1 lần — không lưu lại"
              >
                <Input
                  type="password"
                  value={accForm.password}
                  onChange={(e) => setAccForm((s) => ({ ...s, password: e.target.value }))}
                  placeholder="Mật khẩu Facebook"
                />
              </FormField>
              <FormField label="Cookies JSON" hint="Dán từ extension để bỏ qua đăng nhập">
                <Textarea
                  value={accForm.cookiesJson}
                  onChange={(e) => setAccForm((s) => ({ ...s, cookiesJson: e.target.value }))}
                  rows={3}
                  placeholder='[{"name": "c_user", "value": "...", "domain": ".facebook.com"}, ...]'
                />
              </FormField>
            </div>
          )}
          {accLoginStatus && (
            <div
              data-testid="acc-login-status"
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--ds-info-border, #4a7fcb)',
                fontSize: 13,
              }}
            >
              {accLoginStatus}
            </div>
          )}
          {accLoginErr && (
            <div
              data-testid="acc-login-err"
              role="alert"
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--ds-error-border, #c0392b)',
                fontSize: 13,
                color: 'var(--ds-error, #c0392b)',
              }}
            >
              {accLoginErr}
            </div>
          )}
        </div>
      </Modal>

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
