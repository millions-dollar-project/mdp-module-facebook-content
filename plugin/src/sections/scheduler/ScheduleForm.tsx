import React from 'react';
import { Card, FormField, Input, Textarea, Select, Button } from '../../components';
import type { FacebookPage } from '../../lib/types';

export interface ScheduleFormValue {
  pageId: string;
  content: string;
  scheduledAt: string;
}

export interface ScheduleFormProps {
  value: ScheduleFormValue;
  onChange: (next: ScheduleFormValue) => void;
  pages: FacebookPage[];
  onSubmit: () => void;
  loading?: boolean;
}

const isoLocal = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const ScheduleForm: React.FC<ScheduleFormProps> = ({ value, onChange, pages, onSubmit, loading }) => {
  const min = isoLocal(new Date(Date.now() + 10 * 60 * 1000));
  return (
    <Card title="Lên lịch bài đăng" subtitle="Chọn thời gian hợp lệ (tối thiểu 10 phút tới)">
      <div className="fb-form-grid">
        <FormField label="Trang" required>
          <Select
            value={value.pageId}
            onChange={(e) => onChange({ ...value, pageId: e.currentTarget.value })}
            options={pages.filter((p) => p.postingEnabled).map((p) => ({ value: p.pageId, label: p.pageName }))}
            placeholder="Chọn trang"
          />
        </FormField>
        <FormField label="Thời gian đăng" required>
          <Input
            type="datetime-local"
            min={min}
            value={value.scheduledAt}
            onChange={(e) => onChange({ ...value, scheduledAt: e.currentTarget.value })}
          />
        </FormField>
        <FormField label="Nội dung" required>
          <Textarea
            rows={4}
            value={value.content}
            onChange={(e) => onChange({ ...value, content: e.currentTarget.value })}
            placeholder="Nhập nội dung bài viết…"
          />
        </FormField>
        <div className="fb-form-actions">
          <Button variant="primary" loading={loading} onClick={onSubmit}>Lên lịch</Button>
        </div>
      </div>
    </Card>
  );
};

export default ScheduleForm;
