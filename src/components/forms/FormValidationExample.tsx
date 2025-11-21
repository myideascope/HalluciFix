import React, { useState } from 'react';
import { logger } from './logging';
import {
  FormSection,
  FormGroup,
  ValidatedInput,
  ValidatedTextarea,
  ValidatedSelect,
  ValidatedCheckbox,
  EmailInput,
  PhoneInput,
  PasswordInput,
  CurrencyInput,
  FormErrorList,
  useFormValidation,
  createValidationSchema,
  FormErrorType
} from './index';

// Example form validation schema
const exampleSchema = createValidationSchema()
  .field('firstName')
    .required('First name is required')
    .minLength(2, 'First name must be at least 2 characters')
    .maxLength(50, 'First name must be less than 50 characters')
    .build()
  .field('lastName')
    .required('Last name is required')
    .minLength(2, 'Last name must be at least 2 characters')
    .maxLength(50, 'Last name must be less than 50 characters')
    .build()
  .field('email')
    .required('Email is required')
    .email('Please enter a valid email address')
    .async(async (email) => {
      // Simulate async email validation
      await new Promise(resolve => setTimeout(resolve, 1000));
      return !email.includes('test@'); // Reject test emails
    }, 'This email domain is not allowed')
    .build()
  .field('phone')
    .required('Phone number is required')
    .pattern(/^\(\d{3}\) \d{3}-\d{4}$/, 'Please enter a valid phone number')
    .build()
  .field('password')
    .required('Password is required')
    .minLength(8, 'Password must be at least 8 characters')
    .pattern(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
      'Password must contain uppercase, lowercase, number, and special character'
    )
    .build()
  .field('confirmPassword')
    .required('Please confirm your password')
    .custom((value, formData) => {
      return value === formData?.password;
    }, 'Passwords do not match')
    .build()
  .field('bio')
    .maxLength(500, 'Bio must be less than 500 characters')
    .build()
  .field('country')
    .required('Please select a country')
    .build()
  .field('salary')
    .pattern(/^\d+(\.\d{2})?$/, 'Please enter a valid amount')
    .build()
  .field('terms')
    .custom((value) => value === true, 'You must accept the terms and conditions')
    .build()
  .build();

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  bio: string;
  country: string;
  salary: string;
  terms: boolean;
}

