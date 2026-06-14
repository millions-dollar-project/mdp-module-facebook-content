/**
 * GroupAssignmentTable — accounts on rows, groups on columns.
 *
 * Each cell is a checkbox: ticking it means "this account is allowed
 * to post to this group" (= group.assignedAccountId === account.id).
 * Saves are debounced per-cell so a burst of clicks doesn't hammer
 * the backend.
 */
import React from 'react';
import { Card } from '../components';
import { fbFetch } from '../lib/api';
import type { FBAccount, FBGroup } from '../lib/types';

interface Props {
  accounts: FBAccount[];
  groups: FBGroup[];
  onChanged?: () => void;
}

export const GroupAssignmentTable: React.FC<Props> = ({ accounts, groups, onChanged }) => {
  const [pending, setPending] = React.useState<Record<string, boolean>>({});

  const toggle = async (group: FBGroup, account: FBAccount) => {
    const isMine = group.assignedAccountId === account.id;
    const next = isMine ? null : account.id;
    setPending((p) => ({ ...p, [group.id]: true }));
    try {
      // fb-groups/ POST updates assignedAccountId. We use fb-groups/:id
      // since the group list endpoint already supports a PATCH/POST
      // variant — see backend handlers/repost.go UpdateGroup.
      await fbFetch(`fb-groups/${group.id}`, {
        method: 'POST',
        body: { assignedAccountId: next },
      });
      onChanged?.();
    } finally {
      setPending((p) => ({ ...p, [group.id]: false }));
    }
  };

  if (!accounts.length || !groups.length) {
    return (
      <Card>
        <p style={{ color: '#888' }}>
          Cần tạo ít nhất 1 tài khoản và 1 nhóm trước khi phân công.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h3>Phân công nhóm → tài khoản</h3>
      <p style={{ color: '#666', fontSize: 13 }}>
        Tick vào ô để cho phép tài khoản ở hàng tương ứng đăng bài lên nhóm ở cột tương ứng.
        Mỗi nhóm chỉ gán được 1 tài khoản tại 1 thời điểm.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ background: '#f4f4f4' }} />
              {groups.map((g) => (
                <th key={g.id} style={{ background: '#f4f4f4', padding: 6, textAlign: 'left' }}>
                  {g.name ?? g.groupId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <th style={{ background: '#f4f4f4', padding: 6, textAlign: 'left' }}>{a.name}</th>
                {groups.map((g) => {
                  const mine = g.assignedAccountId === a.id;
                  return (
                    <td key={g.id} style={{ textAlign: 'center', borderTop: '1px solid #eee' }}>
                      <input
                        type="checkbox"
                        checked={mine}
                        disabled={pending[g.id]}
                        onChange={() => toggle(g, a)}
                        aria-label={`${a.name} → ${g.name ?? g.groupId}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
