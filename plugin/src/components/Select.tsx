import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
  invalid?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, placeholder, invalid, className, ...rest }, ref) => {
    const cls = ['fb-input', 'fb-select', invalid ? 'fb-input--invalid' : '', className ?? '']
      .filter(Boolean)
      .join(' ');
    return (
      <select ref={ref} className={cls} {...rest}>
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
);
Select.displayName = 'Select';

export default Select;
