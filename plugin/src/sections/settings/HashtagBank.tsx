import React from 'react';
import { Card, Input, Button, Badge } from '../../components';
import type { HashtagEntry } from '../../lib/types';

export interface HashtagBankProps {
  items: HashtagEntry[];
  onAdd: (tag: string, category?: string) => void;
  onDelete: (tag: string) => void;
}

export const HashtagBank: React.FC<HashtagBankProps> = ({ items, onAdd, onDelete }) => {
  const [tag, setTag] = React.useState('');
  const [category, setCategory] = React.useState('');
  const submit = () => {
    const t = tag.trim();
    if (!t) return;
    onAdd(t.startsWith('#') ? t : `#${t}`, category || undefined);
    setTag('');
    setCategory('');
  };
  return (
    <Card title="Hashtag bank" subtitle="Các hashtag dùng nhiều — AI sẽ tự chọn khi sinh nội dung">
      <div className="fb-hashtag-add">
        <Input placeholder="#EcoHome" value={tag} onChange={(e) => setTag(e.currentTarget.value)} />
        <Input placeholder="Danh mục (tuỳ chọn)" value={category} onChange={(e) => setCategory(e.currentTarget.value)} />
        <Button onClick={submit}>Thêm</Button>
      </div>
      <ul className="fb-hashtag-list">
        {items.map((h) => (
          <li key={h.tag} className="fb-hashtag-chip">
            <span className="fb-hashtag-chip__tag">{h.tag}</span>
            {h.category && <Badge tone="info">{h.category}</Badge>}
            <Button size="sm" variant="ghost" onClick={() => onDelete(h.tag)}>×</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
};

export default HashtagBank;
