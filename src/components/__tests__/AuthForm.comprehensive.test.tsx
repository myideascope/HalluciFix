import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthForm from '../AuthForm';
import { useAuth } from '../../hooks/useAuth';
import { useAuthErrorRecovery } from '../../lib/auth/authErrorRecovery';
import { useComponentLogger } from '../../hooks/useLogger';

// Mock hooks
vi.mock('../../hooks/useAuth');
vi.mock('../../lib/auth/authErrorRecovery');
vi.mock('../../hooks/useLogger');

const mockUseAuth = vi.mocked(useAuth);
const mockUseAuthErrorRecovery = vi.mocked(useAuthErrorRecovery);
const mockUseComponentLogger = vi.mocked(useComponentLogger);

describe('AuthForm', () => {
  const mockOnAuthSuccess = vi.fn();
  const mockOnClose = vi.fn();

  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User'
  };

  const mockAuth = {
    signInWithGoogle: vi.fn(),
    signInWithEmailPassword: vi.fn(),
    signUpWithEmailPassword: vi.fn(),
    isOAuthAvailable: true,
    user: null,
    loading: false,
    signOut: vi.fn(),
    isAdmin: false
  };

  const mockHandleAuthError = vi.fn();
  const mockCanRecover = vi.fn();

  const mockLogError = vi.fn();
  const mockLogUserAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue(mockAuth);
    mockUseAuthErrorRecovery.mockReturnValue({
      handleAuthError: mockHandleAuthError,
      canRecover: mockCanRecover
    });
    mockUseComponentLogger.mockReturnValue({
      logError: mockLogError,
      logUserAction: mockLogUserAction,
      info: vi.fn(),
      warn: vi.fn()
    });
  });

  it('renders auth form correctly', () => {
    render(
      <AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />
    );

    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('handles email/password sign in', async () => {
    const userEvent = userEvent.setup();
    
    mockAuth.signInWithEmailPassword.mockResolvedValue({ success: true });

    render(
      <AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />
    );

    // Fill form
    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    
    // Submit form
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockAuth.signInWithEmailPassword).toHaveBeenCalledWith(
        'test@example.com',
        'password123'
      );
    });

    expect(mockOnAuthSuccess).toHaveBeenCalled();
  });

  it('handles Google Sign-In', async () => {
    const userEvent = userEvent.setup();
    
    mockAuth.signInWithGoogle.mockResolvedValue({ success: true });

    render(
      <AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />
    );

    // Switch to Google auth
    await userEvent.click(screen.getByText('Sign in with Google'));

    await waitFor(() => {
      expect(mockAuth.signInWithGoogle).toHaveBeenCalled();
    });

    expect(mockOnAuthSuccess).toHaveBeenCalled();
  });

  it('shows error when OAuth is not available', async () => {
    mockAuth.isOAuthAvailable = false;
    
    const userEvent = userEvent.setup();

    render(
      <AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />
    );

    await userEvent.click(screen.getByText('Sign in with Google'));

    expect(screen.getByText(/Google Sign-In is not available/)).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    const userEvent = userEvent.setup();

    render(
      <AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />
    );

    // Try to submit without filling fields
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    // Should show validation errors
    expect(screen.getByText(/Email is required/)).toBeInTheDocument();
    expect(screen.getByText(/Password is required/)).toBeInTheDocument();
  });

  it('handles authentication errors gracefully', async () => {
    const userEvent = userEvent.setup();
    
    const authError = new Error('Invalid credentials');
    mockAuth.signInWithEmailPassword.mockRejectedValue(authError);

    render(
      <AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />
    );

    // Fill and submit form
    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpassword');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockLogError).toHaveBeenCalledWith(
        'Authentication failed',
        authError,
        expect.objectContaining({
          email: 'test@example.com'
        })
      );
    });

    expect(screen.getByText(/Authentication failed/)).toBeInTheDocument();
  });

  it('shows loading state during authentication', async () => {
    const userEvent = userEvent.setup();
    
    // Mock a delayed response
    mockAuth.signInWithEmailPassword.mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 100))
    );

    render(
      <AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />
    );

    // Fill and submit form
    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    // Should show loading state
    expect(screen.getByText(/Signing in/)).toBeInTheDocument();

    // Wait for completion
    await waitFor(() => {
      expect(mockOnAuthSuccess).toHaveBeenCalled();
    }, { timeout: 200 });
  });

  it('handles form switching between sign in and sign up', async () => {
    const userEvent = userEvent.setup();

    render(
      <AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />
    );

    // Switch to sign up
    await userEvent.click(screen.getByText(/Sign up/));

    expect(screen.getByText('Create Account')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Last Name')).toBeInTheDocument();

    // Switch back to sign in
    await userEvent.click(screen.getByText(/Sign in/));

    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.queryByLabelText('Confirm Password')).not.toBeInTheDocument();
  });

  it('validates password confirmation in sign up mode', async () => {
    const userEvent = userEvent.setup();

    render(
      <AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />
    );

    // Switch to sign up
    await userEvent.click(screen.getByText(/Sign up/));

    // Fill form with mismatched passwords
    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.type(screen.getByLabelText('Confirm Password'), 'differentpassword');
    await userEvent.type(screen.getByLabelText('First Name'), 'Test');
    await userEvent.type(screen.getByLabelText('Last Name'), 'User');

    // Try to submit
    await userEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(screen.getByText(/Passwords do not match/)).toBeInTheDocument();
  });

  it('handles password reset flow', async () => {
    const userEvent = userEvent.setup();

    render(
      <AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />
    );

    // Click forgot password
    await userEvent.click(screen.getByText(/Forgot password/));

    expect(screen.getByText('Reset Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeInTheDocument();

    // Fill and submit reset form
    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    // Should show success message
    expect(screen.getByText(/Password reset email sent/)).toBeInTheDocument();
  });

  it('tracks user actions with analytics', async () => {
    const userEvent = userEvent.setup();

    render(
      <AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />
    );

    // Perform actions
    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    // Should track user actions
    expect(mockLogUserAction).toHaveBeenCalledWith(
      'auth_form_interaction',
      expect.objectContaining({
        action: 'submit',
        form_type: 'signin',
        email_provided: true
      })
    );
  });
});