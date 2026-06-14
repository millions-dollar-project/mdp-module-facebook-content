import React from 'react';
import { Card, FormField, Select, Button, Input, Badge } from '../../components';
import { SlotPicker } from '../scheduler/SlotPicker';
import type { CrawledPost, FacebookPage } from '../../lib/types';

export interface SlotSchedulerValue {
  pageId: string;
  slots: number[];
  perDay: number;
  startDate: string;
  endDate: string;
}

export interface SlotSchedulerProps {
  value: SlotSchedulerValue;
  onChange: (next: SlotSchedulerValue) => void;
  posts: CrawledPost[];
  pages: FacebookPage[];
  onSchedule: () => void;
  loading?: boolean;
}

const today = (): string => new Date().toISOString().slice(0, 10);
const plus = (d: number): string => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);

export const SlotScheduler: React.FC<SlotSchedulerProps> = ({ value, onChange, posts, pages, onSchedule, loading }) => {
  return (
    <Card title="Lên lịch repost hàng loạt" subtitle={`${posts.length} bài đang chọn`}>
      <div className="fb-form-grid">
        <FormField label="Trang đích" required>
          <Select
            value={value.pageId}
            onChange={(e) => onChange({ ...value, pageId: e.currentTarget.value })}
            options={pages.filter((p) => p.postingEnabled).map((p) => ({ value: p.pageId, label: p.pageName }))}
            placeholder="Chọn trang"
          />
        </FormField>
        <FormField label="Số bài/ngày">
          <Input
            type="number"
            min={1}
            max={5}
            value={value.perDay}
            onChange={(e) => onChange({ ...value, perDay: Number(e.currentTarget.value) })}
          />
        </FormField>
        <FormField label="Bắt đầu">
          <Input type="date" min={today()} value={value.startDate || plus(0)} onChange={(e) => onChange({ ...value, startDate: e.currentTarget.value })} />
        </FormField>
        <FormField label="Kết thúc">
          <Input type="date" min={value.startDate || today()} value={value.endDate || plus(7)} onChange={(e) => onChange({ ...value, endDate: e.currentTarget.value })} />
        </FormField>
        <FormField label="Khung giờ" hint="AI sẽ phân bổ đều các bài theo các khung giờ đã chọn">
          <SlotPicker value={value.slots} onChange={(slots) => onChange({ ...value, slots })} />
        </FormField>
        <div className="fb-summary">
          {value.slots.length > 0 && <Badge tone="info">{value.slots.length} khung giờ</Badge>}
          <span className="fb-muted">→ AI sẽ chọn slot tối ưu cho mỗi bài.</span>
        </div>
        <div className="fb-form-actions">
          <Button variant="primary" loading={loading} onClick={onSchedule}>Lên lịch {posts.length} bài</Button>
        </div>
      </div>
    </Card>
  );
};

export default SlotScheduler;
