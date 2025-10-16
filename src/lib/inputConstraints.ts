import { KeyboardEvent, ClipboardEvent, ChangeEvent } from 'react';

// Input constraint types
export interface InputConstraint {
  type: 'maxLength' | 'minLength' | 'pattern' | 'numeric' | 'alphanumeric' | 'custom';
  value?: any;
  message?: string;
  preventInput?: boolean;
  transformer?: (value: string) => string;
}

export interface InputConstraintConfig {
  constraints: InputConstraint[];
  allowPaste?: boolean;
  sanitizeOnPaste?: boolean;
  showConstraintHints?: boolean;
}

// Built-in constraint validators
export const constraintValidators = {
  maxLength: (value: string, maxLength: number): boolean => {
    return value.length <= maxLength;
  },

  minLength: (value: string, minLength: number): boolean => {
    return value.length >= minLength;
  },

  pattern: (value: string, pattern: RegExp): boolean => {
    return pattern.test(value);
  },

  numeric: (value: string): boolean => {
    return /^[0-9]*\.?[0-9]*$/.test(value);
  },

  integer: (value: string): boolean => {
    return /^[0-9]*$/.test(value);
  },

  alphanumeric: (value: string): boolean => {
    return /^[a-zA-Z0-9]*$/.test(value);
  },

  alphabetic: (value: string): boolean => {
    return /^[a-zA-Z]*$/.test(value);
  },

  noSpecialChars: (value: string): boolean => {
    return /^[a-zA-Z0-9\s]*$/.test(value);
  },

  phoneNumber: (value: string): boolean => {
    // Allow digits, spaces, hyphens, parentheses, and plus sign
    return /^[\d\s\-\(\)\+]*$/.test(value);
  },

  creditCard: (value: string): boolean => {
    // Allow digits and spaces only
    return /^[\d\s]*$/.test(value);
  }
};

// Input transformers for formatting
export const inputTransformers = {
  uppercase: (value: string): string => value.toUpperCase(),
  
  lowercase: (value: string): string => value.toLowerCase(),
  
  capitalize: (value: string): string => 
    value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(),
  
  removeSpaces: (value: string): string => value.replace(/\s/g, ''),
  
  phoneNumber: (value: string): string => {
    // Format as (XXX) XXX-XXXX
    const cleaned = value.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
    if (!match) return value;
    
    let formatted = '';
    if (match[1]) formatted += `(${match[1]}`;
    if (match[1] && match[1].length === 3) formatted += ') ';
    if (match[2]) formatted += match[2];
    if (match[2] && match[2].length === 3) formatted += '-';
    if (match[3]) formatted += match[3];
    
    return formatted;
  },
  
  creditCard: (value: string): string => {
    // Format as XXXX XXXX XXXX XXXX
    const cleaned = value.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{0,4})(\d{0,4})(\d{0,4})(\d{0,4})$/);
    if (!match) return value;
    
    return [match[1], match[2], match[3], match[4]]
      .filter(Boolean)
      .join(' ');
  },
  
  currency: (value: string): string => {
    // Allow only numbers and decimal point
    const cleaned = value.replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    if (parts[1] && parts[1].length > 2) {
      return parts[0] + '.' + parts[1].substring(0, 2);
    }
    return cleaned;
  }
};

// Input sanitizers
export const inputSanitizers = {
  removeHtml: (value: string): string => {
    return value.replace(/<[^>]*>/g, '');
  },
  
  removeScripts: (value: string): string => {
    return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  },
  
  basicSanitize: (value: string): string => {
    return value
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, ''); // Remove event handlers
  },
  
  strictSanitize: (value: string): string => {
    // Only allow alphanumeric, spaces, and basic punctuation
    return value.replace(/[^a-zA-Z0-9\s.,!?;:()\-_@]/g, '');
  }
};

