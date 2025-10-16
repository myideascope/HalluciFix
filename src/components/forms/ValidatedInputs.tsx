import React, { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';
import { FormField } from './FormField';
import { useFormValidation, FormError as FormErrorType } from '../../lib/formValidation';

// Base input component with validation integration
interface ValidatedInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onBlur'> {
  label: string;
  error?: FormErrorType | null;
  success?: string;
  isValidating?: boolean;
  helpText?: string;
  description?: string;
  onValueChange?: (value: string) => void;
  onFieldBlur?: (value: string) => void;
  containerClassName?: string;
  labelClassName?: string;
}

export const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>(({
  label,
  error,
  success,
  isValidating,
  helpText,
  description,
  required,
  onValueChange,
  onFieldBlur,
  containerClassName,
  labelClassName,
  className = '',
  ...inputProps
}, ref) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange?.(e.target.value);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    onFieldBlur?.(e.target.value);
  };

  const baseInputStyles = `
    block w-full px-3 py-2 text-sm
    bg-white border rounded-md shadow-sm
    placeholder-slate-400
    focus:outline-none focus:ring-2 focus:ring-offset-0
    disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
    transition-colors duration-200
  `;

  return (
    <FormField
      label={label}
      error={error}
      success={success}
      isValidating={isValidating}
      required={required}
      helpText={helpText}
      description={description}
      className={containerClassName}
      labelClassName={labelClassName}
    >
      <input
        ref={ref}
        className={`${baseInputStyles} ${className}`}
        onChange={handleChange}
        onBlur={handleBlur}
        {...inputProps}
      />
    </FormField>
  );
});

ValidatedInput.displayName = 'ValidatedInput';

// Textarea component with validation integration
interface ValidatedTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'onBlur'> {
  label: string;
  error?: FormErrorType | null;
  success?: string;
  isValidating?: boolean;
  helpText?: string;
  description?: string;
  onValueChange?: (value: string) => void;
  onFieldBlur?: (value: string) => void;
  containerClassName?: string;
  labelClassName?: string;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

export const ValidatedTextarea = forwardRef<HTMLTextAreaElement, ValidatedTextareaProps>(({
  label,
  error,
  success,
  isValidating,
  helpText,
  description,
  required,
  onValueChange,
  onFieldBlur,
  containerClassName,
  labelClassName,
  className = '',
  resize = 'vertical',
  rows = 3,
  ...textareaProps
}, ref) => {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange?.(e.target.value);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    onFieldBlur?.(e.target.value);
  };

  const baseTextareaStyles = `
    block w-full px-3 py-2 text-sm
    bg-white border rounded-md shadow-sm
    placeholder-slate-400
    focus:outline-none focus:ring-2 focus:ring-offset-0
    disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
    transition-colors duration-200
  `;

  const resizeClass = {
    none: 'resize-none',
    vertical: 'resize-y',
    horizontal: 'resize-x',
    both: 'resize'
  }[resize];

  return (
    <FormField
      label={label}
      error={error}
      success={success}
      isValidating={isValidating}
      required={required}
      helpText={helpText}
      description={description}
      className={containerClassName}
      labelClassName={labelClassName}
    >
      <textarea
        ref={ref}
        rows={rows}
        className={`${baseTextareaStyles} ${resizeClass} ${className}`}
        onChange={handleChange}
        onBlur={handleBlur}
        {...textareaProps}
      />
    </FormField>
  );
});

ValidatedTextarea.displayName = 'ValidatedTextarea';

// Select component with validation integration
interface ValidatedSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'onBlur'> {
  label: string;
  error?: FormErrorType | null;
  success?: string;
  isValidating?: boolean;
  helpText?: string;
  description?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  onValueChange?: (value: string) => void;
  onFieldBlur?: (value: string) => void;
  containerClassName?: string;
  labelClassName?: string;
}

