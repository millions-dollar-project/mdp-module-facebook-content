import React from 'react';
import { Card, FormField, Input, Button } from '../../components';

export interface AddPageFormValue {
  pageId: string;
  pageAccessToken: string;
  aiEnabled: boolean;
  postingEnabled: boolean;
}

export interface AddPageFormProps {
  value: AddPageFormValue;
  onChange: (next: AddPageFormValue) => void;
  onSave: () => void;
  loading?: boolean;
}

export const AddPageForm: React.FC<AddPageFormProps> = ({ value, onChange, onSave, loading }) => {
  return (
    <Card
      title="Thêm trang Facebook"
      subtitle="Chỉ cần Page ID và Page Access Token. Tên trang sẽ tự động lấy từ Graph API."
    >
      <div className="fb-form-grid">
        <FormField label="Page ID" required>
          <Input
            value={value.pageId}
            onChange={(e) => onChange({ ...value, pageId: e.currentTarget.value })}
            placeholder="vd: 642546399435985"
          />
        </FormField>
        <FormField label="Page Access Token" required hint="Token dài hạn, có quyền pages_manage_posts, pages_messaging…">
          <Input
            type="password"
            value={value.pageAccessToken}
            onChange={(e) => onChange({ ...value, pageAccessToken: e.currentTarget.value })}
            autoComplete="off"
            placeholder="EAAXX…"
          />
        </FormField>
        <FormField label="Bật chat bot AI">
          <div className="fb-row-actions">
            <Button
              size="sm"
              variant={value.aiEnabled ? 'primary' : 'ghost'}
              onClick={() => onChange({ ...value, aiEnabled: !value.aiEnabled })}
            >
              {value.aiEnabled ? 'Bật' : 'Tắt'}
            </Button>
          </div>
        </FormField>
        <FormField label="Bật tự động đăng bài">
          <div className="fb-row-actions">
            <Button
              size="sm"
              variant={value.postingEnabled ? 'primary' : 'ghost'}
              onClick={() => onChange({ ...value, postingEnabled: !value.postingEnabled })}
            >
              {value.postingEnabled ? 'Bật' : 'Tắt'}
            </Button>
          </div>
        </FormField>
        <div className="fb-form-actions">
          <Button variant="primary" loading={loading} onClick={onSave}>Thêm trang</Button>
        </div>
      </div>
    </Card>
  );
};

export default AddPageForm;
