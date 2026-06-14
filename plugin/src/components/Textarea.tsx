import React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  autoSize?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, autoSize, onInput, ...rest }, ref) => {
    const cls = ['fb-input', 'fb-textarea', invalid ? 'fb-input--invalid' : '', className ?? '']
      .filter(Boolean)
      .join(' ');
    return (
      <textarea
        ref={ref}
        className={cls}
        onInput={(e) => {
          if (autoSize) {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = `${t.scrollHeight}px`;
          }
          onInput?.(e);
        }}
        {...rest}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export default Textarea;
