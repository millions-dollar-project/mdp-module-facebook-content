/**
 * KanbanTab — 3-column board for scheduled posts.
 *
 * Columns:
 *   - Scheduled   (status === SCHEDULED)
 *   - Publishing  (status === PUBLISHING)
 *   - Done        (status ∈ {PUBLISHED, FAILED, CANCELLED})
 *
 * Card actions:
 *   - Đăng ngay    — calls /publish-scheduled-now
 *   - Chỉnh giờ    — inline datetime-local that submits on Enter or blur
 *   - Huỷ          — only on SCHEDULED
 *
 * The AI model label per card is resolved client-side via useBrainAIModels
 * (we don't join in the backend for the model name to keep the response
 * shape stable across kit accounts).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { useScheduledPosts } from '../hooks/useScheduledPosts';
import { useBrainAIModels } from '../hooks/useBrainAIModels';
import {
  scheduleApi,
  type ScheduleRow,
  type ScheduleStatus,
} from '../lib/api/scheduled';

/**
 * A Facebook permalink is acceptable as a "view post" link only if it
 * points at an actual story — not the bare /me timeline page that
 * sidecar sometimes returns as a fallback when the fingerprint scan
 * misses (see publisher-profile.js findPersonalPostUrl).
 */
function isAcceptablePostUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  if (!url.startsWith('http')) return false;
  return /\/posts\/|\/permalink|\/story\.php|\/photo\.php|\/videos\//.test(url);
}

export interface KanbanTabProps {
  /** SHA-1 v5 UUID of the kit account. Empty = all accounts. */
  accountId?: string;
}

interface Column {
  id: 'scheduled' | 'publishing' | 'done';
  title: string;
  statuses: ScheduleStatus[];
}

const COLUMNS: Column[] = [
  { id: 'scheduled', title: 'Đã lên lịch', statuses: ['SCHEDULED'] },
  { id: 'publishing', title: 'Đang đăng', statuses: ['PUBLISHING'] },
  {
    id: 'done',
    title: 'Hoàn tất / Lỗi',
    statuses: ['PUBLISHED', 'FAILED', 'CANCELLED'],
  },
];

function formatLocalTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    return iso;
  }
}

