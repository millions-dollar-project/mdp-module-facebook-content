import React from 'react';
import { PageHeader, Button } from '../components';
import { CommentList } from '../sections/comments/CommentList';
import { useComments, usePages } from '../hooks';
import { fbFetch } from '../lib/api';
import type { FacebookComment, FacebookPage } from '../lib/types';

export interface CommentsTabProps {
  /**
   * Nếu được truyền, dùng danh sách trang do cha cung cấp (vd: `EngageTab`).
   * Nếu không, tự gọi `usePages()` như cũ.
   */
  pages?: FacebookPage[];
  /**
   * `id` nội bộ của trang đang chọn. Nếu không truyền, tab tự quản lý state.
   */
  currentPageId?: string | null;
  onPageChange?: (pageId: string) => void;
  /** Ẩn tiêu đề + actions (khi nhúng làm sub-view bên trong tab khác). */
  embedded?: boolean;
}

export const CommentsTab: React.FC<CommentsTabProps> = ({
  pages: pagesProp,
  currentPageId: currentPageIdProp,
  onPageChange: onPageChangeProp,
  embedded = false,
}) => {
  const { data: pagesData } = usePages();
  const pages = pagesProp ?? pagesData;

  const [internalPageId, setInternalPageId] = React.useState<string | null>(null);
  const isControlled = currentPageIdProp !== undefined;
  const currentPageId = isControlled ? currentPageIdProp : internalPageId;

  React.useEffect(() => {
    if (pages.length === 0 || currentPageId) return;
    const first = pages[0]!.id;
    if (isControlled) onPageChangeProp?.(first);
    else setInternalPageId(first);
  }, [pages, currentPageId, isControlled, onPageChangeProp]);

  const { data: comments, reload } = useComments(currentPageId);
  const [status, setStatus] = React.useState<string>('');

  const handleReply = async (c: FacebookComment, content: string, isPrivate: boolean): Promise<void> => {
    try {
      if (isPrivate) {
        await fbFetch(`comments/${encodeURIComponent(c.id)}/private-reply`, {
          method: 'POST',
          body: { text: content },
        });
        setStatus(`Đã inbox cho ${c.fromName}`);
      } else {
        await fbFetch(`comments/${encodeURIComponent(c.id)}/reply`, {
          method: 'POST',
          body: { text: content },
        });
        setStatus(`Đã trả lời ${c.fromName}`);
      }
      reload();
    } catch (err) {
      setStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  const runMonitor = async (): Promise<void> => {
    if (!currentPageId) return;
    try {
      setStatus('Đang chạy comment monitor…');
      await fbFetch('comments/process', { method: 'POST' });
      setStatus('Monitor đã chạy xong');
      reload();
    } catch (err) {
      setStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <div className="fb-tab fb-tab--comments">
      {!embedded && (
        <PageHeader
          title="Bình luận"
          subtitle={`${comments.filter((c) => !c.isPrivateReplySent).length} chưa inbox · ${comments.filter((c) => c.intent === 'spam').length} spam`}
          actions={<Button size="sm" variant="ghost" onClick={() => void runMonitor()}>↻ Chạy monitor</Button>}
        />
      )}
      <div className="fb-comments">
        <CommentList
          comments={comments}
          onReply={handleReply}
        />
      </div>
      {status && <p className="fb-muted fb-mono fb-status">{status}</p>}
    </div>
  );
};

export default CommentsTab;
