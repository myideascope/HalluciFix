import React from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { FormError as FormErrorType } from '../../lib/formValidation';

interface FormErrorProps {
  error?: FormErrorType | null;
  fieldId?: string;
  className?: string;
  showIcon?: boolean;
}

export const FormError: React.FC<FormErrorProps> = ({ 
  error, 
  fieldId, 
  className = '',
  showIcon = true
}) => {
  if (!error) return null;

  const getErrorIcon = () => {
    switch (error.severity) {
      case 'warning':
        return AlertCircle;
      case 'error':
      default:
        return AlertTriangle;
    }
  };

  const getErrorStyles = () => {
    switch (error.severity) {
      case 'warning':
        return {
          container: 'text-orange-600',
          icon: 'text-orange-500'
        };
      case 'error':
      default:
        return {
          container: 'text-red-600',
          icon: 'text-red-500'
        };
    }
  };

  const Icon = getErrorIcon();
  const styles = getErrorStyles();

  return (
    <div
      id={fieldId ? `${fieldId}-error` : undefined}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className={`mt-1 text-sm ${styles.container} flex items-start space-x-1 ${className}`}
    >
      {showIcon && (
        <Icon 
          className={`w-4 h-4 flex-shrink-0 mt-0.5 ${styles.icon}`}
          aria-hidden="true"
        />
      )}
      <span>{error.message}</span>
    </div>
  );
};

interface FormErrorListProps {
  errors: FormErrorType[];
  className?: string;
  title?: string;
}

export const FormErrorList: React.FC<FormErrorListProps> = ({
  errors,
  className = '',
  title = 'Please correct the following errors:'
}) => {
  if (errors.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}
    >
      <div className="flex items-start space-x-3">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800 mb-2">
            {title}
          </h3>
          <ul className="text-sm text-red-700 space-y-1">
            {errors.map((error, index) => (
              <li key={`${error.field}-${index}`} className="flex items-start space-x-2">
                <span className="w-1 h-1 bg-red-600 rounded-full mt-2 flex-shrink-0" aria-hidden="true" />
                <span>
                  <strong>{error.field}:</strong> {error.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

interface FormSuccessProps {
  message: string;
  fieldId?: string;
  className?: string;
  showIcon?: boolean;
}

export const FormSuccess: React.FC<FormSuccessProps> = ({
  message,
  fieldId,
  className = '',
  showIcon = true
}) => {
  return (
    <div
      id={fieldId ? `${fieldId}-success` : undefined}
      role="status"
      aria-live="polite"
      className={`mt-1 text-sm text-green-600 flex items-start space-x-1 ${className}`}
    >
      {showIcon && (
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-500" aria-hidden="true" />
      )}
      <span>{message}</span>
    </div>
  );
};

interface FormValidatingProps {
  fieldId?: string;
  className?: string;
  message?: string;
}

export const FormValidating: React.FC<FormValidatingProps> = ({
  fieldId,
  className = '',
  message = 'Validating...'
}) => {
  return (
    <div
      id={fieldId ? `${fieldId}-validating` : undefined}
      role="status"
      aria-live="polite"
      className={`mt-1 text-sm text-blue-600 flex items-start space-x-1 ${className}`}
    >
      <div 
        className="w-4 h-4 flex-shrink-0 mt-0.5"
        aria-hidden="true"
      >
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
      </div>
      <span>{message}</span>
    </div>
  );
};