import React from 'react';
import { Card, Tabs, EmptyState } from '../../components';
import { CommentCard } from './CommentCard';
import type { FacebookComment } from '../../lib/types';

export interface CommentListProps {
  comments: FacebookComment[];
  onReply?: (comment: FacebookComment, content: string, isPrivate: boolean) => void;
  loading?: boolean;
}

const FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pending', label: 'Chờ trả lời' },
  { id: 'purchase', label: 'Mua hàng' },
  { id: 'question', label: 'Câu hỏi' },
  { id: 'spam', label: 'Spam' },
] as const;

type Filter = (typeof FILTERS)[number]['id'];

export const CommentList: React.FC<CommentListProps> = ({ comments, onReply, loading }) => {
  const [filter, setFilter] = React.useState<Filter>('all');
  const filtered = React.useMemo(() => {
    if (filter === 'all') return comments;
    if (filter === 'pending') return comments.filter((c) => !c.isPrivateReplySent && (c.intent === 'question' || c.intent === 'purchase'));
    if (filter === 'spam') return comments.filter((c) => c.intent === 'spam');
    return comments.filter((c) => c.intent === filter);
  }, [comments, filter]);

  return (
    <Card
      title="Bình luận mới nhất"
      subtitle={`${comments.length} bình luận — ${comments.filter((c) => !c.isPrivateReplySent).length} chưa inbox`}
      actions={<Tabs items={FILTERS as unknown as { id: string; label: React.ReactNode }[]} value={filter} onChange={(v) => setFilter(v as Filter)} size="sm" />}
      padded={false}
    >
      <div className="fb-comment-list">
        {loading ? (
          <p className="fb-muted">Đang tải…</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="Chưa có bình luận" subtitle="Khi có bình luận mới, AI sẽ phân tích sentiment và intent." />
        ) : (
          filtered.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              onReply={onReply ? (content, isPrivate) => onReply(c, content, isPrivate) : undefined}
            />
          ))
        )}
      </div>
    </Card>
  );
};

export default CommentList;
