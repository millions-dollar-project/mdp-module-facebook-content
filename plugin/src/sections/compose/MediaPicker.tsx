import React from 'react';
import { Card, Button } from '../../components';

export interface MediaPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

export const MediaPicker: React.FC<MediaPickerProps> = ({ files, onChange, disabled }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    onChange([...files, ...list].slice(0, 10));
    e.target.value = '';
  };
  const remove = (idx: number) => onChange(files.filter((_, i) => i !== idx));
  return (
    <Card title="Media đính kèm" subtitle="Tối đa 10 file — JPG/PNG/MP4/MOV">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={onPick}
        disabled={disabled}
        className="fb-file-input"
      />
      {files.length === 0 ? (
        <p className="fb-muted">Chưa có file. Có thể dán URL ảnh ở form bên trái.</p>
      ) : (
        <ul className="fb-media-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className="fb-media-list__name">{f.name}</span>
              <span className="fb-media-list__size">{(f.size / 1024).toFixed(1)} KB</span>
              <Button size="sm" variant="ghost" onClick={() => remove(i)}>Xóa</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default MediaPicker;
