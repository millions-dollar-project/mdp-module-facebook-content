import React from 'react';
import { Badge } from '../../components';
import { formatRelative, truncate } from '../../lib/format';
import type { FacebookComment } from '../../lib/types';

const intentToTone: Record<FacebookComment['intent'], 'positive' | 'neutral' | 'warning' | 'danger' | 'info'> = {
  question: 'info',
  complaint: 'danger',
  purchase: 'warning',
  feedback: 'positive',
  spam: 'danger',
  other: 'neutral',
};

const sentimentIcon: Record<FacebookComment['sentiment'], string> = {
  positive: '😊',
  neutral: '😐',
  negative: '😡',
};

export interface CommentCardProps {
  comment: FacebookComment;
  selected?: boolean;
  onClick?: () => void;
  onReply?: (content: string, isPrivate: boolean) => void;
}

export const CommentCard: React.FC<CommentCardProps> = ({ comment, selected, onClick, onReply }) => {
  const [draft, setDraft] = React.useState('');
  return (
    <article
      className={['fb-comment', selected ? 'fb-comment--selected' : ''].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <header className="fb-comment__head">
        <strong>{comment.fromName}</strong>
        <span className="fb-muted">· {formatRelative(comment.createdAt)}</span>
        <span title={comment.sentiment}>{sentimentIcon[comment.sentiment]}</span>
        <Badge tone={intentToTone[comment.intent]}>{comment.intent}</Badge>
        {comment.isLiked && <Badge tone="brand">Đã like</Badge>}
        {comment.isPrivateReplySent && <Badge tone="success">Đã inbox</Badge>}
        {comment.isHidden && <Badge tone="danger">Đã ẩn</Badge>}
      </header>
      <p className="fb-comment__body">{comment.message}</p>
      {onReply && (
        <footer className="fb-comment__reply">
          <input
            type="text"
            value={draft}
            placeholder={truncate('Trả lời công khai hoặc nhắn tin riêng…', 50)}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="fb-btn fb-btn--sm fb-btn--ghost"
            onClick={(e) => { e.stopPropagation(); if (draft.trim()) { onReply(draft.trim(), false); setDraft(''); } }}
          >
            Trả lời
          </button>
          <button
            type="button"
            className="fb-btn fb-btn--sm fb-btn--primary"
            onClick={(e) => { e.stopPropagation(); if (draft.trim()) { onReply(draft.trim(), true); setDraft(''); } }}
          >
            Inbox
          </button>
        </footer>
      )}
    </article>
  );
};

export default CommentCard;
