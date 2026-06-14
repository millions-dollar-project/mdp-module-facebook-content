import React from 'react';
import { Card, FormField, Input, Textarea, Select, Button } from '../../components';
import { GOLDEN_HOURS } from '../scheduler/SlotPicker';
import type { Campaign, CampaignDestination, CampaignVariant, FacebookPage } from '../../lib/types';

export interface CampaignFormValue {
  name: string;
  variant: CampaignVariant;
  destination: CampaignDestination;
  pageId: string;
  postsPerDay: number;
  startDate: string;
  endDate: string;
  slots: number[];
  autoApprove: boolean;
  promptTemplateId?: string;
  hashtags: string;
  hashtagCount: number;
}

export interface CampaignFormProps {
  value: CampaignFormValue;
  onChange: (next: CampaignFormValue) => void;
  pages: FacebookPage[];
  onSubmit: () => void;
  onCancel?: () => void;
  loading?: boolean;
  existing?: Campaign;
}

const today = (): string => new Date().toISOString().slice(0, 10);
const plusDays = (d: number): string => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);

export const CampaignForm: React.FC<CampaignFormProps> = ({ value, onChange, pages, onSubmit, onCancel, loading }) => {
  return (
    <Card title={value.name || 'Tạo chiến dịch mới'} subtitle="Có thể duyệt nội dung trước khi đăng">
      <div className="fb-form-grid">
        <FormField label="Tên chiến dịch" required>
          <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.currentTarget.value })} placeholder="Ví dụ: Tháng 6 — Lớp học xanh" />
        </FormField>
        <FormField label="Loại" required>
          <Select
            value={value.variant}
            onChange={(e) => onChange({ ...value, variant: e.currentTarget.value as CampaignVariant })}
            options={[
              { value: 'ai', label: 'AI Auto (sinh nội dung mới)' },
              { value: 'repost', label: 'Repost (crawl + đăng lại)' },
            ]}
          />
        </FormField>
        <FormField label="Đăng lên" required>
          <Select
            value={value.destination}
            onChange={(e) =>
              onChange({ ...value, destination: e.currentTarget.value as CampaignDestination })
            }
            options={[
              { value: 'group', label: 'Nhóm' },
              { value: 'page', label: 'Page' },
              { value: 'personal', label: 'Cá nhân (tự đăng lên FB cá nhân)' },
            ]}
          />
        </FormField>
        <FormField label="Trang" required={value.destination === 'page'}>
          <Select
            value={value.pageId}
            onChange={(e) => onChange({ ...value, pageId: e.currentTarget.value })}
            options={pages.filter((p) => p.postingEnabled).map((p) => ({ value: p.pageId, label: p.pageName }))}
            placeholder={value.destination === 'page' ? 'Chọn trang' : 'Không áp dụng cho nhóm / cá nhân'}
            disabled={value.destination !== 'page'}
          />
        </FormField>
        <FormField label="Số bài/ngày">
          <Input
            type="number"
            min={1}
            max={5}
            value={value.postsPerDay}
            onChange={(e) => onChange({ ...value, postsPerDay: Number(e.currentTarget.value) })}
          />
        </FormField>
        <FormField label="Bắt đầu">
          <Input type="date" min={today()} value={value.startDate || plusDays(0)} onChange={(e) => onChange({ ...value, startDate: e.currentTarget.value })} />
        </FormField>
        <FormField label="Kết thúc">
          <Input type="date" min={value.startDate || today()} value={value.endDate || plusDays(30)} onChange={(e) => onChange({ ...value, endDate: e.currentTarget.value })} />
        </FormField>
        <FormField label="Khung giờ" hint="Chọn nhiều khung giờ vàng">
          <div className="fb-slot-picker">
            {GOLDEN_HOURS.map((h) => (
              <Button
                key={h}
                size="sm"
                variant={value.slots.includes(h) ? 'primary' : 'ghost'}
                onClick={() =>
                  onChange({
                    ...value,
                    slots: value.slots.includes(h) ? value.slots.filter((x) => x !== h) : [...value.slots, h].sort((a, b) => a - b),
                  })
                }
              >
                {h}:00
              </Button>
            ))}
          </div>
        </FormField>
        <FormField label="Hashtag (cách nhau bởi dấu cách)">
          <Textarea
            rows={2}
            value={value.hashtags}
            onChange={(e) => onChange({ ...value, hashtags: e.currentTarget.value })}
            placeholder="#EcoHome #LopHocXanh #MamNon"
          />
        </FormField>
        <FormField label="Số hashtag tự động">
          <Input
            type="number"
            min={0}
            max={10}
            value={value.hashtagCount}
            onChange={(e) => onChange({ ...value, hashtagCount: Number(e.currentTarget.value) })}
          />
        </FormField>
        <FormField label="Duyệt trước khi đăng">
          <Select
            value={String(!value.autoApprove)}
            onChange={(e) => onChange({ ...value, autoApprove: e.currentTarget.value !== 'true' })}
            options={[
              { value: 'true', label: 'Duyệt thủ công' },
              { value: 'false', label: 'Tự động đăng' },
            ]}
          />
        </FormField>
        <div className="fb-form-actions">
          {onCancel && <Button variant="ghost" onClick={onCancel}>Hủy</Button>}
          <Button variant="primary" loading={loading} onClick={onSubmit}>Tạo chiến dịch</Button>
        </div>
      </div>
    </Card>
  );
};

export default CampaignForm;
