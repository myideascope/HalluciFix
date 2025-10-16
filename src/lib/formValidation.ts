import { useCallback, useState, useRef, useEffect } from 'react';

// Form validation types
export interface FormError {
  field: string;
  message: string;
  type: 'required' | 'format' | 'length' | 'custom' | 'async';
  severity?: 'error' | 'warning';
}

export interface ValidationRule {
  type: 'required' | 'email' | 'minLength' | 'maxLength' | 'pattern' | 'custom' | 'async';
  message: string;
  value?: any;
  validator?: (value: any, formData?: any) => boolean | Promise<boolean>;
  severity?: 'error' | 'warning';
}

export interface FieldConfig {
  rules: ValidationRule[];
  debounceMs?: number;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
}

export interface FormConfig {
  fields: Record<string, FieldConfig>;
  validateOnSubmit?: boolean;
  stopOnFirstError?: boolean;
}

export interface FormErrorState {
  errors: Record<string, FormError>;
  touched: Record<string, boolean>;
  validating: Record<string, boolean>;
  isValid: boolean;
  isValidating: boolean;
}

// Built-in validation functions
export const validators = {
  required: (value: any): boolean => {
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && value !== '';
  },

  email: (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },

  minLength: (value: string, minLength: number): boolean => {
    return value.length >= minLength;
  },

  maxLength: (value: string, maxLength: number): boolean => {
    return value.length <= maxLength;
  },

  pattern: (value: string, pattern: RegExp): boolean => {
    return pattern.test(value);
  },

  url: (value: string): boolean => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },

  phone: (value: string): boolean => {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''));
  },

  strongPassword: (value: string): boolean => {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return strongPasswordRegex.test(value);
  },

  numeric: (value: string): boolean => {
    return !isNaN(Number(value)) && isFinite(Number(value));
  },

  integer: (value: string): boolean => {
    return Number.isInteger(Number(value));
  },

  positiveNumber: (value: string): boolean => {
    const num = Number(value);
    return !isNaN(num) && isFinite(num) && num > 0;
  }
};

