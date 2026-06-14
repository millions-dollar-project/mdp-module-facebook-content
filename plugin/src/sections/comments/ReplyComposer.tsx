import React from 'react';
import { Button } from '../../components';

export interface ReplyComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onSuggest?: () => void;
  loading?: boolean;
  placeholder?: string;
}

export const ReplyComposer: React.FC<ReplyComposerProps> = ({
  value,
  onChange,
  onSend,
  onSuggest,
  loading,
  placeholder = 'Nhập nội dung trả lời…',
}) => {
  return (
    <div className="fb-reply-composer">
      <textarea
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        rows={2}
      />
      <div className="fb-reply-composer__actions">
        {onSuggest && (
          <Button variant="ghost" size="sm" onClick={onSuggest}>✨ Gợi ý AI</Button>
        )}
        <Button variant="primary" size="sm" loading={loading} disabled={!value.trim()} onClick={onSend}>
          Gửi
        </Button>
      </div>
    </div>
  );
};

export default ReplyComposer;
