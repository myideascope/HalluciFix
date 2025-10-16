import React, { forwardRef, InputHTMLAttributes, useState, useEffect } from 'react';
import { ValidatedInput, ValidatedTextarea } from './ValidatedInputs';
import { useInputConstraints, InputConstraintConfig, constraintPresets } from '../../lib/inputConstraints';
import { FormError as FormErrorType } from '../../lib/formValidation';

// Constrained Input with real-time validation and prevention
interface ConstrainedInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onBlur'> {
  label: string;
  error?: FormErrorType | null;
  success?: string;
  isValidating?: boolean;
  helpText?: string;
  description?: string;
  constraintConfig?: InputConstraintConfig;
  preset?: keyof typeof constraintPresets;
  onValueChange?: (value: string, isValid: boolean) => void;
  onFieldBlur?: (value: string, isValid: boolean) => void;
  onConstraintViolation?: (violations: string[]) => void;
  showConstraintHints?: boolean;
  showCharacterCount?: boolean;
  containerClassName?: string;
  labelClassName?: string;
}

export const ConstrainedInput = forwardRef<HTMLInputElement, ConstrainedInputProps>(({
  label,
  error,
  success,
  isValidating,
  helpText,
  description,
  constraintConfig,
  preset,
  onValueChange,
  onFieldBlur,
  onConstraintViolation,
  showConstraintHints = true,
  showCharacterCount = false,
  containerClassName,
  labelClassName,
  value: controlledValue,
  ...inputProps
}, ref) => {
  const [internalValue, setInternalValue] = useState(controlledValue || '');
  const [constraintViolations, setConstraintViolations] = useState<string[]>([]);
  
  // Use preset or custom config
  const finalConfig = preset ? constraintPresets[preset] : constraintConfig;
  
  const {
    validateConstraints,
    handleKeyDown,
    handlePaste,
    handleChange,
    getConstraintHints
  } = useInputConstraints(finalConfig || { constraints: [] });

  // Update internal value when controlled value changes
  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(String(controlledValue));
    }
  }, [controlledValue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const transformedValue = handleChange(e);
    const validation = validateConstraints(transformedValue);
    
    setInternalValue(transformedValue);
    setConstraintViolations(validation.violations);
    
    onValueChange?.(transformedValue, validation.isValid);
    
    if (!validation.isValid && onConstraintViolation) {
      onConstraintViolation(validation.violations);
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const validation = validateConstraints(value);
    
    onFieldBlur?.(value, validation.isValid);
  };

  // Get constraint hints
  const constraintHints = showConstraintHints ? getConstraintHints() : [];
  
  // Get max length for character count
  const maxLength = finalConfig?.constraints.find(c => c.type === 'maxLength')?.value;
  
  // Combine help text with constraint hints
  const combinedHelpText = [
    helpText,
    ...constraintHints,
    ...(constraintViolations.length > 0 ? constraintViolations : [])
  ].filter(Boolean).join(' • ');

  return (
    <div className={containerClassName}>
      <ValidatedInput
        ref={ref}
        label={label}
        error={error}
        success={success}
        isValidating={isValidating}
        helpText={combinedHelpText}
        description={description}
        labelClassName={labelClassName}
        value={internalValue}
        onValueChange={() => {}} // Handled by handleInputChange
        onFieldBlur={() => {}} // Handled by handleInputBlur
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        {...inputProps}
      />
      
      {/* Character count display */}
      {showCharacterCount && maxLength && (
        <div className="mt-1 text-xs text-slate-500 text-right">
          {internalValue.length}/{maxLength}
        </div>
      )}
    </div>
  );
});

ConstrainedInput.displayName = 'ConstrainedInput';

