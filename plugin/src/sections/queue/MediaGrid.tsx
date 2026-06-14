import React from 'react';

export interface MediaGridProps {
  urls: string[];
  onRemove?: (idx: number) => void;
  max?: number;
}

export const MediaGrid: React.FC<MediaGridProps> = ({ urls, onRemove, max = 4 }) => {
  const visible = urls.slice(0, max);
  return (
    <div className="fb-media-grid">
      {visible.map((u, i) => (
        <div key={i} className="fb-media-grid__cell">
          <img src={u} alt="" />
          {onRemove && (
            <button type="button" className="fb-media-grid__remove" onClick={() => onRemove(i)} aria-label="Xóa">×</button>
          )}
        </div>
      ))}
      {urls.length > max && <div className="fb-media-grid__more">+{urls.length - max}</div>}
    </div>
  );
};

export default MediaGrid;
