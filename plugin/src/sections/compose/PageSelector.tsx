import React from 'react';
import { Card, Badge } from '../../components';
import type { FacebookPage } from '../../lib/types';

export interface PageSelectorProps {
  pages: FacebookPage[];
  selected: string[];
  onChange: (selected: string[]) => void;
  multi?: boolean;
}

export const PageSelector: React.FC<PageSelectorProps> = ({ pages, selected, onChange, multi = true }) => {
  const toggle = (id: string) => {
    if (multi) {
      onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    } else {
      onChange([id]);
    }
  };
  return (
    <Card title="Chọn trang" subtitle={multi ? 'Có thể chọn nhiều trang để đăng cùng lúc' : 'Chọn 1 trang'}>
      <ul className="fb-page-list">
        {pages.filter((p) => p.isActive).map((p) => {
          const isOn = selected.includes(p.pageId);
          return (
            <li
              key={p.id}
              className={['fb-page-list__item', isOn ? 'fb-page-list__item--on' : ''].filter(Boolean).join(' ')}
              onClick={() => toggle(p.pageId)}
            >
              <span className="fb-page-list__name">{p.pageName}</span>
              <span className="fb-page-list__id">{p.pageId}</span>
              <div className="fb-page-list__flags">
                {p.postingEnabled && <Badge tone="brand">Đăng bài</Badge>}
                {p.aiEnabled && <Badge tone="success">AI</Badge>}
                {!p.postingEnabled && <Badge tone="neutral">Tạm dừng</Badge>}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

export default PageSelector;
