import React from 'react';
import { formatTime } from '../../lib/format';
import type { Message } from '../../lib/types';

export interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const mine = message.isFromPage;
  return (
    <div className={['fb-msg', mine ? 'fb-msg--mine' : 'fb-msg--theirs'].join(' ')}>
      <div className="fb-msg__bubble">
        {!mine && message.senderName && <p className="fb-msg__sender">{message.senderName}</p>}
        <p className="fb-msg__content">{message.content}</p>
        <span className="fb-msg__time">
          {formatTime(message.createdAt)} {message.isAi && <em>· AI</em>}
        </span>
      </div>
    </div>
  );
};

export default MessageBubble;
