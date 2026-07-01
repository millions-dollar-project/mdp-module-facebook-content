import React from 'react';
import { PageHeader, Tabs, Button, DataTable, Modal, Input, Textarea, Select, Badge, useToast } from '../components';
import {
  useRepostCampaigns,
  useRepostJobs,
  useFBAccounts,
  useFBGroups,
  createCampaign,
  runCampaign,
  createAccount,
  pollAccountLoginStatus,
  persistAccountLogin,
  deleteFBAccount,
  deleteFBGroup,
  deleteRepostCampaign,
  createGroupFromUrl,
  generateKlingImages,
  generateKlingVideos,
} from '../hooks';
import type { RepostCampaign, FBAccount, FBGroup } from '../lib/types';
import { AccountLoginDialog } from './AccountLoginDialog';
import { PublishView } from './PublishView';
import { RepostCrawlSection } from './RepostCrawlSection';

type Mode = 'campaigns' | 'accounts' | 'groups' | 'crawl' | 'publish' | 'kling';

// Sub-tabs hiện trong header của tab "Đăng lại" (repost). Hai mode
// 'accounts' và 'groups' vẫn tồn tại trong type vì RepostTab còn được
// mount với defaultMode="accounts"/"groups" từ sidebar "Quản lý" —
// nhưng chúng không hiện trên thanh sub-tabs của "Đăng lại" nữa.
const MODES: { id: Mode; label: string }[] = [
  { id: 'crawl', label: 'Crawl' },
  { id: 'publish', label: 'Đăng nhóm' },
];

// Title/subtitle theo mode. Khi `hideSubTabs=true` (mount từ sidebar
// "Quản lý" cho Tài khoản/Nhóm), ta dùng meta riêng cho mode đó
// thay vì "Đăng lại (Repost)".
const MODE_META: Record<Mode, { title: string; subtitle: string }> = {
  crawl: { title: 'Đăng lại (Repost)', subtitle: 'Crawl bài viết, tạo chiến dịch đăng nhóm với caption spin tự động' },
  publish: { title: 'Đăng lại (Repost)', subtitle: 'Hàng chờ đăng bài theo tài khoản' },
  campaigns: { title: 'Đăng lại (Repost)', subtitle: 'Quản lý chiến dịch repost' },
  kling: { title: 'Đăng lại (Repost)', subtitle: 'Tạo ảnh / video bằng Kling AI' },
  accounts: { title: 'Tài khoản Facebook', subtitle: 'Quản lý tài khoản đăng nhập' },
  groups: { title: 'Nhóm Facebook', subtitle: 'Quản lý nhóm để đăng bài' },
};

const statusBadge = (status: string) => {
  const map: Record<string, { tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'hot' | 'warm' | 'cold' | 'positive'; label: string }> = {
    pending: { tone: 'neutral', label: 'Chờ' },
    running: { tone: 'brand', label: 'Đang chạy' },
    completed: { tone: 'success', label: 'Hoàn tất' },
    failed: { tone: 'danger', label: 'Lỗi' },
    expired: { tone: 'neutral', label: 'Hết hạn' },
    active: { tone: 'brand', label: 'Hoạt động' },
    paused: { tone: 'neutral', label: 'Tạm dừng' },
  };
  const s = map[status] ?? { tone: 'neutral', label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
};

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString('vi-VN') : '—');

