import React from 'react';
import { Card, Button, Badge } from '../../components';
import type { ContentTone } from '../../lib/types';

export interface TonePickerProps {
  tones: ContentTone[];
  enabledIds: string[];
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onAddCustom?: (name: string, description: string) => void;
  onDeleteCustom?: (id: string) => void;
  onUpdateCustom?: (id: string, name: string, description: string) => void;
  maxCustom?: number;
}

export const TonePicker: React.FC<TonePickerProps> = ({
  tones,
  enabledIds,
  onToggleEnabled,
  onAddCustom,
  onDeleteCustom,
  onUpdateCustom,
  maxCustom = 15,
}) => {
  const [name, setName] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editDesc, setEditDesc] = React.useState('');

  const customCount = tones.filter((t) => t.isCustom).length;
  const enabledSet = new Set(enabledIds);

  return (
    <Card title="Content tones" subtitle={`Giọng văn cho AI — tối đa ${maxCustom} custom`}>
      <ul className="fb-tone-list">
        {tones.map((t) => {
          const isEnabled = enabledSet.has(t.id);
          return (
            <li key={t.id} className={`fb-tone ${isEnabled ? 'fb-tone--on' : ''}`}>
              <div className="fb-tone__head">
                <label className="fb-tone__label">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => onToggleEnabled(t.id, e.currentTarget.checked)}
                  />
                  <strong>{t.name}</strong>
                </label>
                {t.isCustom && <Badge tone="info">custom</Badge>}
                {!isEnabled && <Badge tone="neutral">tắt</Badge>}
              </div>
              <p className="fb-tone__desc">{t.description}</p>
              {t.isCustom && (
                <div className="fb-tone__actions">
                  {onUpdateCustom && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(t.id);
                        setEditName(t.name);
                        setEditDesc(t.description);
                      }}
                    >
                      Sửa
                    </Button>
                  )}
                  {onDeleteCustom && (
                    <Button size="sm" variant="danger" onClick={() => onDeleteCustom(t.id)}>
                      Xóa
                    </Button>
                  )}
                </div>
              )}

              {editingId === t.id && (
                <div className="fb-tone-edit">
                  <input
                    placeholder="Tên tone"
                    value={editName}
                    onChange={(e) => setEditName(e.currentTarget.value)}
                  />
                  <input
                    placeholder="Mô tả ngắn"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.currentTarget.value)}
                  />
                  <div className="fb-tone-edit__actions">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!editName.trim() || !editDesc.trim()) return;
                        onUpdateCustom?.(t.id, editName.trim(), editDesc.trim());
                        setEditingId(null);
                      }}
                    >
                      Lưu
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Hủy
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {onAddCustom && customCount < maxCustom && (
        <div className="fb-tone-add">
          <input
            placeholder="Tên tone mới"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <input
            placeholder="Mô tả ngắn"
            value={desc}
            onChange={(e) => setDesc(e.currentTarget.value)}
          />
          <Button
            onClick={() => {
              if (!name.trim() || !desc.trim()) return;
              onAddCustom(name.trim(), desc.trim());
              setName('');
              setDesc('');
            }}
          >
            Thêm
          </Button>
        </div>
      )}
    </Card>
  );
};

export default TonePicker;
