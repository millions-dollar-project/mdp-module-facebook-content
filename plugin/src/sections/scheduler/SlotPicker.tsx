import React from 'react';
import { Button } from '../../components';

export const GOLDEN_HOURS = [8, 12, 18, 20];

export interface SlotPickerProps {
  value: number[]; // hours
  onChange: (hours: number[]) => void;
}

export const SlotPicker: React.FC<SlotPickerProps> = ({ value, onChange }) => {
  const toggle = (h: number) => {
    onChange(value.includes(h) ? value.filter((x) => x !== h) : [...value, h].sort((a, b) => a - b));
  };
  return (
    <div className="fb-slot-picker">
      {GOLDEN_HOURS.map((h) => (
        <Button
          key={h}
          size="sm"
          variant={value.includes(h) ? 'primary' : 'ghost'}
          onClick={() => toggle(h)}
        >
          {h}:00
        </Button>
      ))}
    </div>
  );
};

export default SlotPicker;