export const RepostTab: React.FC<{ defaultMode?: Mode; hideSubTabs?: boolean }> = ({
  defaultMode = 'crawl',
  hideSubTabs = false,
}) => {
  const [mode, setMode] = React.useState<Mode>(defaultMode);
  const toast = useToast();

  // Bulk-select mirror per mode — the DataTable owns the checkbox
  // UI state, but we keep a copy here so the section bar can render
  // the bulk-action chip in its top-right corner (opposite the
  // "+ Thêm" button) and the per-mode confirm modal can show the
  // right count and warning copy.
  const [selectedByMode, setSelectedByMode] = React.useState<Record<Mode, string[]>>({
    campaigns: [],
    accounts: [],
    groups: [],
    crawl: [],
    publish: [],
    kling: [],
  });
  const [confirmMode, setConfirmMode] = React.useState<Mode | null>(null);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);

  // Kling AI
  const [klingPrompt, setKlingPrompt] = React.useState('');
  const [klingCount, setKlingCount] = React.useState(1);
  const [klingLoading, setKlingLoading] = React.useState<'idle' | 'image' | 'video'>('idle');
  const [klingResults, setKlingResults] = React.useState<string[]>([]);

  const handleKlingImages = async () => {
    if (!klingPrompt.trim()) return;
    try {
      setKlingLoading('image');
      toast.info('Đang tạo hình Kling…');
      const res = await generateKlingImages({ prompt: klingPrompt, count: klingCount });
      setKlingResults(res.paths);
      toast.success(`Đã tạo ${res.paths.length} hình`);
    } catch (err) {
      toast.error(`Lỗi Kling: ${(err as Error).message}`);
    } finally {
      setKlingLoading('idle');
    }
  };

  const handleKlingVideos = async () => {
    if (!klingPrompt.trim()) return;
    try {
      setKlingLoading('video');
      toast.info('Đang tạo video Kling…');
      const res = await generateKlingVideos({ prompt: klingPrompt, count: klingCount });
      setKlingResults(res.paths);
      toast.success(`Đã tạo ${res.paths.length} video`);
    } catch (err) {
      toast.error(`Lỗi Kling: ${(err as Error).message}`);
    } finally {
      setKlingLoading('idle');
    }
  };

  // Campaigns
  const { data: campaigns, reload: reloadCampaigns } = useRepostCampaigns();
  const [campModal, setCampModal] = React.useState(false);
  const [jobsModal, setJobsModal] = React.useState(false);
  const [viewJobsCampaignId, setViewJobsCampaignId] = React.useState<string | null>(null);
  const { data: jobsForCampaign } = useRepostJobs(viewJobsCampaignId);
  const [campForm, setCampForm] = React.useState({
    name: '',
    sourcePostUrl: '',
    sourcePostText: '',
    mediaUrls: '',
    captionStyle: '',
    scheduledAt: '',
  });

  const handleCreateCampaign = async () => {
    try {
      toast.info('Đang tạo chiến dịch…');
      await createCampaign({
        name: campForm.name,
        sourcePostUrl: campForm.sourcePostUrl,
        sourcePostText: campForm.sourcePostText,
        mediaUrls: campForm.mediaUrls.split('\n').map((s) => s.trim()).filter(Boolean),
        captionStyle: campForm.captionStyle,
        scheduledAt: campForm.scheduledAt ? new Date(campForm.scheduledAt).toISOString() : new Date().toISOString(),
      });
      setCampModal(false);
      setCampForm({ name: '', sourcePostUrl: '', sourcePostText: '', mediaUrls: '', captionStyle: '', scheduledAt: '' });
      reloadCampaigns();
      toast.success('Đã tạo chiến dịch');
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  const handleRunCampaign = async (id: string) => {
    try {
      toast.info('Đang chạy chiến dịch…');
      await runCampaign(id);
      reloadCampaigns();
      toast.success('Chiến dịch đã chạy xong');
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  // Bulk-delete with partial-failure handling. We use Promise.allSettled
  // so a single 5xx doesn't take down the rest of the batch, then we
  // report both successes and failures in a single toast. Reads ids
  // from the per-mode selection mirror that the section bar's
  // bulk-action chip maintains via DataTable.onSelectionChange.
  const handleBulkDeleteCampaigns = async () => {
    const ids = selectedByMode.campaigns;
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => deleteRepostCampaign(id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = ids.length - ok;
      if (ok) toast.success(`Đã xoá ${ok}/${ids.length} chiến dịch`);
      if (failed) {
        const errs = results
          .filter((r) => r.status === 'rejected')
          .map((r) => (r as PromiseRejectedResult).reason?.message ?? 'unknown')
          .join('; ');
        toast.error(`${failed} lỗi: ${errs}`);
      }
      setSelectedByMode((s) => ({
        ...s,
        campaigns: ids.filter((_, i) => results[i].status === 'rejected'),
      }));
      reloadCampaigns();
    } finally {
      setBulkDeleting(false);
      setConfirmMode(null);
    }
  };

  const handleBulkDeleteAccounts = async () => {
    const ids = selectedByMode.accounts;
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => deleteFBAccount(id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = ids.length - ok;
      if (ok) toast.success(`Đã xoá ${ok}/${ids.length} tài khoản`);
      if (failed) {
        const errs = results
          .filter((r) => r.status === 'rejected')
          .map((r) => (r as PromiseRejectedResult).reason?.message ?? 'unknown')
          .join('; ');
        toast.error(`${failed} lỗi: ${errs}`);
      }
      setSelectedByMode((s) => ({
        ...s,
        accounts: ids.filter((_, i) => results[i].status === 'rejected'),
      }));
      reloadAccounts();
    } finally {
      setBulkDeleting(false);
      setConfirmMode(null);
    }
  };

  const handleBulkDeleteGroups = async () => {
    const ids = selectedByMode.groups;
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => deleteFBGroup(id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = ids.length - ok;
      if (ok) toast.success(`Đã xoá ${ok}/${ids.length} nhóm`);
      if (failed) {
        const errs = results
          .filter((r) => r.status === 'rejected')
          .map((r) => (r as PromiseRejectedResult).reason?.message ?? 'unknown')
          .join('; ');
        toast.error(`${failed} lỗi: ${errs}`);
      }
      setSelectedByMode((s) => ({
        ...s,
        groups: ids.filter((_, i) => results[i].status === 'rejected'),
      }));
      reloadGroups();
    } finally {
      setBulkDeleting(false);
      setConfirmMode(null);
    }
  };

  // Accounts — click-to-login flow, no form.
  //   Clicking "+ Thêm tài khoản" auto-generates a display name and
  //   a unique profile path, creates the account row, and asks the
  //   sidecar to open a visible Playwright browser at
  //   facebook.com/login. The user types their password and clears
  //   2FA / checkpoint in the browser themselves — the password
  //   never crosses the plugin or backend.
  //
  //   (The backend still accepts an optional `password` field on
  //   POST /fb-accounts for forward-compat — covered by
  //   TestSidecar_StartAccountLogin_ForwardsPassword. The current
  //   UI just doesn't expose it.)
  const { data: accounts, reload: reloadAccounts } = useFBAccounts();
  const [addingAccount, setAddingAccount] = React.useState(false);

  const pollLogin = React.useCallback(
    async (sessionId: string): Promise<{ ok: boolean; lastError?: string }> => {
      for (let i = 0; i < 300; i++) {
        // poll up to 10 minutes
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const s = await pollAccountLoginStatus(sessionId);
          if (s.status === 'completed') return { ok: true };
          if (s.status === 'failed' || s.status === 'expired') {
            return { ok: false, lastError: s.lastError || s.status };
          }
        } catch (e) {
          // transient — keep polling
        }
      }
      return { ok: false, lastError: 'timeout' };
    },
    []
  );

  const handleAddAccount = async () => {
    if (addingAccount) return;
    setAddingAccount(true);
    // Generate a friendly, unique display name. Accounts can be
    // renamed later via the actions column (TODO: add rename).
    const idx = (accounts?.length ?? 0) + 1;
    const ts = Date.now();
    const name = `Tài khoản ${idx}`;
    const profilePath = `~/.mdp/facebook/profiles/account-${ts}`;
    toast.info(`Đang tạo "${name}" và mở trình duyệt để đăng nhập…`);
    try {
      // Backend contract: createAccount either succeeds and returns a
      // sessionId (sidecar launched the visible browser), or throws
      // (sidecar down → backend rolled the row back and returned 502).
      // We only reloadAccounts AFTER the user finishes logging in, so
      // a failed login never leaves a phantom row in the list.
      const out = await createAccount({ name, profilePath });
      if (!out.sessionId) {
        // Defensive: backend used to return { account, loginErr } for
        // sidecar failures. After the atomic-create fix it throws
        // instead, but if some caller still sees this shape we surface
        // the error and DO NOT reload (the row is already gone in DB).
        toast.warning(`Không mở được trình duyệt đăng nhập: ${out.loginErr ?? 'sidecar không phản hồi'}`);
        return;
      }
      toast.info('Đang chờ bạn đăng nhập trong trình duyệt hiện ra…');
      const r = await pollLogin(out.sessionId);
      if (r.ok) {
        // Defense in depth: the sidecar auto-persists inside _runLoginFlow
        // when the URL leaves /login, but that write can race with the
        // status flip (the plugin might see `completed` before the
        // fs.writeFileSync round-trip). Force a re-persist via the
        // explicit /login/persist route so the on-disk artifacts are
        // guaranteed present before we reload the list. Best-effort —
        // a failure here doesn't block the success toast because the
        // auto-persist path may have already succeeded.
        try {
          await persistAccountLogin(out.sessionId, name);
        } catch {
          // swallow — auto-persist likely already ran
        }
        reloadAccounts();
        toast.success(`"${name}" đã đăng nhập xong và sẵn sàng dùng`);
      } else {
        // Login was attempted but never completed (user closed
        // browser, 2FA timed out, etc.). Backend already has the row
        // because the sidecar session started — surface a hint to
        // retry via the row's "Đăng nhập" button rather than creating
        // a duplicate.
        reloadAccounts();
        toast.warning(`"${name}" chưa đăng nhập xong: ${r.lastError ?? 'timeout'} — bấm "Đăng nhập" trong danh sách để thử lại`);
      }
    } catch (err) {
      // Sidecar was down or rejected the request. Backend already
      // rolled the row back — do NOT reload, or we'd see a phantom
      // entry that the next refetch would silently remove (jarring).
      toast.error(`Lỗi: ${(err as Error).message}`);
    } finally {
      setAddingAccount(false);
    }
  };

  // Groups
  const { data: groups, reload: reloadGroups } = useFBGroups();
  const [grpModal, setGrpModal] = React.useState(false);
  const [grpForm, setGrpForm] = React.useState({ url: '', assignedAccountId: '' });
  const [grpSubmitting, setGrpSubmitting] = React.useState(false);

  const handleCreateGroup = async () => {
    const url = grpForm.url.trim();
    if (!url) return;
    setGrpSubmitting(true);
    try {
      toast.info('Đang trích xuất ID + tên nhóm từ link…');
      const created = await createGroupFromUrl({
        url,
        assignedAccountId: grpForm.assignedAccountId || undefined,
      });
      setGrpModal(false);
      setGrpForm({ url: '', assignedAccountId: '' });
      reloadGroups();
      toast.success(
        created.name
          ? `Đã thêm nhóm "${created.name}" (ID: ${created.groupId})`
          : `Đã thêm nhóm ID: ${created.groupId} (chưa lấy được tên — nhóm có thể ở chế độ riêng tư)`,
      );
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    } finally {
      setGrpSubmitting(false);
    }
  };

  // Crawl is handled entirely by <RepostCrawlSection /> (V2 form) — no state here.

  // V2 state — schedule flow moved to <SchedulePostModal> inside the
  // crawl section itself, so the legacy plan modal/planPost state is
  // gone. The legacy per-post `RepostPlanModal` is kept on disk for
  // any callers outside this file (none today).
  // When the user creates a schedule from the crawl section, remember
  // the first accountId they picked so <PublishView> can pre-select
  // that account's queue tab. Cleared after PublishView consumes it.
  const [pendingPublishAccountId, setPendingPublishAccountId] = React.useState<string | null>(null);
  const [loginAccount, setLoginAccount] = React.useState<FBAccount | null>(null);

  return (
    <div className="fb-tab fb-tab--repost">
      <PageHeader
        title={MODE_META[mode].title}
        subtitle={MODE_META[mode].subtitle}
        actions={hideSubTabs ? undefined : <Tabs<Mode> items={MODES} value={mode} onChange={setMode} size="sm" />}
      />

      {mode === 'campaigns' && (
        <>
          <div className="fb-section__bar">
            <Button onClick={() => setCampModal(true)}>+ Tạo chiến dịch</Button>
            {selectedByMode.campaigns.length > 0 && (
              <div className="fb-table__select-bar" role="region" aria-label="Bulk actions">
                <span className="fb-table__select-count">Đã chọn {selectedByMode.campaigns.length}</span>
                <div className="fb-table__select-actions">
                  <Button
                    variant="ghost"
                    onClick={() => setSelectedByMode((s) => ({ ...s, campaigns: [] }))}
                    disabled={bulkDeleting}
                  >
                    Bỏ chọn
                  </Button>
                  <Button variant="danger" onClick={() => setConfirmMode('campaigns')} disabled={bulkDeleting}>
                    Xóa ({selectedByMode.campaigns.length})
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DataTable<RepostCampaign>
            columns={[
              { key: 'name', header: 'Tên', render: (r) => r.name },
              { key: 'status', header: 'Trạng thái', render: (r) => statusBadge(r.status) },
              { key: 'scheduled', header: 'Lên lịch', render: (r) => fmtDate(r.scheduledAt) },
              { key: 'created', header: 'Tạo lúc', render: (r) => fmtDate(r.createdAt) },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (r) => (
                  <div className="fb-row-actions">
                    <Button size="sm" variant="ghost" onClick={() => { setViewJobsCampaignId(r.id); setJobsModal(true); }}>
                      Jobs
                    </Button>
                    {r.status === 'pending' && (
                      <Button size="sm" onClick={() => handleRunCampaign(r.id)}>
                        Chạy
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
            rows={campaigns}
            rowKey={(r) => r.id}
            onBulkDelete={async () => { await handleBulkDeleteCampaigns(); }}
            onSelectionChange={(ids) => setSelectedByMode((s) => ({ ...s, campaigns: ids as string[] }))}
          />
        </>
      )}

      {mode === 'accounts' && (
        <>
          <div className="fb-section__bar">
            <Button onClick={handleAddAccount} loading={addingAccount}>
              {addingAccount ? 'Đang mở trình duyệt…' : '+ Thêm tài khoản'}
            </Button>
            {selectedByMode.accounts.length > 0 && (
              <div className="fb-table__select-bar" role="region" aria-label="Bulk actions">
                <span className="fb-table__select-count">Đã chọn {selectedByMode.accounts.length}</span>
                <div className="fb-table__select-actions">
                  <Button
                    variant="ghost"
                    onClick={() => setSelectedByMode((s) => ({ ...s, accounts: [] }))}
                    disabled={bulkDeleting}
                  >
                    Bỏ chọn
                  </Button>
                  <Button variant="danger" onClick={() => setConfirmMode('accounts')} disabled={bulkDeleting}>
                    Xóa ({selectedByMode.accounts.length})
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DataTable<FBAccount>
            columns={[
              { key: 'name', header: 'Tên', render: (r) => r.name },
              { key: 'profile', header: 'Profile', render: (r) => <a href={r.profilePath} target="_blank" rel="noreferrer">Link</a> },
              { key: 'status', header: 'Trạng thái', render: (r) => statusBadge(r.status) },
              { key: 'lastUsed', header: 'Dùng lần cuối', render: (r) => fmtDate(r.lastUsedAt) },
            ]}
            rows={accounts}
            rowKey={(r) => r.id}
            onBulkDelete={async () => { await handleBulkDeleteAccounts(); }}
            onSelectionChange={(ids) => setSelectedByMode((s) => ({ ...s, accounts: ids as string[] }))}
          />
        </>
      )}

      {mode === 'groups' && (
        <>
          <div className="fb-section__bar">
            <Button onClick={() => setGrpModal(true)}>+ Thêm nhóm</Button>
            {selectedByMode.groups.length > 0 && (
              <div className="fb-table__select-bar" role="region" aria-label="Bulk actions">
                <span className="fb-table__select-count">Đã chọn {selectedByMode.groups.length}</span>
                <div className="fb-table__select-actions">
                  <Button
                    variant="ghost"
                    onClick={() => setSelectedByMode((s) => ({ ...s, groups: [] }))}
                    disabled={bulkDeleting}
                  >
                    Bỏ chọn
                  </Button>
                  <Button variant="danger" onClick={() => setConfirmMode('groups')} disabled={bulkDeleting}>
                    Xóa ({selectedByMode.groups.length})
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DataTable<FBGroup>
            columns={[
              { key: 'groupId', header: 'Group ID', render: (r) => r.groupId },
              { key: 'name', header: 'Tên', render: (r) => r.name ?? '—' },
              { key: 'status', header: 'Trạng thái', render: (r) => statusBadge(r.status) },
              { key: 'assigned', header: 'Tài khoản', render: (r) => r.assignedAccountId ?? '—' },
            ]}
            rows={groups}
            rowKey={(r) => r.id}
            onBulkDelete={async () => { await handleBulkDeleteGroups(); }}
            onSelectionChange={(ids) => setSelectedByMode((s) => ({ ...s, groups: ids as string[] }))}
          />
        </>
      )}

      {mode === 'crawl' && (
        <RepostCrawlSection
          accounts={accounts}
        />
      )}

      {mode === 'publish' && (
        <PublishView
          accounts={accounts}
          groups={groups}
          defaultAccountId={pendingPublishAccountId}
          onDefaultConsumed={() => setPendingPublishAccountId(null)}
        />
      )}

      {mode === 'kling' && (
        <>
          <div className="fb-section__bar" style={{ gap: 8, display: 'flex', flexDirection: 'column', maxWidth: 600 }}>
            <Textarea
              placeholder="Prompt mô tả hình ảnh / video…"
              value={klingPrompt}
              onChange={(e) => setKlingPrompt(e.target.value)}
              rows={3}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Số lượng
                <Input type="number" min={1} max={4} value={klingCount} onChange={(e) => setKlingCount(Number(e.target.value))} style={{ width: 60 }} />
              </label>
              <Button onClick={handleKlingImages} loading={klingLoading === 'image'}>🖼 Tạo hình</Button>
              <Button onClick={handleKlingVideos} loading={klingLoading === 'video'}>🎬 Tạo video</Button>
            </div>
          </div>
          {klingResults.length > 0 && (
            <div className="fb-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
              {klingResults.map((p, i) => (
                <div key={i} className="fb-card" style={{ padding: 8 }}>
                  <code className="fb-mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{p}</code>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Campaign modal */}
      <Modal
        open={campModal}
        onClose={() => setCampModal(false)}
        title="Tạo chiến dịch repost"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCampModal(false)}>Hủy</Button>
            <Button onClick={handleCreateCampaign}>Tạo</Button>
          </>
        }
      >
        <div className="fb-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            Tên chiến dịch
            <Input value={campForm.name} onChange={(e) => setCampForm((s) => ({ ...s, name: e.target.value }))} />
          </label>
          <label>
            Link bài gốc
            <Input value={campForm.sourcePostUrl} onChange={(e) => setCampForm((s) => ({ ...s, sourcePostUrl: e.target.value }))} />
          </label>
          <label>
            Nội dung gốc
            <Textarea value={campForm.sourcePostText} onChange={(e) => setCampForm((s) => ({ ...s, sourcePostText: e.target.value }))} rows={4} />
          </label>
          <label>
            Media URLs (mỗi dòng 1 link)
            <Textarea value={campForm.mediaUrls} onChange={(e) => setCampForm((s) => ({ ...s, mediaUrls: e.target.value }))} rows={3} />
          </label>
          <label>
            Phong cách caption spin
            <Input value={campForm.captionStyle} onChange={(e) => setCampForm((s) => ({ ...s, captionStyle: e.target.value }))} placeholder="vd: chuyên nghiệp, thân thiện, hài hước" />
          </label>
          <label>
            Lên lịch chạy
            <Input
              type="datetime-local"
              value={campForm.scheduledAt}
              onChange={(e) => setCampForm((s) => ({ ...s, scheduledAt: e.target.value }))}
            />
          </label>
        </div>
      </Modal>

      {/* Group modal — paste a link, server extracts id + name */}
      <Modal
        open={grpModal}
        onClose={() => setGrpModal(false)}
        title="Thêm nhóm Facebook"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGrpModal(false)}>Hủy</Button>
            <Button onClick={handleCreateGroup} disabled={!grpForm.url.trim() || grpSubmitting}>
              {grpSubmitting ? 'Đang trích xuất…' : 'Thêm'}
            </Button>
          </>
        }
      >
        <div className="fb-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            Link nhóm Facebook
            <Input
              value={grpForm.url}
              onChange={(e) => setGrpForm((s) => ({ ...s, url: e.target.value }))}
              placeholder="vd: https://www.facebook.com/groups/1234567890"
              autoFocus
            />
          </label>
          <p className="fb-muted" style={{ fontSize: 12, margin: 0 }}>
            Dán link nhóm bất kỳ (www.facebook.com/groups/&lt;id&gt; hoặc m.facebook.com). Hệ thống sẽ tự trích xuất
            ID số và tên nhóm. Nhóm riêng tư sẽ chỉ lấy được ID — bạn có thể vào "Phân công" để cập nhật tên sau.
          </p>
          <label>
            Tài khoản phụ trách (tuỳ chọn)
            <Select
              value={grpForm.assignedAccountId}
              onChange={(e) => setGrpForm((s) => ({ ...s, assignedAccountId: e.target.value }))}
              placeholder={accounts.length ? '— Chọn tài khoản —' : 'Chưa có tài khoản nào'}
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              disabled={!accounts.length}
            />
          </label>
          {!accounts.length && (
            <p className="fb-muted" style={{ fontSize: 12, margin: 0 }}>
              Chưa có tài khoản nào — hãy thêm tài khoản ở tab "Tài khoản" trước.
            </p>
          )}
        </div>
      </Modal>

      {/* Jobs modal */}
      <Modal
        open={jobsModal}
        onClose={() => setJobsModal(false)}
        title="Chi tiết jobs"
        footer={<Button variant="ghost" onClick={() => setJobsModal(false)}>Đóng</Button>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {jobsForCampaign.length === 0 && <p className="fb-muted">Không có job nào.</p>}
          {jobsForCampaign.map((j) => (
            <div key={j.id} className="fb-card" style={{ padding: 8 }}>
              <div className="fb-row-actions">
                <Badge tone={j.status === 'completed' ? 'success' : j.status === 'failed' ? 'danger' : 'neutral'}>{j.status}</Badge>
                <span className="fb-muted">{j.attempts} lần thử</span>
              </div>
              <p className="fb-mono" style={{ fontSize: 12 }}>Group: {j.groupId} · Account: {j.accountId}</p>
              {j.lastError && <p className="fb-danger" style={{ fontSize: 12 }}>Lỗi: {j.lastError}</p>}
              {j.postUrl && <a href={j.postUrl} target="_blank" rel="noreferrer" className="fb-link">Xem bài đăng</a>}
            </div>
          ))}
        </div>
      </Modal>

      {/* Plan modal (V2) — removed: the crawl section's
          <SchedulePostModal> now drives the schedule creation flow
          end-to-end. The legacy per-post <RepostPlanModal> lives on
          disk for callers outside this file. */}

      {/* Account login dialog (V2) */}
      {loginAccount && (
        <AccountLoginDialog
          open={!!loginAccount}
          onClose={() => setLoginAccount(null)}
          profilePath={loginAccount.profilePath}
          email={loginAccount.email ?? undefined}
          accountName={loginAccount.name}
          onSuccess={() => reloadAccounts()}
        />
      )}

      {/* Bulk-delete confirm dialogs — one per mode that supports it.
       * Rendered at the tab root so they overlay the whole tab and
       * survive mode switches. */}
      <Modal
        open={confirmMode === 'campaigns'}
        onClose={() => (bulkDeleting ? null : setConfirmMode(null))}
        title="Xoá chiến dịch đã chọn?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmMode(null)} disabled={bulkDeleting}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleBulkDeleteCampaigns} disabled={bulkDeleting}>
              {bulkDeleting ? 'Đang xoá…' : `Xóa ${selectedByMode.campaigns.length} chiến dịch`}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {selectedByMode.campaigns.length} chiến dịch sẽ bị xoá cùng toàn bộ job bên trong. Thao tác
          này không thể hoàn tác.
        </p>
      </Modal>

      <Modal
        open={confirmMode === 'accounts'}
        onClose={() => (bulkDeleting ? null : setConfirmMode(null))}
        title="Xoá tài khoản đã chọn?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmMode(null)} disabled={bulkDeleting}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleBulkDeleteAccounts} disabled={bulkDeleting}>
              {bulkDeleting ? 'Đang xoá…' : `Xóa ${selectedByMode.accounts.length} tài khoản`}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {selectedByMode.accounts.length} tài khoản sẽ bị xoá khỏi danh sách và không thể dùng để
          đăng bài lên nhóm nữa.
        </p>
        <p className="fb-muted" style={{ marginTop: 8, fontSize: 12 }}>
          <strong>Lưu ý:</strong> mọi job repost thuộc tài khoản này sẽ bị xoá theo (cascade).
          Thư mục profile Playwright trên đĩa (<code>~/.mdp/facebook/profiles/…</code>) sẽ
          <strong> không</strong> bị xoá — bạn có thể dọn tay nếu muốn.
        </p>
      </Modal>

      <Modal
        open={confirmMode === 'groups'}
        onClose={() => (bulkDeleting ? null : setConfirmMode(null))}
        title="Xoá nhóm đã chọn?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmMode(null)} disabled={bulkDeleting}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleBulkDeleteGroups} disabled={bulkDeleting}>
              {bulkDeleting ? 'Đang xoá…' : `Xóa ${selectedByMode.groups.length} nhóm`}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {selectedByMode.groups.length} nhóm sẽ bị xoá khỏi danh sách.
        </p>
        <p className="fb-muted" style={{ marginTop: 8, fontSize: 12 }}>
          <strong>Lưu ý:</strong> các job repost cũ vẫn giữ tham chiếu <code>group_id</code> dạng
          text trỏ về nhóm đã xoá — chúng có thể fail ở runtime khi chạy.
        </p>
      </Modal>
    </div>
  );
};

export default RepostTab;
