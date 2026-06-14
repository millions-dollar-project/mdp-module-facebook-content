import React from 'react';
import { FormField, Textarea, Input } from '../../components';

export interface PostFormValue {
  content: string;
  imageUrl: string;
  link: string;
}

export interface PostFormProps {
  value: PostFormValue;
  onChange: (next: PostFormValue) => void;
  disabled?: boolean;
}

export const PostForm: React.FC<PostFormProps> = ({ value, onChange, disabled }) => {
  return (
    <>
      <FormField label="Nội dung" required hint="Có thể kèm emoji và hashtag.">
        <Textarea
          rows={6}
          autoSize
          placeholder="Bạn đang nghĩ gì trên Facebook?"
          value={value.content}
          onChange={(e) => onChange({ ...value, content: e.currentTarget.value })}
          disabled={disabled}
        />
      </FormField>
      <FormField label="Ảnh minh họa" hint="Dán URL ảnh hoặc bỏ trống.">
        <Input
          type="url"
          placeholder="https://..."
          value={value.imageUrl}
          onChange={(e) => onChange({ ...value, imageUrl: e.currentTarget.value })}
          disabled={disabled}
        />
      </FormField>
      <FormField label="Link đính kèm" hint="Tùy chọn — gắn link bài viết ngoài.">
        <Input
          type="url"
          placeholder="https://..."
          value={value.link}
          onChange={(e) => onChange({ ...value, link: e.currentTarget.value })}
          disabled={disabled}
        />
      </FormField>
    </>
  );
};

export default PostForm;
