/**
 * RepostQueueView — "Lịch chờ đăng" table.
 *
 * Renders every job across all campaigns with editable time + per-job
 * auto/anonymous toggles. Past times are rejected client-side; the
 * backend also rejects with 400.
 */
import React from 'react';
import { Button, Card, Input, Select } from '../components';
import { useRepostQueue } from '../hooks';
import { formatGmt7Short, fromGmt7DateTimeInput, isInPast, toGmt7DateTimeInput } from '../lib/time';
import type { RepostJob } from '../lib/types';

interface Props {
  accounts: { id: string; name: string }[];
  groups: { id: string; groupId: string; name?: string | null }[];
}

export const RepostQueueView: React.FC<Props> = ({ accounts, groups }) => {
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  const groupName = (id: string) => groups.find((g) => g.groupId === id)?.name ?? id;
  const [status, setStatus] = React.useState('');
  const [editing, setEditing] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const { jobs, loading, error: loadErr, reschedule, setFlags, refresh } = useRepostQueue({ status: status || undefined });

  const startEdit = (job: RepostJob) => {
    setEditing((prev) => ({
      ...prev,
      [job.id]: toGmt7DateTimeInput(job.scheduledAt ? new Date(job.scheduledAt) : new Date()),
    }));
  };

  const saveEdit = async (job: RepostJob) => {
    setError(null);
    const raw = editing[job.id];
    if (!raw) return;
    try {
      await reschedule(job.id, fromGmt7DateTimeInput(raw));
      setEditing((prev) => {
        const { [job.id]: _drop, ...rest } = prev;
        return rest;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, flex: 1 }}>Lịch chờ đăng</h3>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'pending', label: 'Đang chờ' },
            { value: 'running', label: 'Đang chạy' },
            { value: 'completed', label: 'Hoàn tất' },
            { value: 'failed', label: 'Lỗi' },
          ]}
        />
        <Button onClick={refresh} disabled={loading}>{loading ? 'Đang tải…' : 'Tải lại'}</Button>
      </div>
      {loadErr && <div className="fb-error">{loadErr}</div>}
      {error && <div className="fb-error">{error}</div>}
      {jobs.length === 0 && !loading && (
        <p style={{ color: '#888' }}>Chưa có lịch chờ nào.</p>
      )}
      {jobs.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f4f4f4' }}>
              <th>Thời gian</th>
              <th>Tài khoản</th>
              <th>Nhóm</th>
              <th>Trạng thái</th>
              <th>Tự động</th>
              <th>Ẩn danh</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const past = j.scheduledAt && isInPast(new Date(j.scheduledAt));
              return (
                <tr key={j.id} style={{ borderTop: '1px solid #eee', background: past ? '#fff0f0' : undefined }}>
                  <td>
                    {editing[j.id] != null ? (
                      <Input
                        type="datetime-local"
                        value={editing[j.id]}
                        onChange={(e) => setEditing((p) => ({ ...p, [j.id]: e.target.value }))}
                      />
                    ) : (
                      <span title={j.scheduledAt}>{formatGmt7Short(j.scheduledAt)}</span>
                    )}
                  </td>
                  <td>{accountName(j.accountId)}</td>
                  <td>{groupName(j.groupId)}</td>
                  <td>{j.status}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={j.autoEnabled}
                      onChange={(e) => setFlags(j.id, e.target.checked, j.anonymousPosting)}
                      aria-label="Bật tự động đăng"
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={j.anonymousPosting}
                      onChange={(e) => setFlags(j.id, j.autoEnabled, e.target.checked)}
                      aria-label="Đăng ẩn danh"
                    />
                  </td>
                  <td>
                    {editing[j.id] != null ? (
                      <Button onClick={() => saveEdit(j)}>Lưu</Button>
                    ) : (
                      <Button variant="secondary" onClick={() => startEdit(j)}>Sửa giờ</Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
};
