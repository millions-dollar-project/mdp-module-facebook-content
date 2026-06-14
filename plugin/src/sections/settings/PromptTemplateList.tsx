import React from 'react';
import { Card, Button, EmptyState, Badge, Input } from '../../components';
import type { PromptTemplate } from '../../lib/types';

export interface PromptTemplateListProps {
  templates: PromptTemplate[];
  onAdd?: (t: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onEdit?: (t: PromptTemplate) => void;
  onDelete?: (t: PromptTemplate) => void;
  loading?: boolean;
}

const emptyTemplate: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  category: 'campaign_content',
  promptText: '',
  variablesJson: '[]',
  description: '',
  isActive: true,
  supportedTones: '[]',
};

export const PromptTemplateList: React.FC<PromptTemplateListProps> = ({
  templates,
  onAdd,
  onEdit,
  onDelete,
  loading,
}) => {
  const [isAdding, setIsAdding] = React.useState(false);
  const [draft, setDraft] = React.useState(emptyTemplate);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<PromptTemplate | null>(null);

  if (loading) return <Card title="Prompt templates"><p className="fb-muted">Đang tải…</p></Card>;

  return (
    <Card
      title="Prompt templates"
      subtitle="Dùng cho AI sinh nội dung — chỉnh tone, thêm ví dụ"
      actions={onAdd && <Button onClick={() => { setIsAdding(true); setDraft(emptyTemplate); }}>+ Thêm template</Button>}
      padded={false}
    >
      {isAdding && onAdd && (
        <div className="fb-prompt-form">
          <Input
            placeholder="Tên template"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
          />
          <Input
            placeholder="Category (e.g. campaign_content, product, repost)"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.currentTarget.value })}
          />
          <textarea
            className="fb-textarea"
            rows={4}
            placeholder="Prompt text…"
            value={draft.promptText}
            onChange={(e) => setDraft({ ...draft, promptText: e.currentTarget.value })}
          />
          <Input
            placeholder="Variables JSON (e.g. [topic, tone])"
            value={draft.variablesJson}
            onChange={(e) => setDraft({ ...draft, variablesJson: e.currentTarget.value })}
          />
          <Input
            placeholder="Mô tả ngắn"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.currentTarget.value })}
          />
          <label className="fb-prompt-form__check">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.currentTarget.checked })}
            />
            Đang bật
          </label>
          <div className="fb-prompt-form__actions">
            <Button
              onClick={() => {
                if (!draft.name.trim() || !draft.promptText.trim()) return;
                onAdd(draft);
                setIsAdding(false);
                setDraft(emptyTemplate);
              }}
            >
              Lưu
            </Button>
            <Button variant="ghost" onClick={() => setIsAdding(false)}>Hủy</Button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <EmptyState title="Chưa có template" subtitle="Tạo template để AI viết đúng giọng EcoHome." />
      ) : (
        <ul className="fb-prompt-list">
          {templates.map((t) => (
            <li key={t.id} className="fb-prompt-item">
              {editingId === t.id && editDraft ? (
                <div className="fb-prompt-form">
                  <Input
                    placeholder="Tên template"
                    value={editDraft.name}
                    onChange={(e) => setEditDraft({ ...editDraft, name: e.currentTarget.value })}
                  />
                  <Input
                    placeholder="Category"
                    value={editDraft.category}
                    onChange={(e) => setEditDraft({ ...editDraft, category: e.currentTarget.value })}
                  />
                  <textarea
                    className="fb-textarea"
                    rows={4}
                    placeholder="Prompt text…"
                    value={editDraft.promptText}
                    onChange={(e) => setEditDraft({ ...editDraft, promptText: e.currentTarget.value })}
                  />
                  <Input
                    placeholder="Variables JSON"
                    value={editDraft.variablesJson}
                    onChange={(e) => setEditDraft({ ...editDraft, variablesJson: e.currentTarget.value })}
                  />
                  <Input
                    placeholder="Mô tả ngắn"
                    value={editDraft.description}
                    onChange={(e) => setEditDraft({ ...editDraft, description: e.currentTarget.value })}
                  />
                  <label className="fb-prompt-form__check">
                    <input
                      type="checkbox"
                      checked={editDraft.isActive}
                      onChange={(e) => setEditDraft({ ...editDraft, isActive: e.currentTarget.checked })}
                    />
                    Đang bật
                  </label>
                  <div className="fb-prompt-form__actions">
                    <Button
                      onClick={() => {
                        if (!editDraft.name.trim() || !editDraft.promptText.trim()) return;
                        onEdit?.(editDraft);
                        setEditingId(null);
                      }}
                    >
                      Lưu
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>Hủy</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="fb-prompt-item__head">
                    <strong>{t.name}</strong>
                    <Badge tone="info">{t.category}</Badge>
                    {t.isActive && <Badge tone="success">đang bật</Badge>}
                    <span className="fb-muted">{t.variablesJson}</span>
                  </div>
                  {t.description && <p className="fb-muted">{t.description}</p>}
                  <pre className="fb-prompt-item__body">{t.promptText}</pre>
                  <div className="fb-prompt-item__actions">
                    {onEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(t.id);
                          setEditDraft({ ...t });
                        }}
                      >
                        Sửa
                      </Button>
                    )}
                    {onDelete && (
                      <Button size="sm" variant="danger" onClick={() => onDelete(t)}>Xóa</Button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default PromptTemplateList;