// Debounce utility
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Main form validation hook
export const useFormValidation = (config: FormConfig) => {
  const [errorState, setErrorState] = useState<FormErrorState>({
    errors: {},
    touched: {},
    validating: {},
    isValid: true,
    isValidating: false
  });

  const [formData, setFormData] = useState<Record<string, any>>({});
  const validationTimeouts = useRef<Record<string, NodeJS.Timeout>>({});
  const asyncValidationControllers = useRef<Record<string, AbortController>>({});

  // Validate a single field
  const validateField = useCallback(async (
    fieldName: string, 
    value: any, 
    immediate: boolean = false
  ): Promise<FormError | null> => {
    const fieldConfig = config.fields[fieldName];
    if (!fieldConfig) return null;

    // Cancel any existing async validation for this field
    if (asyncValidationControllers.current[fieldName]) {
      asyncValidationControllers.current[fieldName].abort();
    }

    // Set validating state
    setErrorState(prev => ({
      ...prev,
      validating: {
        ...prev.validating,
        [fieldName]: true
      },
      isValidating: true
    }));

    try {
      for (const rule of fieldConfig.rules) {
        let isValid = false;

        switch (rule.type) {
          case 'required':
            isValid = validators.required(value);
            break;
          case 'email':
            isValid = !value || validators.email(value);
            break;
          case 'minLength':
            isValid = !value || validators.minLength(value, rule.value);
            break;
          case 'maxLength':
            isValid = !value || validators.maxLength(value, rule.value);
            break;
          case 'pattern':
            isValid = !value || validators.pattern(value, rule.value);
            break;
          case 'custom':
            if (rule.validator) {
              isValid = rule.validator(value, formData);
            }
            break;
          case 'async':
            if (rule.validator) {
              // Create abort controller for this validation
              const controller = new AbortController();
              asyncValidationControllers.current[fieldName] = controller;

              try {
                isValid = await rule.validator(value, formData);
              } catch (error) {
                if (error.name === 'AbortError') {
                  return null; // Validation was cancelled
                }
                throw error;
              }
            }
            break;
        }

        if (!isValid) {
          const error: FormError = {
            field: fieldName,
            message: rule.message,
            type: rule.type,
            severity: rule.severity || 'error'
          };

          // Update error state
          setErrorState(prev => {
            const newErrors = { ...prev.errors };
            newErrors[fieldName] = error;

            const newValidating = { ...prev.validating };
            delete newValidating[fieldName];

            return {
              ...prev,
              errors: newErrors,
              validating: newValidating,
              isValid: Object.keys(newErrors).length === 0,
              isValidating: Object.keys(newValidating).length > 0
            };
          });

          return error;
        }
      }

      // No errors found, clear any existing error for this field
      setErrorState(prev => {
        const newErrors = { ...prev.errors };
        delete newErrors[fieldName];

        const newValidating = { ...prev.validating };
        delete newValidating[fieldName];

        return {
          ...prev,
          errors: newErrors,
          validating: newValidating,
          isValid: Object.keys(newErrors).length === 0,
          isValidating: Object.keys(newValidating).length > 0
        };
      });

      return null;
    } catch (error) {
      console.error(`Validation error for field ${fieldName}:`, error);
      
      const validationError: FormError = {
        field: fieldName,
        message: 'Validation failed. Please try again.',
        type: 'custom',
        severity: 'error'
      };

      setErrorState(prev => {
        const newErrors = { ...prev.errors };
        newErrors[fieldName] = validationError;

        const newValidating = { ...prev.validating };
        delete newValidating[fieldName];

        return {
          ...prev,
          errors: newErrors,
          validating: newValidating,
          isValid: false,
          isValidating: Object.keys(newValidating).length > 0
        };
      });

      return validationError;
    }
  }, [config.fields, formData]);

  // Debounced validation
  const validateFieldDebounced = useCallback((
    fieldName: string, 
    value: any
  ) => {
    const fieldConfig = config.fields[fieldName];
    const debounceMs = fieldConfig?.debounceMs || 300;

    // Clear existing timeout
    if (validationTimeouts.current[fieldName]) {
      clearTimeout(validationTimeouts.current[fieldName]);
    }

    // Set new timeout
    validationTimeouts.current[fieldName] = setTimeout(() => {
      validateField(fieldName, value);
    }, debounceMs);
  }, [validateField, config.fields]);

  // Handle field value change
  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    // Update form data
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));

    const fieldConfig = config.fields[fieldName];
    if (!fieldConfig) return;

    // Validate on change if configured
    if (fieldConfig.validateOnChange !== false) {
      validateFieldDebounced(fieldName, value);
    }
  }, [config.fields, validateFieldDebounced]);

  // Handle field blur
  const handleFieldBlur = useCallback((fieldName: string, value: any) => {
    // Mark field as touched
    setErrorState(prev => ({
      ...prev,
      touched: {
        ...prev.touched,
        [fieldName]: true
      }
    }));

    const fieldConfig = config.fields[fieldName];
    if (!fieldConfig) return;

    // Validate on blur if configured
    if (fieldConfig.validateOnBlur !== false) {
      validateField(fieldName, value, true);
    }
  }, [config.fields, validateField]);

  // Validate all fields
  const validateForm = useCallback(async (): Promise<boolean> => {
    const errors: Record<string, FormError> = {};
    let hasErrors = false;

    for (const [fieldName, value] of Object.entries(formData)) {
      const error = await validateField(fieldName, value, true);
      if (error) {
        errors[fieldName] = error;
        hasErrors = true;

        // Stop on first error if configured
        if (config.stopOnFirstError) {
          break;
        }
      }
    }

    // Mark all fields as touched
    setErrorState(prev => ({
      ...prev,
      touched: Object.keys(config.fields).reduce((acc, fieldName) => {
        acc[fieldName] = true;
        return acc;
      }, {} as Record<string, boolean>)
    }));

    return !hasErrors;
  }, [formData, validateField, config.fields, config.stopOnFirstError]);

  // Get field error (only if touched)
  const getFieldError = useCallback((fieldName: string): FormError | null => {
    return errorState.touched[fieldName] ? errorState.errors[fieldName] || null : null;
  }, [errorState]);

  // Check if field is validating
  const isFieldValidating = useCallback((fieldName: string): boolean => {
    return errorState.validating[fieldName] || false;
  }, [errorState]);

  // Clear field error
  const clearFieldError = useCallback((fieldName: string) => {
    setErrorState(prev => {
      const newErrors = { ...prev.errors };
      delete newErrors[fieldName];

      return {
        ...prev,
        errors: newErrors,
        isValid: Object.keys(newErrors).length === 0
      };
    });
  }, []);

  // Clear all errors
  const clearAllErrors = useCallback(() => {
    setErrorState({
      errors: {},
      touched: {},
      validating: {},
      isValid: true,
      isValidating: false
    });
  }, []);

  // Set field touched
  const setFieldTouched = useCallback((fieldName: string, touched: boolean = true) => {
    setErrorState(prev => ({
      ...prev,
      touched: {
        ...prev.touched,
        [fieldName]: touched
      }
    }));
  }, []);

  // Reset form
  const resetForm = useCallback(() => {
    setFormData({});
    clearAllErrors();
    
    // Clear timeouts
    Object.values(validationTimeouts.current).forEach(timeout => {
      clearTimeout(timeout);
    });
    validationTimeouts.current = {};

    // Abort async validations
    Object.values(asyncValidationControllers.current).forEach(controller => {
      controller.abort();
    });
    asyncValidationControllers.current = {};
  }, [clearAllErrors]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear timeouts
      Object.values(validationTimeouts.current).forEach(timeout => {
        clearTimeout(timeout);
      });

      // Abort async validations
      Object.values(asyncValidationControllers.current).forEach(controller => {
        controller.abort();
      });
    };
  }, []);

  return {
    // State
    errors: errorState.errors,
    touched: errorState.touched,
    validating: errorState.validating,
    isValid: errorState.isValid,
    isValidating: errorState.isValidating,
    formData,

    // Methods
    handleFieldChange,
    handleFieldBlur,
    validateField,
    validateForm,
    getFieldError,
    isFieldValidating,
    clearFieldError,
    clearAllErrors,
    setFieldTouched,
    resetForm
  };
};

