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
import { Card, ErrorBoundary, useToast } from '../components';
import { useBrainFeed } from '../hooks/useBrainFeed';
import { useBrainDelete } from '../hooks/useBrainDelete';
import { useBrainGenerate } from '../hooks/useBrainGenerate';
import { useFBAccounts } from '../hooks/useRepost';
import { accountUUIDFromName } from '../lib/accountUUID';
import { BrainFeedHeader, type BrainFeedFilterState } from './BrainFeedHeader';
import { BrainFeedRow } from './BrainFeedRow';
import { BrainFeedPagination } from './BrainFeedPagination';
import { BrainOverviewPanel } from './BrainOverviewPanel';
import { BrainPersonaPanel } from './BrainPersonaPanel';
import { BrainLearningPanel } from './BrainLearningPanel';
import { BrainGraphStats } from './BrainGraphStats';
import { BrainPeekDrawer } from './BrainPeekDrawer';

export interface BrainFeedTabProps {
  onGoToCrawl?: () => void;
  onDraftsReady: (feedIds: string[]) => void;
}

export const BrainFeedTab: React.FC<BrainFeedTabProps> = ({ onDraftsReady }) => {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<BrainFeedFilterState>({ sourcePage: '', status: '', search: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const [dashboardTick, setDashboardTick] = useState(0);
  // kit-account scoping: dropdown lists every kit-account; the SHA-1 v5
  // UUID of the chosen name is what we forward to the backend. We store
  // the *name* in state so the dropdown label stays human-readable and
  // derive the UUID directly from that name (synchronous, doesn't depend
  // on useFBAccounts having resolved). `accountUUIDFromName(name)` is
  // the authoritative source and matches the Go service byte-for-byte.
  const [selectedAccountName, setSelectedAccountName] = useState<string>('');
  const { data: accounts } = useFBAccounts();
  // Auto-select the first kit-account once the list arrives so the
  // scope is always a concrete UUID (no more "all accounts" escape
  // hatch — every dashboard query is account-bound).
  useEffect(() => {
    if (!selectedAccountName && accounts && accounts.length > 0) {
      setSelectedAccountName(accounts[0].name);
    }
  }, [accounts, selectedAccountName]);
  const accountUUID = useMemo(() => {
    if (!selectedAccountName) return '';
    return accountUUIDFromName(selectedAccountName);
  }, [selectedAccountName]);
  const { data, loading, reload } = useBrainFeed({
    page,
    pageSize: 20,
    status: filter.status || undefined,
    search: filter.search || undefined,
    accountId: accountUUID || undefined,
  });
  const peekedFeed = useMemo(
    () => data.items.find((i) => i.ID === peekId) ?? null,
    [data.items, peekId],
  );
  const { remove } = useBrainDelete();
  const { generate, loading: isGenerating } = useBrainGenerate();

  // Drop selection entries that scroll out of view (e.g. on page change or filter).
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(data.items.map((i) => i.ID));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [data.items]);

  // Reset pagination + selection + peek drawer when the account scope
  // changes; otherwise the user might be stuck on an empty page index
  // (account A had 5 pages, account B only has 1).
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    setPeekId(null);
  }, [accountUUID]);

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
      <ErrorBoundary label="dashboard">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          <label
            htmlFor="brain-account-select"
            style={{ fontSize: 13, color: 'var(--ds-text-muted)' }}
          >
            Tài khoản:
          </label>
          <select
            id="brain-account-select"
            data-testid="brain-account-select"
            value={selectedAccountName}
            onChange={(e) => setSelectedAccountName(e.target.value)}
            className="fb-select"
            style={{ minWidth: 240 }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
                {a.status && a.status !== 'active' ? ` · ${a.status}` : ''}
              </option>
            ))}
          </select>
          <span
            style={{ fontSize: 11, color: 'var(--ds-text-muted)' }}
            data-testid="brain-account-scope"
          >
            {accountUUID
              ? `scope.account_id = ${accountUUID.slice(0, 8)}…`
              : 'scope.account_id = (chưa chọn tài khoản)'}
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12,
            marginBottom: 12,
          }}
          key={dashboardTick}
        >
          <BrainOverviewPanel accountId={accountUUID || undefined} />
          <BrainPersonaPanel accountId={accountUUID || undefined} />
          <BrainGraphStats accountId={accountUUID || undefined} />
        </div>
        <BrainLearningPanel
          accountId={accountUUID || undefined}
          onApplied={() => setDashboardTick((t) => t + 1)}
        />
      </ErrorBoundary>
      <ErrorBoundary label="feed list">
      {!isEmpty && (
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
                  key={post.ID}
                  post={post}
                  selected={selected.has(post.ID)}
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
      </ErrorBoundary>
      <ErrorBoundary label="peek drawer">
      <BrainPeekDrawer
        feed={peekedFeed}
        open={peekId !== null}
        onClose={() => setPeekId(null)}
        onFeedback={() => {
          setDashboardTick((t) => t + 1);
          reload();
        }}
      />
      </ErrorBoundary>
    </div>
  );
};

export default BrainFeedTab;
