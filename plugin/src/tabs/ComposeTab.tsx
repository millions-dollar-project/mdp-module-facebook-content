import React from 'react';
import { PageHeader, Card, Form, Tabs } from '../components';
import { PostForm } from '../sections/compose/PostForm';
import { MediaPicker } from '../sections/compose/MediaPicker';
import { PageSelector } from '../sections/compose/PageSelector';
import { PublishButton } from '../sections/compose/PublishButton';
import { usePages } from '../hooks';
import { fbFetch } from '../lib/api';

type Variant = 'post' | 'schedule';

export interface ComposeTabProps {
  defaultVariant?: Variant;
}

export const ComposeTab: React.FC<ComposeTabProps> = ({ defaultVariant = 'post' }) => {
  const [variant, setVariant] = React.useState<Variant>(defaultVariant);
  const { data: pages } = usePages();
  const [form, setForm] = React.useState({ content: '', imageUrl: '', link: '' });
  const [files, setFiles] = React.useState<File[]>([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<string>('idle');
  const [scheduledAt, setScheduledAt] = React.useState<string>('');

  const canSubmit = form.content.trim().length > 0 && selected.length > 0 && (variant === 'post' || Boolean(scheduledAt));

  const handlePublish = async (): Promise<void> => {
    setStatus('publishing');
    try {
      const payload = {
        content: form.content,
        media_urls: form.imageUrl ? [form.imageUrl, ...files.map((f) => f.name)] : files.map((f) => f.name),
        page_ids: selected,
        link: form.link || undefined,
        scheduled_at: variant === 'schedule' ? scheduledAt : undefined,
      };
      const res = await fbFetch<{ id: string; status: string }>('publish', { method: 'POST', body: payload });
      setStatus(`queued: ${res.id}`);
      setForm({ content: '', imageUrl: '', link: '' });
      setFiles([]);
      setSelected([]);
    } catch (err) {
      setStatus(`error: ${(err as Error).message}`);
    }
  };

  return (
    <div className="fb-tab fb-tab--compose">
      <PageHeader
        title="Đăng bài"
        subtitle="Soạn nội dung, chọn trang, đăng ngay hoặc lên lịch"
        actions={
          <Tabs<Variant>
            items={[
              { id: 'post', label: 'Đăng ngay' },
              { id: 'schedule', label: 'Lên lịch' },
            ]}
            value={variant}
            onChange={setVariant}
            size="sm"
          />
        }
      />
      <div className="fb-grid-compose">
        <Card title="Nội dung" padded>
          <Form onSubmit={(e) => { e.preventDefault(); void handlePublish(); }}>
            <PostForm value={form} onChange={setForm} disabled={status === 'publishing'} />
            {variant === 'schedule' && (
              <div className="fb-field">
                <label className="fb-field__label">Thời gian đăng *</label>
                <input
                  type="datetime-local"
                  className="fb-input"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.currentTarget.value)}
                />
              </div>
            )}
            <PublishButton
              loading={status === 'publishing'}
              disabled={!canSubmit}
              onClick={handlePublish}
              label={variant === 'schedule' ? 'Lên lịch' : 'Đăng ngay'}
            />
            {status !== 'idle' && <p className="fb-muted fb-mono">{status}</p>}
          </Form>
        </Card>
        <div className="fb-compose-side">
          <MediaPicker files={files} onChange={setFiles} disabled={status === 'publishing'} />
          <PageSelector pages={pages} selected={selected} onChange={setSelected} />
        </div>
      </div>
    </div>
  );
};

export default ComposeTab;
