import React from 'react';
import { Card, FormField, Select, Input, Button, Textarea } from '../../components';
import { SlotPicker } from '../scheduler/SlotPicker';
import type { CrawledPost, FacebookPage } from '../../lib/types';

export interface PostImporterValue {
  post: CrawledPost;
  targetPageId: string;
  newContent: string;
  scheduledAt: string;
  slots: number[];
  hashtags: string;
}

export interface PostImporterProps {
  value: PostImporterValue;
  onChange: (next: PostImporterValue) => void;
  pages: FacebookPage[];
  onImport: () => void;
  loading?: boolean;
}

const isoLocal = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const PostImporter: React.FC<PostImporterProps> = ({ value, onChange, pages, onImport, loading }) => {
  const p = value.post;
  return (
    <Card title={`Repost: ${p.pageName}`} subtitle={truncate(p.content, 80)}>
      <div className="fb-form-grid">
        <FormField label="Trang đích" required>
          <Select
            value={value.targetPageId}
            onChange={(e) => onChange({ ...value, targetPageId: e.currentTarget.value })}
            options={pages.filter((pg) => pg.postingEnabled).map((pg) => ({ value: pg.pageId, label: pg.pageName }))}
            placeholder="Chọn trang đích"
          />
        </FormField>
        <FormField label="Thời gian đăng" required>
          <Input
            type="datetime-local"
            value={value.scheduledAt}
            onChange={(e) => onChange({ ...value, scheduledAt: e.currentTarget.value })}
          />
        </FormField>
        <FormField label="Khung giờ gợi ý">
          <SlotPicker value={value.slots} onChange={(slots) => onChange({ ...value, slots })} />
        </FormField>
        <FormField label="Nội dung (chỉnh sửa)">
          <Textarea
            rows={4}
            value={value.newContent}
            onChange={(e) => onChange({ ...value, newContent: e.currentTarget.value })}
          />
        </FormField>
        <FormField label="Hashtag (tuỳ chọn)">
          <Input
            value={value.hashtags}
            onChange={(e) => onChange({ ...value, hashtags: e.currentTarget.value })}
            placeholder="#EcoHome #Repost"
          />
        </FormField>
        <div className="fb-form-actions">
          <Button variant="primary" loading={loading} onClick={onImport}>Đưa vào hàng đợi</Button>
        </div>
      </div>
    </Card>
  );
};

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export const makeDefaultImporterValue = (post: CrawledPost, pages: FacebookPage[]): PostImporterValue => {
  const defaultPage = pages.find((p) => p.postingEnabled);
  return {
    post,
    targetPageId: defaultPage?.pageId ?? '',
    newContent: post.content,
    scheduledAt: isoLocal(new Date(Date.now() + 86400_000)),
    slots: [12],
    hashtags: '',
  };
};

export default PostImporter;