// Hook for input constraints
export const useInputConstraints = (config: InputConstraintConfig) => {
  const validateConstraints = (value: string): { isValid: boolean; violations: string[] } => {
    const violations: string[] = [];
    
    for (const constraint of config.constraints) {
      let isValid = true;
      
      switch (constraint.type) {
        case 'maxLength':
          isValid = constraintValidators.maxLength(value, constraint.value);
          break;
        case 'minLength':
          isValid = constraintValidators.minLength(value, constraint.value);
          break;
        case 'pattern':
          isValid = constraintValidators.pattern(value, constraint.value);
          break;
        case 'numeric':
          isValid = constraintValidators.numeric(value);
          break;
        case 'alphanumeric':
          isValid = constraintValidators.alphanumeric(value);
          break;
        case 'custom':
          if (constraint.value && typeof constraint.value === 'function') {
            isValid = constraint.value(value);
          }
          break;
      }
      
      if (!isValid && constraint.message) {
        violations.push(constraint.message);
      }
    }
    
    return {
      isValid: violations.length === 0,
      violations
    };
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const input = e.currentTarget;
    const value = input.value;
    const key = e.key;
    
    // Allow control keys
    if (e.ctrlKey || e.metaKey || e.altKey || 
        ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
      return;
    }
    
    // Check constraints that prevent input
    for (const constraint of config.constraints) {
      if (!constraint.preventInput) continue;
      
      const newValue = value + key;
      
      switch (constraint.type) {
        case 'maxLength':
          if (newValue.length > constraint.value) {
            e.preventDefault();
            return;
          }
          break;
        case 'pattern':
          if (!constraintValidators.pattern(key, constraint.value)) {
            e.preventDefault();
            return;
          }
          break;
        case 'numeric':
          if (!constraintValidators.numeric(newValue)) {
            e.preventDefault();
            return;
          }
          break;
        case 'alphanumeric':
          if (!constraintValidators.alphanumeric(key)) {
            e.preventDefault();
            return;
          }
          break;
        case 'custom':
          if (constraint.value && typeof constraint.value === 'function') {
            if (!constraint.value(newValue)) {
              e.preventDefault();
              return;
            }
          }
          break;
      }
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!config.allowPaste) {
      e.preventDefault();
      return;
    }
    
    if (config.sanitizeOnPaste) {
      e.preventDefault();
      const pastedText = e.clipboardData.getData('text');
      const sanitized = inputSanitizers.basicSanitize(pastedText);
      
      const input = e.currentTarget;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const currentValue = input.value;
      const newValue = currentValue.slice(0, start) + sanitized + currentValue.slice(end);
      
      // Validate the new value
      const validation = validateConstraints(newValue);
      if (validation.isValid) {
        input.value = newValue;
        input.setSelectionRange(start + sanitized.length, start + sanitized.length);
        
        // Trigger change event
        const changeEvent = new Event('input', { bubbles: true });
        input.dispatchEvent(changeEvent);
      }
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const input = e.currentTarget;
    let value = input.value;
    
    // Apply transformers
    for (const constraint of config.constraints) {
      if (constraint.transformer) {
        value = constraint.transformer(value);
      }
    }
    
    // Update input value if transformed
    if (value !== input.value) {
      input.value = value;
    }
    
    return value;
  };

  const getConstraintHints = (): string[] => {
    if (!config.showConstraintHints) return [];
    
    const hints: string[] = [];
    
    for (const constraint of config.constraints) {
      switch (constraint.type) {
        case 'maxLength':
          hints.push(`Maximum ${constraint.value} characters`);
          break;
        case 'minLength':
          hints.push(`Minimum ${constraint.value} characters`);
          break;
        case 'numeric':
          hints.push('Numbers only');
          break;
        case 'alphanumeric':
          hints.push('Letters and numbers only');
          break;
        case 'pattern':
          if (constraint.message) {
            hints.push(constraint.message);
          }
          break;
      }
    }
    
    return hints;
  };

  return {
    validateConstraints,
    handleKeyDown,
    handlePaste,
    handleChange,
    getConstraintHints
  };
};

// Predefined constraint configurations
export const constraintPresets = {
  email: {
    constraints: [
      {
        type: 'pattern' as const,
        value: /^[a-zA-Z0-9@._-]*$/,
        message: 'Only letters, numbers, @, ., _, and - allowed',
        preventInput: true
      }
    ],
    allowPaste: true,
    sanitizeOnPaste: true,
    showConstraintHints: true
  },

  phoneNumber: {
    constraints: [
      {
        type: 'pattern' as const,
        value: /^[\d\s\-\(\)\+]*$/,
        message: 'Only numbers and phone formatting characters allowed',
        preventInput: true,
        transformer: inputTransformers.phoneNumber
      },
      {
        type: 'maxLength' as const,
        value: 14, // (XXX) XXX-XXXX
        preventInput: true
      }
    ],
    allowPaste: true,
    sanitizeOnPaste: true,
    showConstraintHints: true
  },

  creditCard: {
    constraints: [
      {
        type: 'numeric' as const,
        message: 'Only numbers allowed',
        preventInput: true,
        transformer: inputTransformers.creditCard
      },
      {
        type: 'maxLength' as const,
        value: 19, // XXXX XXXX XXXX XXXX
        preventInput: true
      }
    ],
    allowPaste: true,
    sanitizeOnPaste: true,
    showConstraintHints: true
  },

  currency: {
    constraints: [
      {
        type: 'pattern' as const,
        value: /^[\d.]*$/,
        message: 'Only numbers and decimal point allowed',
        preventInput: true,
        transformer: inputTransformers.currency
      }
    ],
    allowPaste: true,
    sanitizeOnPaste: true,
    showConstraintHints: true
  },

  alphanumeric: {
    constraints: [
      {
        type: 'alphanumeric' as const,
        message: 'Only letters and numbers allowed',
        preventInput: true
      }
    ],
    allowPaste: true,
    sanitizeOnPaste: true,
    showConstraintHints: true
  },

  noSpecialChars: {
    constraints: [
      {
        type: 'pattern' as const,
        value: /^[a-zA-Z0-9\s]*$/,
        message: 'Only letters, numbers, and spaces allowed',
        preventInput: true
      }
    ],
    allowPaste: true,
    sanitizeOnPaste: true,
    showConstraintHints: true
  },

  strongPassword: {
    constraints: [
      {
        type: 'minLength' as const,
        value: 8,
        message: 'At least 8 characters required'
      },
      {
        type: 'pattern' as const,
        value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]*$/,
        message: 'Must contain uppercase, lowercase, number, and special character'
      }
    ],
    allowPaste: true,
    sanitizeOnPaste: false,
    showConstraintHints: true
  }
};