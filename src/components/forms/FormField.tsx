import React, { ReactElement, cloneElement, useId } from 'react';
import { FormError, FormSuccess, FormValidating } from './FormError';
import { FormError as FormErrorType } from '../../lib/formValidation';

interface FormFieldProps {
  label: string;
  error?: FormErrorType | null;
  success?: string;
  isValidating?: boolean;
  required?: boolean;
  optional?: boolean;
  children: ReactElement;
  helpText?: string;
  className?: string;
  labelClassName?: string;
  description?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  success,
  isValidating,
  required,
  optional,
  children,
  helpText,
  className = '',
  labelClassName = '',
  description
}) => {
  const generatedId = useId();
  const fieldId = children.props.id || generatedId;
  const hasError = !!error;
  const hasSuccess = !!success && !hasError && !isValidating;

  // Generate describedBy IDs
  const describedByIds = [
    error ? `${fieldId}-error` : null,
    success ? `${fieldId}-success` : null,
    isValidating ? `${fieldId}-validating` : null,
    helpText ? `${fieldId}-help` : null,
    description ? `${fieldId}-description` : null
  ].filter(Boolean);

  const describedBy = describedByIds.length > 0 ? describedByIds.join(' ') : undefined;

  // Determine field styling based on state
  const getFieldStyles = () => {
    if (hasError) {
      return 'border-red-300 focus:border-red-500 focus:ring-red-500';
    }
    if (hasSuccess) {
      return 'border-green-300 focus:border-green-500 focus:ring-green-500';
    }
    if (isValidating) {
      return 'border-blue-300 focus:border-blue-500 focus:ring-blue-500';
    }
    return 'border-slate-300 focus:border-blue-500 focus:ring-blue-500';
  };

  // Clone the input element with proper accessibility attributes
  const enhancedInput = cloneElement(children, {
    id: fieldId,
    'aria-invalid': hasError,
    'aria-describedby': describedBy,
    'aria-required': required,
    className: `${children.props.className || ''} ${getFieldStyles()}`.trim()
  });

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Label */}
      <label
        htmlFor={fieldId}
        className={`block text-sm font-medium ${
          hasError 
            ? 'text-red-700' 
            : hasSuccess 
              ? 'text-green-700'
              : 'text-slate-700'
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
        {optional && !required && (
          <span 
            className="text-slate-500 ml-1 font-normal text-xs"
            aria-label="optional"
          >
            (optional)
          </span>
        )}
      </label>

      {/* Description */}
      {description && (
        <p 
          id={`${fieldId}-description`} 
          className="text-sm text-slate-600"
        >
          {description}
        </p>
      )}

      {/* Input Field */}
      <div className="relative">
        {enhancedInput}
        
        {/* Visual indicators */}
        {(hasError || hasSuccess || isValidating) && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            {hasError && (
              <svg 
                className="h-5 w-5 text-red-500" 
                fill="currentColor" 
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path 
                  fillRule="evenodd" 
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" 
                  clipRule="evenodd" 
                />
              </svg>
            )}
            {hasSuccess && (
              <svg 
                className="h-5 w-5 text-green-500" 
                fill="currentColor" 
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path 
                  fillRule="evenodd" 
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" 
                  clipRule="evenodd" 
                />
              </svg>
            )}
            {isValidating && (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
            )}
          </div>
        )}
      </div>

      {/* Help Text */}
      {helpText && !hasError && !hasSuccess && !isValidating && (
        <p 
          id={`${fieldId}-help`} 
          className="text-sm text-slate-500"
        >
          {helpText}
        </p>
      )}

      {/* Validation States */}
      {isValidating && (
        <FormValidating fieldId={fieldId} />
      )}
      
      {hasError && (
        <FormError error={error} fieldId={fieldId} />
      )}
      
      {hasSuccess && (
        <FormSuccess message={success} fieldId={fieldId} />
      )}
    </div>
  );
};

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  children,
  className = '',
  required
}) => {
  const sectionId = useId();

  return (
    <fieldset className={`space-y-4 ${className}`}>
      <legend className="sr-only">{title}</legend>
      
      <div className="border-b border-slate-200 pb-4">
        <h3 
          id={`${sectionId}-title`}
          className="text-lg font-medium text-slate-900"
        >
          {title}
          {required && (
            <span 
              className="text-red-500 ml-1" 
              aria-label="required section"
              title="This section contains required fields"
            >
              *
            </span>
          )}
        </h3>
        {description && (
          <p 
            id={`${sectionId}-description`}
            className="mt-1 text-sm text-slate-600"
          >
            {description}
          </p>
        )}
      </div>
      
      <div 
        role="group" 
        aria-labelledby={`${sectionId}-title`}
        aria-describedby={description ? `${sectionId}-description` : undefined}
        className="space-y-4"
      >
        {children}
      </div>
    </fieldset>
  );
};

interface FormGroupProps {
  children: React.ReactNode;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
}

export const FormGroup: React.FC<FormGroupProps> = ({
  children,
  className = '',
  orientation = 'vertical'
}) => {
  const groupClass = orientation === 'horizontal' 
    ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
    : 'space-y-4';

  return (
    <div className={`${groupClass} ${className}`}>
      {children}
    </div>
  );
};