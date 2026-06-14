import React from 'react';
import { Badge } from '../../components';
import type { HeatLevel } from '../../lib/types';

export interface HeatBadgeProps {
  heat: HeatLevel;
  withLabel?: boolean;
}

const tone: Record<HeatLevel, 'hot' | 'warm' | 'cold' | 'neutral'> = {
  hot: 'hot',
  warm: 'warm',
  cold: 'cold',
  unknown: 'neutral',
};
const label: Record<HeatLevel, string> = {
  hot: 'Nóng',
  warm: 'Ấm',
  cold: 'Lạnh',
  unknown: '—',
};

export const HeatBadge: React.FC<HeatBadgeProps> = ({ heat, withLabel = true }) => {
  return <Badge tone={tone[heat]}>{withLabel ? label[heat] : '●'}</Badge>;
};

export default HeatBadge;
