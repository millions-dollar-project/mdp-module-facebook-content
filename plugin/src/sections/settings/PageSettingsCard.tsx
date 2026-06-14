import React from 'react';
import { Card, Badge, Button } from '../../components';
import type { PageSettings } from '../../lib/types';

export interface PageSettingsCardProps {
  settings: PageSettings;
  onChange?: (s: PageSettings) => void;
}

export const PageSettingsCard: React.FC<PageSettingsCardProps> = ({ settings, onChange }) => {
  const toggle = (key: keyof PageSettings) => {
    if (!onChange) return;
    const v = settings[key];
    onChange({ ...settings, [key]: !v } as PageSettings);
  };
  return (
    <Card title={settings.pageName} subtitle="Cấu hình AI cho trang này" actions={onChange ? <Badge tone={settings.aiEnabled ? 'success' : 'neutral'}>{settings.aiEnabled ? 'AI ON' : 'AI OFF'}</Badge> : undefined}>
      <ul className="fb-page-settings">
        <li>
          <span>Tự động trả lời Messenger</span>
          {onChange ? <Button size="sm" variant={settings.autoReplyEnabled ? 'primary' : 'ghost'} onClick={() => toggle('autoReplyEnabled')}>{settings.autoReplyEnabled ? 'Bật' : 'Tắt'}</Button> : <Badge tone={settings.autoReplyEnabled ? 'success' : 'neutral'}>{settings.autoReplyEnabled ? 'Bật' : 'Tắt'}</Badge>}
        </li>
        <li>
          <span>Tự động like comment</span>
          {onChange ? <Button size="sm" variant={settings.autoLikeEnabled ? 'primary' : 'ghost'} onClick={() => toggle('autoLikeEnabled')}>{settings.autoLikeEnabled ? 'Bật' : 'Tắt'}</Button> : <Badge tone={settings.autoLikeEnabled ? 'success' : 'neutral'}>{settings.autoLikeEnabled ? 'Bật' : 'Tắt'}</Badge>}
        </li>
        <li>
          <span>Thu thập thông tin liên hệ</span>
          {onChange ? <Button size="sm" variant={settings.contactCollectionEnabled ? 'primary' : 'ghost'} onClick={() => toggle('contactCollectionEnabled')}>{settings.contactCollectionEnabled ? 'Bật' : 'Tắt'}</Button> : <Badge tone={settings.contactCollectionEnabled ? 'success' : 'neutral'}>{settings.contactCollectionEnabled ? 'Bật' : 'Tắt'}</Badge>}
        </li>
        <li>
          <span>Giới hạn lượt AI / hội thoại</span>
          {onChange ? (
            <input
              type="number"
              min={1}
              max={50}
              value={settings.maxAiTurns}
              onChange={(e) => onChange({ ...settings, maxAiTurns: Number(e.currentTarget.value) })}
            />
          ) : (
            <Badge tone="brand">{settings.maxAiTurns} lượt</Badge>
          )}
        </li>
      </ul>
    </Card>
  );
};

export default PageSettingsCard;
