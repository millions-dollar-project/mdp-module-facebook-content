/**
 * PublishView — tab "Đăng nhóm".
 *
 * Hiển thị:
 *   1. Hàng tab ngang của các tài khoản Facebook.
 *      Bấm vào acc → queue bên dưới chỉ hiện jobs của acc đó.
 *   2. Bảng queue (lịch chờ) — kế thừa RepostQueueView, truyền accountIdFilter
 *      để lọc.
 *
 * Mục đích: cho user thấy "ở giờ nào, acc nào sẽ đăng lên nhóm nào". Khi tới
 * giờ, worker backend sẽ publish qua sidecar (Playwright).
 */
import React from 'react';
import { Card, Button, DataTable, Badge } from '../components';
import { useRepostQueue } from '../hooks';
import { formatGmt7Short } from '../lib/time';
import type { RepostJob, FBAccount, FBGroup } from '../lib/types';

interface Props {
  accounts: FBAccount[];
  groups: FBGroup[];
  /**
   * When set, the view auto-selects this account's tab on mount so the
   * user lands directly on the queue for the account they just
   * scheduled a post to (workflow: Crawl → Tạo lịch đăng → tab Đăng nhóm).
   * Used together with `onDefaultConsumed` to clear the prop after
   * we've applied it (prevents re-applying on subsequent re-renders).
   */
  defaultAccountId?: string | null;
  onDefaultConsumed?: () => void;
}

export const PublishView: React.FC<Props> = ({ accounts, groups, defaultAccountId, onDefaultConsumed }) => {
  const [selectedAccount, setSelectedAccount] = React.useState<string | null>(null);
  const { jobs, loading, refresh } = useRepostQueue();

  // Apply the parent's hint exactly once. If the account isn't in the
  // list yet (still loading), fall back gracefully on the next render
  // when the accounts prop populates.
  React.useEffect(() => {
    if (!defaultAccountId) return;
    if (accounts.some((a) => a.id === defaultAccountId)) {
      setSelectedAccount(defaultAccountId);
      onDefaultConsumed?.();
    }
  }, [defaultAccountId, accounts, onDefaultConsumed]);

  React.useEffect(() => {
    if (selectedAccount && accounts.some((a) => a.id === selectedAccount)) return;
    setSelectedAccount(accounts[0]?.id ?? null);
  }, [accounts, selectedAccount]);

  // Always filter jobs to the selected account.
  const visibleJobs = React.useMemo(() => {
    if (!selectedAccount) return [];
    return jobs.filter((j) => j.accountId === selectedAccount);
  }, [jobs, selectedAccount]);

  // Compute the next-up job for the selected account.
  const nextUp = React.useMemo(() => {
    if (!selectedAccount) return null;
    const upcoming = jobs
      .filter((j) => j.accountId === selectedAccount)
      .filter((j) => j.status === 'pending' && j.scheduledAt && new Date(j.scheduledAt) > new Date())
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
    return upcoming[0] ?? null;
  }, [jobs, selectedAccount]);

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  const groupName = (id: string) => groups.find((g) => g.groupId === id)?.name ?? id;
  const selectedAccountRecord = selectedAccount ? accounts.find((a) => a.id === selectedAccount) ?? null : null;

  return (
    <div className="fb-publish-view">
      {/* Account picker tabs */}
      <Card>
        <h3 style={{ marginTop: 0 }}>Tài khoản đăng</h3>
        <p className="fb-muted" style={{ fontSize: 12, marginTop: 4 }}>
          Bấm vào tài khoản để xem lịch chờ đăng của riêng acc đó.
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {accounts.map((a) => {
            const count = jobs.filter((j) => j.accountId === a.id).length;
            return (
              <Button
                key={a.id}
                size="sm"
                variant={selectedAccount === a.id ? 'primary' : 'ghost'}
                onClick={() => setSelectedAccount(a.id)}
              >
                {a.name} ({count})
              </Button>
            );
          })}
        </div>
      </Card>

      {/* Highlight: next-up job for the selected account */}
      {nextUp && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Badge tone="brand">Sắp đăng</Badge>
            <strong>{formatGmt7Short(nextUp.scheduledAt)}</strong>
            <span className="fb-muted">— acc <strong>{accountName(nextUp.accountId)}</strong> → nhóm <strong>{groupName(nextUp.groupId)}</strong></span>
            {nextUp.anonymousPosting && <Badge tone="warning">Ẩn danh</Badge>}
          </div>
        </Card>
      )}

      {/* Queue table for the selected account. */}
      {selectedAccountRecord ? (
        <QueueTableForAccount
          account={selectedAccountRecord}
          groups={groups}
          jobs={visibleJobs}
          loading={loading}
          onRefresh={refresh}
        />
      ) : (
        <Card title="Hàng chờ đăng">
          <p className="fb-muted">Chưa có tài khoản Facebook nào. Thêm tài khoản trước để xem lịch chờ đăng.</p>
        </Card>
      )}
    </div>
  );
};

/**
 * QueueTableForAccount — same data shape as RepostQueueView but
 * pre-filtered to a single account (no per-row "Tài khoản" column).
 * Re-implemented inline to keep the filter visible to the user.
 */
interface QueueTableForAccountProps {
  account: FBAccount;
  groups: FBGroup[];
  jobs: RepostJob[];
  loading: boolean;
  onRefresh: () => void;
}

const QueueTableForAccount: React.FC<QueueTableForAccountProps> = ({ account, groups, jobs, loading, onRefresh }) => {
  const groupName = (id: string) => groups.find((g) => g.groupId === id)?.name ?? id;
  return (
    <Card
      title={`Hàng chờ — ${account.name}`}
      subtitle={`${jobs.length} lịch đăng`}
      actions={<Button onClick={onRefresh} disabled={loading}>{loading ? 'Đang tải…' : 'Tải lại'}</Button>}
    >
      {jobs.length === 0 ? (
        <p className="fb-muted">Chưa có lịch đăng nào cho tài khoản này.</p>
      ) : (
        <DataTable<RepostJob>
          columns={[
            { key: 'when', header: 'Thời gian', render: (j) => formatGmt7Short(j.scheduledAt) },
            { key: 'group', header: 'Nhóm', render: (j) => groupName(j.groupId) },
            { key: 'status', header: 'Trạng thái', render: (j) => j.status },
            {
              key: 'flags',
              header: 'Tùy chọn',
              render: (j) => (
                <span style={{ display: 'flex', gap: 4 }}>
                  {j.autoEnabled && <Badge tone="success">Tự động</Badge>}
                  {j.anonymousPosting && <Badge tone="warning">Ẩn danh</Badge>}
                </span>
              ),
            },
          ]}
          rows={jobs}
          rowKey={(j) => j.id}
        />
      )}
    </Card>
  );
};

export default PublishView;
