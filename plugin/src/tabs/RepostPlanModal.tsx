/**
 * RepostPlanModal — multi-slot schedule form.
 *
 * Lets the user fan a single source post out into N (account, group,
 * time, autoEnabled, anonymousPosting) tuples. Past times are
 * highlighted red and rejected on submit (the backend enforces the
 * same rule with a 30s grace window).
 */
import React from 'react';
import { Button, FormField, Input, Modal, Select, Textarea } from '../components';
import { fromGmt7DateTimeInput, isInPast, toGmt7DateTimeInput } from '../lib/time';
import { fbFetch } from '../lib/api';
import type { PlanItem, RepostCampaign } from '../lib/types';

interface AccountOpt { id: string; name: string }
interface GroupOpt { id: string; groupId: string; name?: string | null }

interface Props {
  open: boolean;
  onClose: () => void;
  post: { content: string; mediaUrls: string[]; permalink: string } | null;
  accounts: AccountOpt[];
  groups: GroupOpt[];
  /**
   * Called after the campaign is successfully created on the backend.
   * Receives the campaign plus the first accountId in the schedule —
   * parents use this to switch to the Publish tab and pre-select that
   * account so the user lands directly on the right queue.
   */
  onCreated: (campaign: RepostCampaign, firstAccountId: string) => void;
}

interface Row {
  accountId: string;
  groupId: string;
  scheduledAt: string; // "YYYY-MM-DDTHH:mm" GMT+7
  autoEnabled: boolean;
  anonymousPosting: boolean;
}

const newRow = (accounts: AccountOpt[], groups: GroupOpt[]): Row => {
  const tomorrow9 = new Date();
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  return {
    accountId: accounts[0]?.id ?? '',
    groupId: groups[0]?.groupId ?? '',
    scheduledAt: toGmt7DateTimeInput(tomorrow9),
    autoEnabled: true,
    anonymousPosting: false,
  };
};

export const RepostPlanModal: React.FC<Props> = ({ open, onClose, post, accounts, groups, onCreated }) => {
  const [caption, setCaption] = React.useState('');
  const [captionStyle, setCaptionStyle] = React.useState('friendly');
  const [rows, setRows] = React.useState<Row[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && post) {
      setCaption(post.content ?? '');
      setRows([newRow(accounts, groups)]);
      setError(null);
    }
  }, [open, post, accounts, groups]);

  const addRow = () => {
    if (!rows.length) return;
    setRows((prev) => [...prev, { ...prev[0] }]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleSubmit = async () => {
    setError(null);
    const items: PlanItem[] = [];
    for (const r of rows) {
      if (!r.accountId || !r.groupId || !r.scheduledAt) {
        setError('Mỗi dòng cần có tài khoản, nhóm và thời gian');
        return;
      }
      const when = fromGmt7DateTimeInput(r.scheduledAt);
      if (isInPast(when)) {
        setError(`Dòng ${rows.indexOf(r) + 1}: Không thể lên lịch giờ đã qua`);
        return;
      }
      items.push({
        accountId: r.accountId,
        groupId: r.groupId,
        scheduledAt: when.toISOString(),
        autoEnabled: r.autoEnabled,
        anonymousPosting: r.anonymousPosting,
      });
    }
    if (!post) return;
    setSubmitting(true);
    try {
      const campaign = await fbFetch<RepostCampaign>('plan-repost', {
        method: 'POST',
        body: {
          name: `Repost ${new Date().toLocaleString('vi-VN')}`,
          sourcePostUrl: post.permalink,
          sourcePostText: caption,
          mediaUrls: post.mediaUrls,
          captionStyle,
          items,
        },
      });
      onCreated(campaign, items[0]?.accountId ?? '');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Lên lịch đăng bài">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FormField label="Caption (sẽ được spin qua OpenAI theo phong cách đã chọn)">
          <Textarea
            rows={5}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </FormField>
        <FormField label="Phong cách caption">
          <Select
            value={captionStyle}
            onChange={(e) => setCaptionStyle(e.target.value)}
            options={[
              { value: 'friendly', label: 'Thân thiện' },
              { value: 'professional', label: 'Chuyên nghiệp' },
              { value: 'funny', label: 'Hài hước' },
              { value: 'original', label: 'Giữ nguyên' },
            ]}
          />
        </FormField>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Lịch đăng ({rows.length})</strong>
            <Button variant="secondary" onClick={addRow}>+ Thêm dòng</Button>
          </div>
          <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f4f4f4' }}>
                <th>Tài khoản</th>
                <th>Nhóm</th>
                <th>Thời gian (GMT+7)</th>
                <th>Tự động</th>
                <th>Ẩn danh</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const past = r.scheduledAt && isInPast(fromGmt7DateTimeInput(r.scheduledAt));
                return (
                  <tr key={i} style={{ borderTop: '1px solid #eee', background: past ? '#fff0f0' : undefined }}>
                    <td>
                      <Select
                        value={r.accountId}
                        onChange={(e) => updateRow(i, { accountId: e.target.value })}
                        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                      />
                    </td>
                    <td>
                      <Select
                        value={r.groupId}
                        onChange={(e) => updateRow(i, { groupId: e.target.value })}
                        options={groups.map((g) => ({ value: g.groupId, label: g.name ?? g.groupId }))}
                      />
                    </td>
                    <td>
                      <Input
                        type="datetime-local"
                        value={r.scheduledAt}
                        onChange={(e) => updateRow(i, { scheduledAt: e.target.value })}
                      />
                      {past && <div style={{ color: 'crimson', fontSize: 12 }}>Đã qua — không lưu được</div>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={r.autoEnabled}
                        onChange={(e) => updateRow(i, { autoEnabled: e.target.checked })}
                        aria-label="Bật tự động đăng"
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={r.anonymousPosting}
                        onChange={(e) => updateRow(i, { anonymousPosting: e.target.checked })}
                        aria-label="Đăng ẩn danh"
                      />
                    </td>
                    <td>
                      <Button variant="ghost" onClick={() => removeRow(i)} disabled={rows.length <= 1}>
                        Xóa
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && <div className="fb-error">{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Đang tạo…' : 'Tạo chiến dịch'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
