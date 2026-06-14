import React from 'react';
import { Button } from '../../components';

export interface PublishButtonProps {
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
}

export const PublishButton: React.FC<PublishButtonProps> = ({ loading, disabled, onClick, label = 'Đăng ngay' }) => {
  return (
    <Button variant="primary" size="lg" loading={loading} disabled={disabled} onClick={onClick} fullWidth>
      {label}
    </Button>
  );
};

export default PublishButton;
