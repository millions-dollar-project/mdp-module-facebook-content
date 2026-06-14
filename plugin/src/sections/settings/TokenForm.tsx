import React from 'react';
import { Card, FormField, Input, Button, Badge } from '../../components';

export interface TokenFormValue {
  pageId: string;
  pageAccessToken: string;
  webhookVerifyToken: string;
  appSecret: string;
  publishMode: 'auto' | 'review';
}

export interface TokenFormProps {
  value: TokenFormValue;
  onChange: (next: TokenFormValue) => void;
  onSave: () => void;
  onTest?: () => void;
  loading?: boolean;
}

export const TokenForm: React.FC<TokenFormProps> = ({ value, onChange, onSave, onTest, loading }) => {
  return (
    <Card
      title="Facebook App credentials"
      subtitle="Lưu ở .env hoặc nhập trực tiếp — không commit"
      actions={onTest && <Button variant="ghost" onClick={onTest}>Test kết nối</Button>}
    >
      <div className="fb-form-grid">
        <FormField label="Page ID" required>
          <Input value={value.pageId} onChange={(e) => onChange({ ...value, pageId: e.currentTarget.value })} placeholder="642546399435985" />
        </FormField>
        <FormField label="Page Access Token" required hint="Dài hạn, có quyền pages_manage_posts, pages_manage_engagement, pages_messaging">
          <Input
            type="password"
            value={value.pageAccessToken}
            onChange={(e) => onChange({ ...value, pageAccessToken: e.currentTarget.value })}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Webhook Verify Token" hint="Dùng cho Meta webhook handshake">
          <Input
            type="password"
            value={value.webhookVerifyToken}
            onChange={(e) => onChange({ ...value, webhookVerifyToken: e.currentTarget.value })}
            autoComplete="off"
          />
        </FormField>
        <FormField label="App Secret" hint="Dùng để verify HMAC-SHA256 webhook. Không log hoặc expose.">
          <Input
            type="password"
            value={value.appSecret}
            onChange={(e) => onChange({ ...value, appSecret: e.currentTarget.value })}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Chế độ đăng">
          <div className="fb-row-actions">
            <Button
              size="sm"
              variant={value.publishMode === 'auto' ? 'primary' : 'ghost'}
              onClick={() => onChange({ ...value, publishMode: 'auto' })}
            >
              Tự động
            </Button>
            <Button
              size="sm"
              variant={value.publishMode === 'review' ? 'primary' : 'ghost'}
              onClick={() => onChange({ ...value, publishMode: 'review' })}
            >
              Cần duyệt
            </Button>
          </div>
        </FormField>
        <div className="fb-form-actions">
          {value.publishMode === 'review' && <Badge tone="warning">Mọi bài sẽ cần duyệt thủ công</Badge>}
          <Button variant="primary" loading={loading} onClick={onSave}>Lưu</Button>
        </div>
      </div>
    </Card>
  );
};

export default TokenForm;
