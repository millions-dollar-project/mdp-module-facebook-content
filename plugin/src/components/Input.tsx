import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...rest }, ref) => {
    const cls = ['fb-input', invalid ? 'fb-input--invalid' : '', className ?? '']
      .filter(Boolean)
      .join(' ');
    return <input ref={ref} className={cls} {...rest} />;
  }
);
Input.displayName = 'Input';

export default Input;