// Constrained Textarea with real-time validation and prevention
interface ConstrainedTextareaProps extends Omit<React.TextareaHTMLAttributes, 'onChange' | 'onBlur'> {
  label: string;
  error?: FormErrorType | null;
  success?: string;
  isValidating?: boolean;
  helpText?: string;
  description?: string;
  constraintConfig?: InputConstraintConfig;
  onValueChange?: (value: string, isValid: boolean) => void;
  onFieldBlur?: (value: string, isValid: boolean) => void;
  onConstraintViolation?: (violations: string[]) => void;
  showConstraintHints?: boolean;
  showCharacterCount?: boolean;
  containerClassName?: string;
  labelClassName?: string;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

export const ConstrainedTextarea = forwardRef<HTMLTextAreaElement, ConstrainedTextareaProps>(({
  label,
  error,
  success,
  isValidating,
  helpText,
  description,
  constraintConfig,
  onValueChange,
  onFieldBlur,
  onConstraintViolation,
  showConstraintHints = true,
  showCharacterCount = false,
  containerClassName,
  labelClassName,
  resize = 'vertical',
  value: controlledValue,
  ...textareaProps
}, ref) => {
  const [internalValue, setInternalValue] = useState(controlledValue || '');
  const [constraintViolations, setConstraintViolations] = useState<string[]>([]);
  
  const {
    validateConstraints,
    handleKeyDown,
    handlePaste,
    handleChange,
    getConstraintHints
  } = useInputConstraints(constraintConfig || { constraints: [] });

  // Update internal value when controlled value changes
  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(String(controlledValue));
    }
  }, [controlledValue]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const transformedValue = handleChange(e);
    const validation = validateConstraints(transformedValue);
    
    setInternalValue(transformedValue);
    setConstraintViolations(validation.violations);
    
    onValueChange?.(transformedValue, validation.isValid);
    
    if (!validation.isValid && onConstraintViolation) {
      onConstraintViolation(validation.violations);
    }
  };

  const handleTextareaBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const validation = validateConstraints(value);
    
    onFieldBlur?.(value, validation.isValid);
  };

  // Get constraint hints
  const constraintHints = showConstraintHints ? getConstraintHints() : [];
  
  // Get max length for character count
  const maxLength = constraintConfig?.constraints.find(c => c.type === 'maxLength')?.value;
  
  // Combine help text with constraint hints
  const combinedHelpText = [
    helpText,
    ...constraintHints,
    ...(constraintViolations.length > 0 ? constraintViolations : [])
  ].filter(Boolean).join(' • ');

  return (
    <div className={containerClassName}>
      <ValidatedTextarea
        ref={ref}
        label={label}
        error={error}
        success={success}
        isValidating={isValidating}
        helpText={combinedHelpText}
        description={description}
        labelClassName={labelClassName}
        resize={resize}
        value={internalValue}
        onValueChange={() => {}} // Handled by handleTextareaChange
        onFieldBlur={() => {}} // Handled by handleTextareaBlur
        onChange={handleTextareaChange}
        onBlur={handleTextareaBlur}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        {...textareaProps}
      />
      
      {/* Character count display */}
      {showCharacterCount && maxLength && (
        <div className="mt-1 text-xs text-slate-500 text-right">
          {internalValue.length}/{maxLength}
        </div>
      )}
    </div>
  );
});

ConstrainedTextarea.displayName = 'ConstrainedTextarea';

// Specialized input components using presets
export const EmailInput = forwardRef<HTMLInputElement, Omit<ConstrainedInputProps, 'preset'>>((props, ref) => (
  <ConstrainedInput ref={ref} preset="email" type="email" {...props} />
));

EmailInput.displayName = 'EmailInput';

export const PhoneInput = forwardRef<HTMLInputElement, Omit<ConstrainedInputProps, 'preset'>>((props, ref) => (
  <ConstrainedInput ref={ref} preset="phoneNumber" type="tel" showCharacterCount {...props} />
));

PhoneInput.displayName = 'PhoneInput';

export const CreditCardInput = forwardRef<HTMLInputElement, Omit<ConstrainedInputProps, 'preset'>>((props, ref) => (
  <ConstrainedInput ref={ref} preset="creditCard" type="text" showCharacterCount {...props} />
));

CreditCardInput.displayName = 'CreditCardInput';

export const CurrencyInput = forwardRef<HTMLInputElement, Omit<ConstrainedInputProps, 'preset'>>((props, ref) => (
  <ConstrainedInput ref={ref} preset="currency" type="text" {...props} />
));

CurrencyInput.displayName = 'CurrencyInput';

export const AlphanumericInput = forwardRef<HTMLInputElement, Omit<ConstrainedInputProps, 'preset'>>((props, ref) => (
  <ConstrainedInput ref={ref} preset="alphanumeric" type="text" {...props} />
));

AlphanumericInput.displayName = 'AlphanumericInput';

export const PasswordInput = forwardRef<HTMLInputElement, Omit<ConstrainedInputProps, 'preset'>>((props, ref) => (
  <ConstrainedInput ref={ref} preset="strongPassword" type="password" showConstraintHints {...props} />
));

PasswordInput.displayName = 'PasswordInput';