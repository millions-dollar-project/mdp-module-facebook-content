/**
 * BrainFeedTab — top-level "Brain" tab.
 *
 * Composes Header + Row list + Pagination + Empty. Owns:
 *   - pagination (page) and filter (status, search)
 *   - the current selection set (ids)
 *   - delete + generate actions (delegated to hooks)
 *
 * Toast feedback uses `useToast` from the shared Toast component. The
 * plugin wraps the whole tree in `<ToastProvider>` (see App.tsx), so we
 * can call `toast.success/error/info` here. If Toast is absent the hook
 * degrades gracefully to `console.log`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, useToast } from '../components';
import { useBrainFeed } from '../hooks/useBrainFeed';
import { useBrainDelete } from '../hooks/useBrainDelete';
import { useBrainGenerate } from '../hooks/useBrainGenerate';
import { BrainFeedHeader, type BrainFeedFilterState } from './BrainFeedHeader';
import { BrainFeedRow } from './BrainFeedRow';
import { BrainFeedPagination } from './BrainFeedPagination';
import { BrainFeedEmpty } from './BrainFeedEmpty';
import { BrainOverviewPanel } from './BrainOverviewPanel';
import { BrainPersonaPanel } from './BrainPersonaPanel';
import { BrainLearningPanel } from './BrainLearningPanel';
import { BrainGraphStats } from './BrainGraphStats';
import { BrainPeekDrawer } from './BrainPeekDrawer';

export interface BrainFeedTabProps {
  onGoToCrawl: () => void;
  onDraftsReady: (feedIds: string[]) => void;
}

export const BrainFeedTab: React.FC<BrainFeedTabProps> = ({ onGoToCrawl, onDraftsReady }) => {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<BrainFeedFilterState>({ sourcePage: '', status: '', search: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const [dashboardTick, setDashboardTick] = useState(0);
  const { data, loading, reload } = useBrainFeed({
    page,
    pageSize: 20,
    status: filter.status || undefined,
    search: filter.search || undefined,
  });
  const peekedFeed = useMemo(
    () => data.items.find((i) => i.id === peekId) ?? null,
    [data.items, peekId],
  );
  const { remove } = useBrainDelete();
  const { generate, loading: isGenerating } = useBrainGenerate();

  // Drop selection entries that scroll out of view (e.g. on page change or filter).
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(data.items.map((i) => i.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [data.items]);

  const handleToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(id);
      reload();
      toast.success('Đã xoá bài');
    } catch (e) {
      toast.error(`Xoá lỗi: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    // Replace confirm() with a real dialog in a follow-up.
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Xoá ${ids.length} bài khỏi Brain?`)) return;
    let failed = 0;
    for (const id of ids) {
      try { await remove(id); }
      catch (e) {
        failed++;
        // eslint-disable-next-line no-console
        console.error('brain delete failed', id, e);
      }
    }
    setSelected(new Set());
    reload();
    if (failed === 0) {
      toast.success(`Đã xoá ${ids.length} bài`);
    } else {
      toast.error(`Xoá ${failed}/${ids.length} bài lỗi`);
    }
  };

  const handleGenerate = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      const res = await generate({ feedIds: ids });
      toast.success(
        `Generated ${res.drafts.length} draft${res.drafts.length > 1 ? 's' : ''}` +
        (res.failures.length > 0 ? `, ${res.failures.length} lỗi` : ''),
      );
      setSelected(new Set());
      reload();
      onDraftsReady(ids);
    } catch (e) {
      toast.error(`Generate lỗi: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const isEmpty = !loading && data.items.length === 0 && data.total === 0;

  return (
    <div data-testid="brain-feed-tab">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
          marginBottom: 12,
        }}
        key={dashboardTick}
      >
        <BrainOverviewPanel />
        <BrainPersonaPanel />
        <BrainGraphStats />
      </div>
      <BrainLearningPanel onApplied={() => setDashboardTick((t) => t + 1)} />
      {isEmpty ? (
        <BrainFeedEmpty onGoToCrawl={onGoToCrawl} />
      ) : (
        <>
          <BrainFeedHeader
            filter={filter}
            onFilterChange={(f) => { setFilter(f); setPage(1); }}
            selectedCount={selected.size}
            total={data.total}
            isGenerating={isGenerating}
            onGenerate={handleGenerate}
            onDeleteSelected={handleDeleteSelected}
          />
          <Card padded={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }}>
              {data.items.map((post) => (
                <BrainFeedRow
                  key={post.id}
                  post={post}
                  selected={selected.has(post.id)}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onPeek={setPeekId}
                />
              ))}
            </div>
          </Card>
          <BrainFeedPagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={setPage}
          />
        </>
      )}
      <BrainPeekDrawer
        feed={peekedFeed}
        open={peekId !== null}
        onClose={() => setPeekId(null)}
        onFeedback={() => {
          setDashboardTick((t) => t + 1);
          reload();
        }}
      />
    </div>
  );
};

export default BrainFeedTab;
