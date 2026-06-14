import React from 'react';
import { Button, Textarea } from '../../components';
import { MessageBubble } from './MessageBubble';
import type { Message } from '../../lib/types';

export interface ConversationViewProps {
  conversationId: string | null;
  messages: Message[];
  onSendMessage?: (text: string) => void | Promise<void>;
  loading?: boolean;
}

export const ConversationView: React.FC<ConversationViewProps> = ({ conversationId, messages, onSendMessage, loading }) => {
  const endRef = React.useRef<HTMLDivElement>(null);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, conversationId]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !onSendMessage) return;
    setSending(true);
    try {
      await onSendMessage(text);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (!conversationId) {
    return (
      <div className="fb-conv-empty">
        <p className="fb-muted">Chọn một khách hàng để xem hội thoại.</p>
      </div>
    );
  }

  if (loading) {
    return <p className="fb-muted">Đang tải hội thoại…</p>;
  }

  return (
    <div className="fb-conv-wrap">
      <div className="fb-conv">
        {messages.length === 0 && (
          <p className="fb-muted fb-conv-empty">Chưa có tin nhắn.</p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={endRef} />
      </div>

      {onSendMessage && (
        <div className="fb-conv-composer">
          <Textarea
            placeholder="Nhập tin nhắn… (Enter để gửi, Shift+Enter xuống dòng)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            autoSize
            className="fb-conv-composer__input"
          />
          <Button onClick={handleSend} loading={sending} size="sm">Gửi</Button>
        </div>
      )}
    </div>
  );
};

export default ConversationView;
