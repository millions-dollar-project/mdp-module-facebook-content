import React from 'react';
import { PageHeader, Tabs, Card } from '../components';
import { PromptTemplateList } from '../sections/settings/PromptTemplateList';
import { TonePicker } from '../sections/settings/TonePicker';
import { HashtagBank } from '../sections/settings/HashtagBank';
import { PageSettingsCard } from '../sections/settings/PageSettingsCard';
import { useConfig, useHashtags, usePageSettings, usePrompts, useVideoConfig } from '../hooks';
import { fbFetch } from '../lib/api';
import {
  buildTones,
  enabledTones,
  toggleToneId,
  addCustomTone,
  deleteCustomTone,
  updateCustomTone,
  customsToJson,
} from '../lib/tones';
import type { ContentTone } from '../lib/types';

type Section = 'app' | 'pages' | 'prompts' | 'tones' | 'hashtags' | 'video';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'app', label: 'App & Token' },
  { id: 'pages', label: 'AI theo trang' },
  { id: 'prompts', label: 'Prompt' },
  { id: 'tones', label: 'Tone' },
  { id: 'hashtags', label: 'Hashtag' },
  { id: 'video', label: 'Video' },
];

export const SettingsTab: React.FC = () => {
  const { data: config, reload: reloadConfig } = useConfig();
  const { data: prompts, reload: reloadPrompts } = usePrompts();
  const { data: hashtags, reload: reloadHashtags } = useHashtags();
  const { data: pageSettings } = usePageSettings();
  const { data: videoCfg } = useVideoConfig();
  const [section, setSection] = React.useState<Section>('app');
  const [status, setStatus] = React.useState<string>('');

  // Tone management derived from config
  const allTones = React.useMemo<ContentTone[]>(
    () => buildTones(config.customContentTones),
    [config.customContentTones]
  );
  const enabledToneIds = React.useMemo<string[]>(
    () => enabledTones(config.enabledContentTones),
    [config.enabledContentTones]
  );

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 3000);
  };

  const saveConfigPatch = async (patch: Partial<typeof config>) => {
    try {
      await fbFetch('config', { method: 'POST', body: { ...config, ...patch } });
      reloadConfig();
    } catch (err) {
      showStatus(`Lỗi lưu: ${(err as Error).message}`);
    }
  };

  const handleToggleTone = async (id: string, on: boolean) => {
    const next = toggleToneId(enabledToneIds, id, on);
    await saveConfigPatch({ enabledContentTones: JSON.stringify(next) });
    showStatus(on ? `Đã bật tone ${id}` : `Đã tắt tone ${id}`);
  };

  const handleAddCustomTone = async (name: string, description: string) => {
    const next = addCustomTone(allTones, name, description);
    await saveConfigPatch({ customContentTones: customsToJson(next) });
    showStatus(`Đã thêm tone "${name}"`);
  };

  const handleDeleteCustomTone = async (id: string) => {
    const next = deleteCustomTone(allTones, id);
    const nextEnabled = enabledToneIds.filter((tid) => tid !== id);
    await saveConfigPatch({
      customContentTones: customsToJson(next),
      enabledContentTones: JSON.stringify(nextEnabled),
    });
    showStatus('Đã xóa tone');
  };

  const handleUpdateCustomTone = async (id: string, name: string, description: string) => {
    const next = updateCustomTone(allTones, id, name, description);
    await saveConfigPatch({ customContentTones: customsToJson(next) });
    showStatus('Đã cập nhật tone');
  };

  const addHashtag = async (tag: string, category?: string) => {
    try {
      await fbFetch('hashtags', { method: 'POST', body: { tag, category } });
      reloadHashtags();
      showStatus(`Đã thêm ${tag}`);
    } catch (err) {
      showStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  const deleteHashtag = async (tag: string) => {
    try {
      await fbFetch(`hashtags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
      reloadHashtags();
      showStatus(`Đã xóa ${tag}`);
    } catch (err) {
      showStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  const addPrompt = async (draft: Omit<import('../lib/types').PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await fbFetch('prompt-templates', { method: 'POST', body: draft });
      reloadPrompts();
      showStatus('Đã thêm template');
    } catch (err) {
      showStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  const editPrompt = async (t: import('../lib/types').PromptTemplate) => {
    try {
      await fbFetch(`prompt-templates/${encodeURIComponent(t.id)}`, { method: 'POST', body: t });
      reloadPrompts();
      showStatus('Đã cập nhật template');
    } catch (err) {
      showStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  const deletePrompt = async (t: import('../lib/types').PromptTemplate) => {
    try {
      await fbFetch(`prompt-templates/${encodeURIComponent(t.id)}`, { method: 'DELETE' });
      reloadPrompts();
      showStatus('Đã xóa template');
    } catch (err) {
      showStatus(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <div className="fb-tab fb-tab--settings">
      <PageHeader
        title="Cấu hình"
        subtitle="App credentials · AI · Prompt · Tone · Hashtag · AI theo trang"
        actions={<Tabs<Section> items={SECTIONS} value={section} onChange={setSection} size="sm" />}
      />
      {section === 'app' && (
        <Card title="Cấu hình chung" subtitle="Đọc từ .env (không commit)">
          <ul className="fb-info-grid">
            <li><span className="fb-muted">Webhook URL</span><strong>https://&lt;host&gt;/api/v1/facebook/webhook</strong></li>
            <li><span className="fb-muted">Default page</span><strong>{config.defaultPageId ?? '—'}</strong></li>
          </ul>
        </Card>
      )}
      {section === 'pages' && (
        <div className="fb-grid-2">
          {pageSettings.map((s) => (
            <PageSettingsCard key={s.pageId} settings={s} />
          ))}
        </div>
      )}
      {section === 'prompts' && (
        <PromptTemplateList
          templates={prompts}
          onAdd={addPrompt}
          onEdit={editPrompt}
          onDelete={deletePrompt}
        />
      )}
      {section === 'tones' && (
        <TonePicker
          tones={allTones}
          enabledIds={enabledToneIds}
          onToggleEnabled={handleToggleTone}
          onAddCustom={handleAddCustomTone}
          onDeleteCustom={handleDeleteCustomTone}
          onUpdateCustom={handleUpdateCustomTone}
        />
      )}
      {section === 'hashtags' && (
        <HashtagBank
          items={hashtags}
          onAdd={addHashtag}
          onDelete={deleteHashtag}
        />
      )}
      {section === 'video' && (
        <Card title="Video config" subtitle="Watermark settings">
          <ul className="fb-info-grid">
            <li><span className="fb-muted">Watermark type</span><strong>{videoCfg.watermarkType}</strong></li>
            <li><span className="fb-muted">Watermark text</span><strong>{videoCfg.watermarkText || '—'}</strong></li>
            <li><span className="fb-muted">Watermark image</span><strong>{videoCfg.watermarkImagePath || '—'}</strong></li>
          </ul>
        </Card>
      )}
      {status && <p className="fb-muted fb-mono fb-status">{status}</p>}
    </div>
  );
};

export default SettingsTab;