export const FormValidationExample: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  const {
    formData,
    errors,
    touched,
    validating,
    isValid,
    isValidating,
    handleFieldChange,
    handleFieldBlur,
    validateForm,
    clearAllErrors,
    resetForm
  } = useFormValidation(exampleSchema);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitSuccess(false);

    try {
      const isFormValid = await validateForm();
      
      if (isFormValid) {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        logger.info("Form submitted:", { formData });
        setSubmitSuccess(true);
        resetForm();
      }
    } catch (error) {
      logger.error("Form submission error:", error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    resetForm();
    setSubmitSuccess(false);
  };

  // Get all errors for error summary
  const allErrors = Object.values(errors).filter(Boolean) as FormErrorType[];

  const countryOptions = [
    { value: '', label: 'Select a country' },
    { value: 'us', label: 'United States' },
    { value: 'ca', label: 'Canada' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'de', label: 'Germany' },
    { value: 'fr', label: 'France' },
    { value: 'jp', label: 'Japan' },
    { value: 'au', label: 'Australia' }
  ];

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Form Validation Example
        </h2>
        <p className="text-slate-600">
          This form demonstrates comprehensive validation with real-time feedback,
          input constraints, and accessibility features.
        </p>
      </div>

      {/* Success Message */}
      {submitSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-green-700 font-medium">
              Form submitted successfully!
            </p>
          </div>
        </div>
      )}

      {/* Error Summary */}
      {allErrors.length > 0 && (
        <div className="mb-6">
          <FormErrorList errors={allErrors} />
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Personal Information Section */}
        <FormSection
          title="Personal Information"
          description="Please provide your basic information"
          required
          className="mb-8"
        >
          <FormGroup orientation="horizontal">
            <ValidatedInput
              label="First Name"
              type="text"
              placeholder="Enter your first name"
              required
              error={touched.firstName ? errors.firstName : null}
              isValidating={validating.firstName}
              onValueChange={(value) => handleFieldChange('firstName', value)}
              onFieldBlur={(value) => handleFieldBlur('firstName', value)}
            />
            
            <ValidatedInput
              label="Last Name"
              type="text"
              placeholder="Enter your last name"
              required
              error={touched.lastName ? errors.lastName : null}
              isValidating={validating.lastName}
              onValueChange={(value) => handleFieldChange('lastName', value)}
              onFieldBlur={(value) => handleFieldBlur('lastName', value)}
            />
          </FormGroup>

          <FormGroup>
            <EmailInput
              label="Email Address"
              placeholder="Enter your email address"
              required
              error={touched.email ? errors.email : null}
              isValidating={validating.email}
              onValueChange={(value) => handleFieldChange('email', value)}
              onFieldBlur={(value) => handleFieldBlur('email', value)}
              helpText="We'll never share your email with anyone else"
            />

            <PhoneInput
              label="Phone Number"
              placeholder="Enter your phone number"
              required
              error={touched.phone ? errors.phone : null}
              isValidating={validating.phone}
              onValueChange={(value) => handleFieldChange('phone', value)}
              onFieldBlur={(value) => handleFieldBlur('phone', value)}
            />
          </FormGroup>
        </FormSection>

        {/* Security Section */}
        <FormSection
          title="Security"
          description="Create a secure password for your account"
          required
          className="mb-8"
        >
          <FormGroup>
            <PasswordInput
              label="Password"
              placeholder="Create a strong password"
              required
              error={touched.password ? errors.password : null}
              isValidating={validating.password}
              onValueChange={(value) => handleFieldChange('password', value)}
              onFieldBlur={(value) => handleFieldBlur('password', value)}
            />

            <ValidatedInput
              label="Confirm Password"
              type="password"
              placeholder="Confirm your password"
              required
              error={touched.confirmPassword ? errors.confirmPassword : null}
              isValidating={validating.confirmPassword}
              onValueChange={(value) => handleFieldChange('confirmPassword', value)}
              onFieldBlur={(value) => handleFieldBlur('confirmPassword', value)}
            />
          </FormGroup>
        </FormSection>

        {/* Additional Information Section */}
        <FormSection
          title="Additional Information"
          description="Optional information to complete your profile"
          className="mb-8"
        >
          <FormGroup>
            <ValidatedTextarea
              label="Bio"
              placeholder="Tell us about yourself (optional)"
              rows={4}
              optional
              error={touched.bio ? errors.bio : null}
              isValidating={validating.bio}
              onValueChange={(value) => handleFieldChange('bio', value)}
              onFieldBlur={(value) => handleFieldBlur('bio', value)}
              helpText="Maximum 500 characters"
            />

            <ValidatedSelect
              label="Country"
              options={countryOptions}
              placeholder="Select your country"
              required
              error={touched.country ? errors.country : null}
              isValidating={validating.country}
              onValueChange={(value) => handleFieldChange('country', value)}
              onFieldBlur={(value) => handleFieldBlur('country', value)}
            />

            <CurrencyInput
              label="Expected Salary"
              placeholder="0.00"
              optional
              error={touched.salary ? errors.salary : null}
              isValidating={validating.salary}
              onValueChange={(value) => handleFieldChange('salary', value)}
              onFieldBlur={(value) => handleFieldBlur('salary', value)}
              helpText="Enter amount in USD"
            />
          </FormGroup>
        </FormSection>

        {/* Terms and Conditions */}
        <div className="mb-8">
          <ValidatedCheckbox
            id="terms"
            label="I agree to the Terms and Conditions and Privacy Policy"
            required
            error={touched.terms ? errors.terms : null}
            isValidating={validating.terms}
            onValueChange={(checked) => handleFieldChange('terms', checked)}
            onFieldBlur={(checked) => handleFieldBlur('terms', checked)}
            description="By checking this box, you agree to our terms of service and privacy policy."
          />
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-200">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Reset Form
          </button>

          <div className="flex items-center space-x-4">
            {isValidating && (
              <div className="flex items-center space-x-2 text-sm text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
                <span>Validating...</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isValidating || !isValid}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  <span>Submitting...</span>
                </div>
              ) : (
                'Submit Form'
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Form State Debug Info (Development Only) */}
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-8 p-4 bg-slate-50 rounded-lg">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Debug Information (Development Only)
          </summary>
          <div className="mt-4 space-y-2 text-xs">
            <div>
              <strong>Form Valid:</strong> {isValid ? 'Yes' : 'No'}
            </div>
            <div>
              <strong>Is Validating:</strong> {isValidating ? 'Yes' : 'No'}
            </div>
            <div>
              <strong>Form Data:</strong>
              <pre className="mt-1 p-2 bg-white rounded border text-xs overflow-auto">
                {JSON.stringify(formData, null, 2)}
              </pre>
            </div>
            <div>
              <strong>Errors:</strong>
              <pre className="mt-1 p-2 bg-white rounded border text-xs overflow-auto">
                {JSON.stringify(errors, null, 2)}
              </pre>
            </div>
            <div>
              <strong>Touched Fields:</strong>
              <pre className="mt-1 p-2 bg-white rounded border text-xs overflow-auto">
                {JSON.stringify(touched, null, 2)}
              </pre>
            </div>
          </div>
        </details>
      )}
    </div>
  );
};