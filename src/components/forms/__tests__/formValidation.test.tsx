import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormValidation, createValidationSchema, validators } from '../index';

describe('Form Validation System', () => {
  describe('validators', () => {
    it('should validate required fields correctly', () => {
      expect(validators.required('test')).toBe(true);
      expect(validators.required('')).toBe(false);
      expect(validators.required('   ')).toBe(false);
      expect(validators.required(null)).toBe(false);
      expect(validators.required(undefined)).toBe(false);
    });

    it('should validate email format correctly', () => {
      expect(validators.email('test@example.com')).toBe(true);
      expect(validators.email('user.name+tag@domain.co.uk')).toBe(true);
      expect(validators.email('invalid-email')).toBe(false);
      expect(validators.email('test@')).toBe(false);
      expect(validators.email('@example.com')).toBe(false);
    });

    it('should validate string length correctly', () => {
      expect(validators.minLength('hello', 3)).toBe(true);
      expect(validators.minLength('hi', 3)).toBe(false);
      expect(validators.maxLength('hello', 10)).toBe(true);
      expect(validators.maxLength('hello world!', 10)).toBe(false);
    });

    it('should validate patterns correctly', () => {
      const phonePattern = /^\(\d{3}\) \d{3}-\d{4}$/;
      expect(validators.pattern('(123) 456-7890', phonePattern)).toBe(true);
      expect(validators.pattern('123-456-7890', phonePattern)).toBe(false);
    });

    it('should validate numeric input correctly', () => {
      expect(validators.numeric('123')).toBe(true);
      expect(validators.numeric('123.45')).toBe(true);
      expect(validators.numeric('abc')).toBe(false);
      expect(validators.numeric('12a3')).toBe(false);
    });
  });

  describe('createValidationSchema', () => {
    it('should create a validation schema with field rules', () => {
      const schema = createValidationSchema()
        .field('email')
          .required('Email is required')
          .email('Invalid email format')
          .build()
        .field('password')
          .required('Password is required')
          .minLength(8, 'Password must be at least 8 characters')
          .build()
        .build();

      expect(schema.fields.email).toBeDefined();
      expect(schema.fields.password).toBeDefined();
      expect(schema.fields.email.rules).toHaveLength(2);
      expect(schema.fields.password.rules).toHaveLength(2);
    });
  });

  describe('useFormValidation', () => {
    let schema: any;

    beforeEach(() => {
      schema = createValidationSchema()
        .field('email')
          .required('Email is required')
          .email('Invalid email format')
          .build()
        .field('password')
          .required('Password is required')
          .minLength(8, 'Password must be at least 8 characters')
          .build()
        .build();
    });

    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useFormValidation(schema));

      expect(result.current.errors).toEqual({});
      expect(result.current.touched).toEqual({});
      expect(result.current.isValid).toBe(true);
      expect(result.current.formData).toEqual({});
    });

    it('should handle field changes', () => {
      const { result } = renderHook(() => useFormValidation(schema));

      act(() => {
        result.current.handleFieldChange('email', 'test@example.com');
      });

      expect(result.current.formData.email).toBe('test@example.com');
    });

    it('should validate fields on blur', async () => {
      const { result } = renderHook(() => useFormValidation(schema));

      await act(async () => {
        result.current.handleFieldBlur('email', '');
      });

      expect(result.current.touched.email).toBe(true);
      expect(result.current.errors.email).toBeDefined();
      expect(result.current.errors.email?.message).toBe('Email is required');
    });

    it('should validate email format', async () => {
      const { result } = renderHook(() => useFormValidation(schema));

      await act(async () => {
        result.current.handleFieldBlur('email', 'invalid-email');
      });

      expect(result.current.errors.email?.message).toBe('Invalid email format');
    });

    it('should validate password length', async () => {
      const { result } = renderHook(() => useFormValidation(schema));

      await act(async () => {
        result.current.handleFieldBlur('password', 'short');
      });

      expect(result.current.errors.password?.message).toBe('Password must be at least 8 characters');
    });

    it('should clear errors when field becomes valid', async () => {
      const { result } = renderHook(() => useFormValidation(schema));

      // First, create an error
      await act(async () => {
        result.current.handleFieldBlur('email', 'invalid-email');
      });

      expect(result.current.errors.email).toBeDefined();

      // Then, fix the error
      await act(async () => {
        result.current.handleFieldBlur('email', 'test@example.com');
      });

      expect(result.current.errors.email).toBeUndefined();
    });

    it('should validate entire form', async () => {
      const { result } = renderHook(() => useFormValidation(schema));

      // Set some form data
      act(() => {
        result.current.handleFieldChange('email', 'test@example.com');
        result.current.handleFieldChange('password', 'validpassword123');
      });

      const isValid = await act(async () => {
        return await result.current.validateForm();
      });

      expect(isValid).toBe(true);
      expect(result.current.isValid).toBe(true);
    });

    it('should fail form validation with invalid data', async () => {
      const { result } = renderHook(() => useFormValidation(schema));

      // Set invalid form data
      act(() => {
        result.current.handleFieldChange('email', 'invalid-email');
        result.current.handleFieldChange('password', 'short');
      });

      const isValid = await act(async () => {
        return await result.current.validateForm();
      });

      expect(isValid).toBe(false);
      expect(result.current.isValid).toBe(false);
      expect(Object.keys(result.current.errors)).toHaveLength(2);
    });

    it('should reset form state', () => {
      const { result } = renderHook(() => useFormValidation(schema));

      // Set some data and errors
      act(() => {
        result.current.handleFieldChange('email', 'test@example.com');
        result.current.setFieldTouched('email', true);
      });

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.formData).toEqual({});
      expect(result.current.errors).toEqual({});
      expect(result.current.touched).toEqual({});
      expect(result.current.isValid).toBe(true);
    });

    it('should handle async validation', async () => {
      const asyncSchema = createValidationSchema()
        .field('username')
          .required('Username is required')
          .async(async (value) => {
            // Simulate async validation (e.g., checking if username is available)
            await new Promise(resolve => setTimeout(resolve, 100));
            return value !== 'taken';
          }, 'Username is already taken')
          .build()
        .build();

      const { result } = renderHook(() => useFormValidation(asyncSchema));

      await act(async () => {
        result.current.handleFieldBlur('username', 'taken');
      });

      expect(result.current.errors.username?.message).toBe('Username is already taken');
    });
  });
});