import React from 'react';

export interface FormFieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}) => {
  return (
    <div className={['fb-field', className ?? ''].filter(Boolean).join(' ')}>
      {label && (
        <label className="fb-field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="fb-field__required" aria-hidden> *</span>}
        </label>
      )}
      <div className="fb-field__control">{children}</div>
      {error ? (
        <p className="fb-field__error" role="alert">{error}</p>
      ) : hint ? (
        <p className="fb-field__hint">{hint}</p>
      ) : null}
    </div>
  );
};

export const Form: React.FC<React.FormHTMLAttributes<HTMLFormElement>> = ({ className, children, ...rest }) => {
  return (
    <form className={['fb-form', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </form>
  );
};

export default FormField;
