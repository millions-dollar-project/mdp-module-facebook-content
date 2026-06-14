import React from 'react';
import { Modal, Badge, Button } from '../../components';
import { formatDateTime, truncate } from '../../lib/format';
import type { Campaign, CampaignPost } from '../../lib/types';

export interface DayDetailModalProps {
  campaign: Campaign | null;
  dayIndex?: number;
  posts: CampaignPost[];
  onClose: () => void;
  onPublishNow?: (p: CampaignPost) => void;
}

const statusTone: Record<CampaignPost['status'], 'brand' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  DRAFT: 'neutral',
  PENDING_REVIEW: 'warning',
  APPROVED: 'brand',
  SCHEDULED: 'brand',
  PUBLISHING: 'warning',
  PUBLISHED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

export const DayDetailModal: React.FC<DayDetailModalProps> = ({ campaign, dayIndex, posts, onClose, onPublishNow }) => {
  return (
    <Modal
      open={Boolean(campaign)}
      onClose={onClose}
      title={campaign ? `Chi tiết ngày ${dayIndex ?? '?'} — ${campaign.name}` : ''}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
        </>
      }
    >
      {posts.length === 0 ? (
        <p className="fb-muted">Chưa có bài nào trong ngày này.</p>
      ) : (
        <ul className="fb-day-posts">
          {posts.map((p) => (
            <li key={p.id} className="fb-day-post">
              <div className="fb-day-post__head">
                <Badge tone={statusTone[p.status]}>{p.status}</Badge>
                <span className="fb-muted">{formatDateTime(p.scheduledAt)} · slot {p.slot}</span>
              </div>
              <p className="fb-day-post__content">{truncate(p.content, 200)}</p>
              {p.imageUrl && <img className="fb-day-post__img" src={p.imageUrl} alt="" />}
              {p.errorMessage && <p className="fb-day-post__error">⚠️ {p.errorMessage}</p>}
              {(p.status === 'SCHEDULED' || p.status === 'APPROVED') && onPublishNow && (
                <Button size="sm" onClick={() => onPublishNow(p)}>Đăng ngay</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

export default DayDetailModal;