export const ValidatedSelect = forwardRef<HTMLSelectElement, ValidatedSelectProps>(({
  label,
  error,
  success,
  isValidating,
  helpText,
  description,
  required,
  options,
  placeholder,
  onValueChange,
  onFieldBlur,
  containerClassName,
  labelClassName,
  className = '',
  ...selectProps
}, ref) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onValueChange?.(e.target.value);
  };

  const handleBlur = (e: React.FocusEvent<HTMLSelectElement>) => {
    onFieldBlur?.(e.target.value);
  };

  const baseSelectStyles = `
    block w-full px-3 py-2 text-sm
    bg-white border rounded-md shadow-sm
    focus:outline-none focus:ring-2 focus:ring-offset-0
    disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
    transition-colors duration-200
    appearance-none
    bg-no-repeat bg-right
    pr-10
  `;

  // Custom dropdown arrow using CSS
  const selectWithArrow = `
    ${baseSelectStyles}
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e");
    background-position: right 0.5rem center;
    background-size: 1.5em 1.5em;
  `;

  return (
    <FormField
      label={label}
      error={error}
      success={success}
      isValidating={isValidating}
      required={required}
      helpText={helpText}
      description={description}
      className={containerClassName}
      labelClassName={labelClassName}
    >
      <select
        ref={ref}
        className={`${selectWithArrow} ${className}`}
        onChange={handleChange}
        onBlur={handleBlur}
        {...selectProps}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
});

ValidatedSelect.displayName = 'ValidatedSelect';

// Checkbox component with validation integration
interface ValidatedCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onBlur' | 'type'> {
  label: string;
  error?: FormErrorType | null;
  success?: string;
  isValidating?: boolean;
  helpText?: string;
  description?: string;
  onValueChange?: (checked: boolean) => void;
  onFieldBlur?: (checked: boolean) => void;
  containerClassName?: string;
  labelClassName?: string;
}

export const ValidatedCheckbox = forwardRef<HTMLInputElement, ValidatedCheckboxProps>(({
  label,
  error,
  success,
  isValidating,
  helpText,
  description,
  required,
  onValueChange,
  onFieldBlur,
  containerClassName,
  labelClassName,
  className = '',
  ...inputProps
}, ref) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange?.(e.target.checked);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    onFieldBlur?.(e.target.checked);
  };

  const baseCheckboxStyles = `
    h-4 w-4 text-blue-600 
    border-slate-300 rounded
    focus:ring-2 focus:ring-blue-500 focus:ring-offset-0
    disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
    transition-colors duration-200
  `;

  return (
    <div className={`space-y-1 ${containerClassName}`}>
      <div className="flex items-start space-x-3">
        <input
          ref={ref}
          type="checkbox"
          className={`${baseCheckboxStyles} ${className} mt-1`}
          onChange={handleChange}
          onBlur={handleBlur}
          {...inputProps}
        />
        <div className="flex-1">
          <label
            htmlFor={inputProps.id}
            className={`block text-sm font-medium ${
              error ? 'text-red-700' : success ? 'text-green-700' : 'text-slate-700'
            } ${labelClassName}`}
          >
            {label}
            {required && (
              <span 
                className="text-red-500 ml-1" 
                aria-label="required"
                title="This field is required"
              >
                *
              </span>
            )}
          </label>
          
          {description && (
            <p className="mt-1 text-sm text-slate-600">
              {description}
            </p>
          )}
          
          {helpText && !error && !success && !isValidating && (
            <p className="mt-1 text-sm text-slate-500">
              {helpText}
            </p>
          )}
          
          {isValidating && (
            <div className="mt-1 text-sm text-blue-600 flex items-center space-x-1">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
              <span>Validating...</span>
            </div>
          )}
          
          {error && (
            <div className="mt-1 text-sm text-red-600 flex items-start space-x-1">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error.message}</span>
            </div>
          )}
          
          {success && (
            <div className="mt-1 text-sm text-green-600 flex items-start space-x-1">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>{success}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

ValidatedCheckbox.displayName = 'ValidatedCheckbox';