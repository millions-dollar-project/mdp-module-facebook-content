import React from 'react';
import { PageHeader, Button, Card, Badge, Tabs } from '../components';
import { CustomerList, HeatFilter } from '../sections/inbox/CustomerList';
import { ConversationView } from '../sections/inbox/ConversationView';
import { useConversations, useMessages, usePages } from '../hooks';
import { fbFetch } from '../lib/api';
import type { Conversation, FacebookPage } from '../lib/types';

const FILTERS: { id: HeatFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'hot', label: 'Nóng' },
  { id: 'warm', label: 'Ấm' },
  { id: 'cold', label: 'Lạnh' },
];

export interface InboxTabProps {
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

export const InboxTab: React.FC<InboxTabProps> = ({
  pages: pagesProp,
  currentPageId: currentPageIdProp,
  onPageChange: onPageChangeProp,
  embedded = false,
}) => {
  const { data: pagesData } = usePages();
  const pages = pagesProp ?? pagesData;

  // State nội bộ chỉ dùng khi cha không truyền currentPageId.
  const [internalPageId, setInternalPageId] = React.useState<string | null>(null);
  const isControlled = currentPageIdProp !== undefined;
  const currentPageId = isControlled ? currentPageIdProp : internalPageId;

  // Auto-select first page khi pages load và currentPageId chưa có.
  React.useEffect(() => {
    if (pages.length === 0 || currentPageId) return;
    const first = pages[0]!.id;
    if (isControlled) onPageChangeProp?.(first);
    else setInternalPageId(first);
  }, [pages, currentPageId, isControlled, onPageChangeProp]);

  const currentPage = pages.find((p) => p.id === currentPageId) ?? null;
  const { data: conversations, reload: reloadConversations } = useConversations(currentPageId);
  const syncedPageRef = React.useRef<string | null>(null);

  const [filter, setFilter] = React.useState<HeatFilter>('all');
  const [search, setSearch] = React.useState('');
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const { data: messages } = useMessages(activeId);
  const [status, setStatus] = React.useState<string>('');

  React.useEffect(() => {
    if (!currentPage?.pageId) return;
    if (syncedPageRef.current === currentPage.pageId) return;

    let cancelled = false;
    syncedPageRef.current = currentPage.pageId;

    const syncPageInbox = async () => {
      setStatus(`Đang tải hộp thư của ${currentPage.pageName}…`);
      try {
        await fbFetch('sync-conversations', {
          method: 'POST',
          body: { pageId: currentPage.pageId },
        });
        if (cancelled) return;
        await reloadConversations();
        if (cancelled) return;
        setStatus(`Đã tải danh sách khách hàng của ${currentPage.pageName}`);
      } catch (err) {
        if (cancelled) return;
        setStatus(`Lỗi tải hộp thư: ${(err as Error).message}`);
      }
    };

    void syncPageInbox();
    return () => {
      cancelled = true;
    };
  }, [currentPage, reloadConversations]);

  const handlePageChange = (pageId: string) => {
    setActiveId(null);
    if (isControlled) onPageChangeProp?.(pageId);
    else setInternalPageId(pageId);
  };

  const toggleConvAi = async (c: Conversation): Promise<void> => {
    try {
      await fbFetch(`conversations/${encodeURIComponent(c.id)}/toggle-ai`, {
        method: 'POST',
        body: { enabled: !c.aiEnabled },
      });
      reloadConversations();
      setStatus(c.aiEnabled ? `Đã tắt AI cho ${c.customerName}` : `Đã bật AI cho ${c.customerName}`);
    } catch (err) {
      setStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  const handleScan24h = async () => {
    setStatus('Đang quét 24h…');
    try {
      // call backend scan endpoint (best-effort)
      await fbFetch('conversations/scan', { method: 'POST', body: { pageId: currentPageId } }).catch(() => null);
      await reloadConversations();
      setStatus('Quét xong');
    } catch (err) {
      setStatus(`Lỗi quét: ${(err as Error).message}`);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!activeId) return;
    try {
      await fbFetch(`conversations/${encodeURIComponent(activeId)}/send`, {
        method: 'POST',
        body: { text },
      });
      setStatus('Đã gửi tin nhắn');
    } catch (err) {
      setStatus(`Lỗi gửi tin: ${(err as Error).message}`);
    }
  };

  const handleMarkRead = async () => {
    if (!activeId) return;
    try {
      await fbFetch(`conversations/${encodeURIComponent(activeId)}/mark-read`, { method: 'POST' });
      reloadConversations();
      setStatus('Đã đánh dấu đã đọc');
    } catch (err) {
      setStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  const handleResetAI = async () => {
    if (!activeId) return;
    try {
      await fbFetch(`conversations/${encodeURIComponent(activeId)}/reset-ai`, { method: 'POST' });
      reloadConversations();
      setStatus('Đã reset AI cho cuộc trò chuyện này');
    } catch (err) {
      setStatus(`Lỗi reset AI: ${(err as Error).message}`);
    }
  };

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const collected = active
    ? Object.entries(active.collectedInfo).filter(([, v]) => v).map(([k, v]) => ({ key: k, value: String(v) }))
    : [];

  return (
    <div className="fb-tab fb-tab--inbox">
      {!embedded && (
        <PageHeader
          title="Hộp thư Messenger"
          subtitle={`${conversations.length} khách hàng · ${currentPage ? `${currentPage.pageName}` : ''}`}
          actions={
            <div className="fb-row-actions">
              <Button size="sm" variant="ghost" onClick={() => void handleScan24h()}>
                ↻ Quét 24h
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setStatus('Đã xuất CSV (mock)')}>
                ↓ CSV
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setStatus('Đã xuất Google Sheets (mock)')}>
                ↓ Google Sheets
              </Button>
            </div>
          }
        />
      )}

      <div className="fb-inbox">
        {/* Left column — customer list */}
        <div className="fb-inbox__sidebar">
          <CustomerList
            conversations={conversations}
            activeId={activeId}
            onSelect={(c) => setActiveId(c.id)}
            onToggleAi={toggleConvAi}
            heatFilter={filter}
            onHeatFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            pageAiEnabled={currentPage?.aiEnabled ?? false}
            currentPage={currentPage}
            pages={pages}
            currentPageId={currentPageId}
            onPageChange={handlePageChange}
          />
        </div>

        {/* Right column — conversation detail */}
        <div className="fb-inbox__main">
          {active ? (
            <>
              <header className="fb-inbox__mainhead">
                <div className="fb-inbox__mainhead-left">
                  <h3 className="fb-inbox__customer-name">{active.customerName}</h3>
                  <p className="fb-muted">
                    {active.pageId} · {active.unreadCount} chưa đọc · {active.unreadCount > 0 ? '🔴' : '✓'}
                  </p>
                  {currentPage?.aiEnabled && (
                    <p className="fb-ai-badge">
                      <span className="fb-ai-badge__dot"></span>
                      AI đang trả lời: {currentPage.aiRole ?? 'Tư vấn viên'} · {currentPage.aiIndustry ?? 'Mầm non'}
                    </p>
                  )}
                </div>
                <div className="fb-row-actions">
                  {active.contacted && <Badge tone="success">Đã liên hệ</Badge>}
                  {active.aiEnabled && <Badge tone="info">AI bật</Badge>}
                  {!active.aiEnabled && <Badge tone="neutral">AI tắt</Badge>}
                  <Button size="sm" variant="ghost" onClick={handleMarkRead}>
                    Đánh dấu đã đọc
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void handleResetAI()}>
                    ↻ Reset AI
                  </Button>
                  <Tabs<HeatFilter>
                    items={FILTERS}
                    value={filter}
                    onChange={setFilter}
                    size="sm"
                  />
                </div>
              </header>

              <div className="fb-inbox__body">
                <ConversationView conversationId={activeId} messages={messages} onSendMessage={handleSendMessage} />
              </div>

              {collected.length > 0 && (
                <Card title="Thông tin đã thu thập" subtitle="AI tự rút từ hội thoại">
                  <ul className="fb-info-grid">
                    {collected.map((c) => (
                      <li key={c.key}>
                        <span className="fb-muted">{c.key}</span>
                        <strong>{c.value}</strong>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          ) : (
            <div className="fb-inbox__empty">
              <p className="fb-muted">Chọn một khách hàng để xem chi tiết.</p>
            </div>
          )}
        </div>
      </div>

      {status && <p className="fb-muted fb-mono fb-status">{status}</p>}
    </div>
  );
};

export default InboxTab;