// Validation schema builder
export class ValidationSchema {
  private fields: Record<string, FieldConfig> = {};

  field(name: string): FieldBuilder {
    return new FieldBuilder(name, this);
  }

  addField(name: string, config: FieldConfig): ValidationSchema {
    this.fields[name] = config;
    return this;
  }

  build(): FormConfig {
    return {
      fields: this.fields,
      validateOnSubmit: true
    };
  }
}

export class FieldBuilder {
  private rules: ValidationRule[] = [];
  private debounceMs: number = 300;
  private validateOnChange: boolean = true;
  private validateOnBlur: boolean = true;

  constructor(
    private fieldName: string,
    private schema: ValidationSchema
  ) {}

  required(message: string = 'This field is required'): FieldBuilder {
    this.rules.push({
      type: 'required',
      message
    });
    return this;
  }

  email(message: string = 'Please enter a valid email address'): FieldBuilder {
    this.rules.push({
      type: 'email',
      message
    });
    return this;
  }

  minLength(length: number, message?: string): FieldBuilder {
    this.rules.push({
      type: 'minLength',
      value: length,
      message: message || `Must be at least ${length} characters`
    });
    return this;
  }

  maxLength(length: number, message?: string): FieldBuilder {
    this.rules.push({
      type: 'maxLength',
      value: length,
      message: message || `Must be no more than ${length} characters`
    });
    return this;
  }

  pattern(regex: RegExp, message: string): FieldBuilder {
    this.rules.push({
      type: 'pattern',
      value: regex,
      message
    });
    return this;
  }

  custom(validator: (value: any, formData?: any) => boolean, message: string): FieldBuilder {
    this.rules.push({
      type: 'custom',
      validator,
      message
    });
    return this;
  }

  async(validator: (value: any, formData?: any) => Promise<boolean>, message: string): FieldBuilder {
    this.rules.push({
      type: 'async',
      validator,
      message
    });
    return this;
  }

  debounce(ms: number): FieldBuilder {
    this.debounceMs = ms;
    return this;
  }

  validateOnChangeDisabled(): FieldBuilder {
    this.validateOnChange = false;
    return this;
  }

  validateOnBlurDisabled(): FieldBuilder {
    this.validateOnBlur = false;
    return this;
  }

  build(): ValidationSchema {
    this.schema.addField(this.fieldName, {
      rules: this.rules,
      debounceMs: this.debounceMs,
      validateOnChange: this.validateOnChange,
      validateOnBlur: this.validateOnBlur
    });
    return this.schema;
  }
}

// Utility function to create validation schema
export const createValidationSchema = (): ValidationSchema => {
  return new ValidationSchema();
};