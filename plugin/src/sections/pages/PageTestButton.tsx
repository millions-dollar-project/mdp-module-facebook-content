import React from 'react';
import { Button, Badge } from '../../components';
import type { FacebookPage } from '../../lib/types';

export interface PageTestButtonProps {
  page: FacebookPage;
  onClick: () => void;
  loading?: boolean;
  result?: 'idle' | 'ok' | 'fail';
}

export const PageTestButton: React.FC<PageTestButtonProps> = ({ page, onClick, loading, result = 'idle' }) => {
  return (
    <div className="fb-page-test">
      <Button size="sm" variant="ghost" onClick={onClick} loading={loading}>
        Test kết nối
      </Button>
      {result === 'ok' && <Badge tone="success">✓ OK</Badge>}
      {result === 'fail' && <Badge tone="danger">✗ Thất bại</Badge>}
      <span className="fb-muted">→ {page.pageName}</span>
    </div>
  );
};

export default PageTestButton;