export const KanbanTab: React.FC<KanbanTabProps> = ({ accountId }) => {
  const { rows, loading, error, reload } = useScheduledPosts({ accountId });
  const { models } = useBrainAIModels({ accountId });
  const modelNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of models) m[a.id] = a.label;
    return m;
  }, [models]);

  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handlePublishNow = useCallback(
    async (id: string) => {
      setBusyId(id);
      // Backend now claims the row as PUBLISHING before returning, so
      // the Kanban reload should land the card in the "Đang đăng"
      // column. Tell the user what we're waiting for; the persistent
      // feedback is the column move itself.
      const loadingMsg = 'Đang đăng bài lên trang cá nhân…';
      const loadingId = toast.push(loadingMsg, 'info', 15000);
      try {
        await scheduleApi.publishNow(id);
        await reload();
        toast.success('Đã đăng bài');
      } catch (e) {
        toast.error(`Đăng ngay lỗi: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        toast.dismiss(loadingId);
        setBusyId(null);
      }
    },
    [reload, toast]
  );

  const handleCancel = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await scheduleApi.cancel(id);
        await reload();
        toast.success('Đã huỷ lịch bài viết');
      } catch (e) {
        toast.error(`Huỷ lỗi: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusyId(null);
      }
    },
    [reload, toast]
  );

  const handleReschedule = useCallback(
    async (id: string, postType: ScheduleRow['postType'], localDateTime: string) => {
      if (!localDateTime) return;
      const iso = new Date(localDateTime).toISOString();
      setBusyId(id);
      try {
        await scheduleApi.reschedule(id, iso, postType);
        await reload();
      } finally {
        setBusyId(null);
      }
    },
    [reload]
  );

  const grouped = useMemo(() => {
    const out: Record<Column['id'], ScheduleRow[]> = {
      scheduled: [],
      publishing: [],
      done: [],
    };
    for (const r of rows) {
      for (const col of COLUMNS) {
        if (col.statuses.includes(r.status)) {
          out[col.id].push(r);
          break;
        }
      }
    }
    return out;
  }, [rows]);

  return (
    <div className="kanban-tab">
      {error && <div className="kanban-tab__error">{error}</div>}
      {loading && rows.length === 0 ? (
        <div className="kanban-tab__loading">Đang tải…</div>
      ) : (
        <div className="kanban-tab__columns">
          {COLUMNS.map((col) => (
            <div className="kanban-tab__column" key={col.id}>
              <header className="kanban-tab__column-header">
                <h4>{col.title}</h4>
                <span className="kanban-tab__count">{grouped[col.id].length}</span>
              </header>
              {grouped[col.id].length === 0 ? (
                <EmptyState title="Chưa có bài" />
              ) : (
                <ul className="kanban-tab__cards">
                  {grouped[col.id].map((row) => (
                    <li className="kanban-tab__card" key={row.id}>
                      {row.thumbnail && (
                        <img
                          className="kanban-tab__thumb"
                          src={row.thumbnail}
                          alt=""
                          loading="lazy"
                        />
                      )}
                      <div className="kanban-tab__card-body">
                        <div className="kanban-tab__content">
                          {row.content.slice(0, 200)}
                          {row.content.length > 200 && '…'}
                        </div>
                        <div className="kanban-tab__meta">
                          <span className="kanban-tab__time">
                            {formatLocalTime(row.scheduledAt)}
                          </span>
                          {row.modelId && (
                            <span className="kanban-tab__persona">
                              {modelNameById[row.modelId] ?? row.modelId}
                            </span>
                          )}
                          {row.postType === 'personal' && (
                            <span className="kanban-tab__type">/me</span>
                          )}
                          {row.status === 'FAILED' && row.errorMessage && (
                            <span className="kanban-tab__error-msg" title={row.errorMessage}>
                              {row.errorMessage}
                            </span>
                          )}
                          {row.status === 'PUBLISHED' &&
                            isAcceptablePostUrl(row.facebookPostId) && (
                              <a
                                className="kanban-tab__post-link"
                                href={row.facebookPostId}
                                target="_blank"
                                rel="noreferrer"
                              >
                                xem bài
                              </a>
                            )}
                          {row.status === 'PUBLISHED' && !isAcceptablePostUrl(row.facebookPostId) && (
                            <span
                              className="kanban-tab__post-link kanban-tab__post-link--muted"
                              title="Bài đã đăng nhưng URL chưa được sidecar xác nhận — mở timeline cá nhân để xem."
                            >
                              đã đăng ✓
                            </span>
                          )}
                        </div>
                        <div className="kanban-tab__actions">
                          {row.status === 'SCHEDULED' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handlePublishNow(row.id)}
                                disabled={busyId === row.id}
                              >
                                Đăng ngay
                              </Button>
                              <RescheduleControl
                                row={row}
                                busy={busyId === row.id}
                                onSubmit={(dt) =>
                                  handleReschedule(row.id, row.postType, dt)
                                }
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleCancel(row.id)}
                                disabled={busyId === row.id}
                              >
                                Huỷ
                              </Button>
                            </>
                          )}
                          {row.status === 'FAILED' && (
                            <Button
                              size="sm"
                              onClick={() => handlePublishNow(row.id)}
                              disabled={busyId === row.id}
                            >
                              Thử lại
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface RescheduleControlProps {
  row: ScheduleRow;
  busy: boolean;
  onSubmit: (localDateTime: string) => void;
}

const RescheduleControl: React.FC<RescheduleControlProps> = ({ row, busy, onSubmit }) => {
  const [open, setOpen] = useState(false);
  const initial = useMemo(() => {
    try {
      const d = new Date(row.scheduledAt);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  }, [row.scheduledAt]);
  const [value, setValue] = useState(initial);

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} disabled={busy}>
        Chỉnh giờ
      </Button>
    );
  }
  return (
    <span className="kanban-tab__reschedule">
      <input
        type="datetime-local"
        className="fb-input fb-input--sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value && value !== initial) onSubmit(value);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value) {
            onSubmit(value);
            setOpen(false);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        autoFocus
      />
    </span>
  );
};

export default KanbanTab;