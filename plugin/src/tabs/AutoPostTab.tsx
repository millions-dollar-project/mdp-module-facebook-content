import React from 'react';
import { PageHeader, Tabs, Modal, Button, useToast } from '../components';
import { CampaignList } from '../sections/autopost/CampaignList';
import { CampaignForm, CampaignFormValue } from '../sections/autopost/CampaignForm';
import { DayDetailModal } from '../sections/autopost/DayDetailModal';
import { usePages, useScheduler } from '../hooks';
import { MOCK_CAMPAIGNS } from '../mocks';
import type { Campaign, CampaignDestination, CampaignPost } from '../lib/types';
import { fbFetch } from '../lib/api';

type DestinationFilter = 'all' | CampaignDestination;
const FILTERS: { id: DestinationFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'group', label: 'Nhóm' },
  { id: 'page', label: 'Page' },
  { id: 'personal', label: 'Cá nhân' },
];

const plus = (d: number): string => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);

export const AutoPostTab: React.FC = () => {
  const { data: pages } = usePages();
  const { data: scheduled } = useScheduler();
  const toast = useToast();
  const [filter, setFilter] = React.useState<DestinationFilter>('all');
  const [creating, setCreating] = React.useState(false);
  const [viewing, setViewing] = React.useState<{ campaign: Campaign; day?: number } | null>(null);
  const [status, setStatus] = React.useState<string>('');

  // Mirror DataTable selection up here so the section bar can render
  // the bulk-action chip in the top-right corner (matching Tài khoản /
  // Nhóm). `onSelectionChange` from DataTable feeds this; partial
  // failures prune the surviving ids back into this state.
  const [selectedIds, setSelectedIds] = React.useState<readonly string[]>([]);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const [form, setForm] = React.useState<CampaignFormValue>({
    name: '',
    variant: 'ai',
    destination: 'page',
    pageId: '',
    postsPerDay: 2,
    startDate: plus(0),
    endDate: plus(30),
    slots: [12, 18],
    autoApprove: false,
    hashtags: '#EcoHome #LopHocXanh #MamNon',
    hashtagCount: 5,
  });

  // Local mutable copy of the campaign list so delete operations can
  // remove rows in-place. MOCK_CAMPAIGNS is the seed; once we wire
  // to the real `list-campaigns` endpoint we drop this state.
  const [campaigns, setCampaigns] = React.useState<Campaign[]>(MOCK_CAMPAIGNS);
  const filtered = filter === 'all' ? campaigns : campaigns.filter((c) => c.destination === filter);

  const handleCreate = async (): Promise<void> => {
    setStatus('Đang tạo chiến dịch…');
    try {
      await fbFetch('create-campaign', { method: 'POST', body: form });
      setStatus('Đã tạo chiến dịch ✓');
      setCreating(false);
    } catch (err) {
      setStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  // Bulk delete with partial-failure handling — mirrors
  // handleBulkDeleteAccounts / handleBulkDeleteGroups ở RepostTab.
  // Đường xoá duy nhất còn lại (per-row Xóa đã lược bỏ khỏi UI).
  const handleBulkDelete = async (): Promise<void> => {
    if (selectedIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedIds.map((id) => fbFetch('delete-campaign', { method: 'POST', body: { id } })),
      );
      const okIds: string[] = [];
      const failedIds: string[] = [];
      results.forEach((r, i) => {
        const id = selectedIds[i];
        if (!id) return;
        if (r.status === 'fulfilled') okIds.push(id);
        else failedIds.push(id);
      });
      if (okIds.length) {
        setCampaigns((cur) => cur.filter((x) => !okIds.includes(x.id)));
        toast.success(`Đã xoá ${okIds.length}/${selectedIds.length} chiến dịch`);
      }
      if (failedIds.length) {
        const errs = results
          .filter((r) => r.status === 'rejected')
          .map((r) => (r as PromiseRejectedResult).reason?.message ?? 'unknown')
          .join('; ');
        toast.error(`${failedIds.length} lỗi: ${errs}`);
      }
      setSelectedIds(failedIds);
    } finally {
      setBulkDeleting(false);
      setConfirming(false);
    }
  };

  // Build mock day-detail from scheduled posts that belong to a campaign
  const dayPosts: CampaignPost[] = React.useMemo(() => {
    if (!viewing) return [];
    return scheduled
      .filter((p) => p.campaignId === viewing.campaign.id)
      .map((p) => ({
        id: p.id,
        campaignId: p.campaignId!,
        dayIndex: 0,
        slot: 'noon',
        scheduledAt: p.scheduledAt,
        content: p.content,
        imageUrl: p.imageUrl,
        status: p.status,
      }));
  }, [viewing, scheduled]);

  return (
    <div className="fb-tab fb-tab--autopost">
      <PageHeader
        title="AI Auto Đăng Bài"
        subtitle="Tạo chiến dịch để AI tự sinh và lên lịch nội dung"
        actions={
          <Tabs<DestinationFilter>
            items={FILTERS}
            value={filter}
            onChange={setFilter}
            size="sm"
          />
        }
      />
      {creating ? (
        <CampaignForm
          value={form}
          onChange={setForm}
          pages={pages}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <CampaignList
          campaigns={filtered}
          onCreate={() => setCreating(true)}
          onView={(c) => setViewing({ campaign: c })}
          onPause={(c) => void fbFetch('update-campaign', { method: 'POST', body: { id: c.id, status: 'paused' } })}
          onResume={(c) => void fbFetch('update-campaign', { method: 'POST', body: { id: c.id, status: 'active' } })}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onBulkDelete={() => setConfirming(true)}
          bulkDeleting={bulkDeleting}
        />
      )}
      <DayDetailModal
        campaign={viewing?.campaign ?? null}
        dayIndex={viewing?.day}
        posts={dayPosts}
        onClose={() => setViewing(null)}
      />
      {status && <p className="fb-muted fb-mono fb-status">{status}</p>}

      {/* Bulk-delete confirm — render ở tab root để overlay content
       * và không bị reset khi user đổi filter chip. */}
      <Modal
        open={confirming}
        onClose={() => (bulkDeleting ? undefined : setConfirming(false))}
        title="Xoá chiến dịch đã chọn?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={bulkDeleting}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? 'Đang xoá…' : `Xóa ${selectedIds.length} chiến dịch`}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {selectedIds.length} chiến dịch sẽ bị xoá cùng toàn bộ bài đăng đã lên lịch bên trong. Thao tác
          này không thể hoàn tác.
        </p>
      </Modal>
    </div>
  );
};

export default AutoPostTab;
