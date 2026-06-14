import React from 'react';
import { Card, FormField, Input, Button, Select } from '../../components';

export interface PageFormValue {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  category: string;
}

export interface PageFormProps {
  value: PageFormValue;
  onChange: (next: PageFormValue) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  loading?: boolean;
  existingId?: string;
}

export const PageForm: React.FC<PageFormProps> = ({ value, onChange, onSubmit, onCancel, loading, existingId }) => {
  return (
    <Card title={existingId ? 'Sửa trang' : 'Thêm trang mới'} subtitle="Bạn cần page access token dài hạn từ Meta Business Suite">
      <div className="fb-form-grid">
        <FormField label="Page ID" required>
          <Input value={value.pageId} onChange={(e) => onChange({ ...value, pageId: e.currentTarget.value })} placeholder="Ví dụ: 642546399435985" disabled={Boolean(existingId)} />
        </FormField>
        <FormField label="Tên trang" required>
          <Input value={value.pageName} onChange={(e) => onChange({ ...value, pageName: e.currentTarget.value })} placeholder="EcoHome Preschool" />
        </FormField>
        <FormField label="Danh mục">
          <Select
            value={value.category}
            onChange={(e) => onChange({ ...value, category: e.currentTarget.value })}
            options={[
              { value: '', label: 'Chọn danh mục' },
              { value: 'Giáo dục', label: 'Giáo dục' },
              { value: 'Nội thất', label: 'Nội thất' },
              { value: 'Tuyển sinh', label: 'Tuyển sinh' },
              { value: 'Workshop', label: 'Workshop' },
              { value: 'Hỏi đáp', label: 'Hỏi đáp' },
              { value: 'Khác', label: 'Khác' },
            ]}
          />
        </FormField>
        <FormField label="Page Access Token" required hint="Sẽ không hiển thị lại sau khi lưu.">
          <Input
            type="password"
            value={value.pageAccessToken}
            onChange={(e) => onChange({ ...value, pageAccessToken: e.currentTarget.value })}
            placeholder="EAAB…"
            autoComplete="off"
          />
        </FormField>
        <div className="fb-form-actions">
          {onCancel && <Button variant="ghost" onClick={onCancel}>Hủy</Button>}
          <Button variant="primary" loading={loading} onClick={onSubmit}>{existingId ? 'Cập nhật' : 'Thêm trang'}</Button>
        </div>
      </div>
    </Card>
  );
};

export default PageForm;
