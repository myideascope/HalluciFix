import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@test/utils/render';
import { userEvent } from '@testing-library/user-event';
import AuthForm from '../AuthForm';
import { supabase } from '../../lib/supabase';

// Mock Supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn()
    }
  }
}));

const mockSupabase = vi.mocked(supabase);

describe('AuthForm', () => {
  const mockOnAuthSuccess = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render sign in form by default', () => {
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      expect(screen.getByText('Sign In')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in$/i })).toBeInTheDocument();
      expect(screen.getByText("Don't have an account? Create one")).toBeInTheDocument();
    });

    it('should render create account form when toggled', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const toggleButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleButton);

      expect(screen.getByText('Create Account')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Confirm your password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create account$/i })).toBeInTheDocument();
      expect(screen.getByText('Already have an account? Sign in')).toBeInTheDocument();
    });

    it('should render Google sign in button', () => {
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    });

    it('should render enterprise features section', () => {
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      expect(screen.getByText('Enterprise Features')).toBeInTheDocument();
      expect(screen.getByText('• SOC 2 Compliant')).toBeInTheDocument();
      expect(screen.getByText('• GDPR Ready')).toBeInTheDocument();
      expect(screen.getByText('• 99.9% Uptime')).toBeInTheDocument();
    });
  });

  describe('form interactions', () => {
    it('should update email field', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      await user.type(emailInput, 'test@example.com');

      expect(emailInput).toHaveValue('test@example.com');
    });

    it('should update password field', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'password123');

      expect(passwordInput).toHaveValue('password123');
    });

    it('should toggle password visibility', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const toggleButton = screen.getByRole('button', { name: /toggle password visibility/i });

      expect(passwordInput).toHaveAttribute('type', 'password');

      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'text');

      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('should toggle confirm password visibility in signup mode', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Switch to signup mode
      const toggleModeButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleModeButton);

      const confirmPasswordInput = screen.getByPlaceholderText('Confirm your password');
      const toggleButtons = screen.getAllByRole('button', { name: /toggle password visibility/i });
      const confirmToggleButton = toggleButtons[1]; // Second toggle button

      expect(confirmPasswordInput).toHaveAttribute('type', 'password');

      await user.click(confirmToggleButton);
      expect(confirmPasswordInput).toHaveAttribute('type', 'text');
    });

    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Google OAuth', () => {
    it('should handle successful Google sign in', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null });

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`
        }
      });
    });

    it('should handle Google OAuth configuration errors', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: {},
        error: { message: 'provider is not enabled' }
      });

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      await waitFor(() => {
        expect(screen.getByText(/google sign-in is not configured/i)).toBeInTheDocument();
      });
    });

    it('should handle Google OAuth general errors', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithOAuth.mockRejectedValue(new Error('Network error'));

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to sign in with google/i)).toBeInTheDocument();
      });
    });

    it('should show loading state during Google sign in', async () => {
      const user = userEvent.setup();
      let resolveOAuth: (value: any) => void;
      const oauthPromise = new Promise((resolve) => {
        resolveOAuth = resolve;
      });
      mockSupabase.auth.signInWithOAuth.mockReturnValue(oauthPromise);

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      expect(googleButton).toBeDisabled();

      // Resolve the OAuth
      resolveOAuth!({ data: {}, error: null });
    });
  });

  describe('email/password authentication', () => {
    it('should handle successful sign in', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(signInButton);

      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });

      expect(mockOnAuthSuccess).toHaveBeenCalled();
    });

    it('should handle sign in errors', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: {},
        error: { message: 'Invalid credentials' }
      });

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');
      await user.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });

      expect(mockOnAuthSuccess).not.toHaveBeenCalled();
    });

    it('should handle successful sign up', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signUp.mockResolvedValue({ data: {}, error: null });

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Switch to signup mode
      const toggleModeButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleModeButton);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm your password');
      const signUpButton = screen.getByRole('button', { name: /create account$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.type(confirmPasswordInput, 'password123');
      await user.click(signUpButton);

      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });

      await waitFor(() => {
        expect(screen.getByText('Account created successfully! You can now sign in.')).toBeInTheDocument();
        expect(screen.getByText('Sign In')).toBeInTheDocument(); // Should switch back to sign in mode
      });
    });

    it('should handle sign up errors', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signUp.mockResolvedValue({
        data: {},
        error: { message: 'Email already registered' }
      });

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Switch to signup mode
      const toggleModeButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleModeButton);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm your password');
      const signUpButton = screen.getByRole('button', { name: /create account$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.type(confirmPasswordInput, 'password123');
      await user.click(signUpButton);

      await waitFor(() => {
        expect(screen.getByText('Email already registered')).toBeInTheDocument();
      });
    });
  });

  describe('form validation', () => {
    it('should validate password mismatch in signup mode', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Switch to signup mode
      const toggleModeButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleModeButton);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm your password');
      const signUpButton = screen.getByRole('button', { name: /create account$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.type(confirmPasswordInput, 'differentpassword');
      await user.click(signUpButton);

      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
    });

    it('should validate minimum password length', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, '123');
      await user.click(signInButton);

      expect(screen.getByText('Password must be at least 6 characters long')).toBeInTheDocument();
      expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it('should require email and password fields', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const signInButton = screen.getByRole('button', { name: /sign in$/i });
      await user.click(signInButton);

      // HTML5 validation should prevent submission
      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      
      expect(emailInput).toBeRequired();
      expect(passwordInput).toBeRequired();
    });
  });

  describe('loading states', () => {
    it('should show loading state during sign in', async () => {
      const user = userEvent.setup();
      let resolveSignIn: (value: any) => void;
      const signInPromise = new Promise((resolve) => {
        resolveSignIn = resolve;
      });
      mockSupabase.auth.signInWithPassword.mockReturnValue(signInPromise);

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(signInButton);

      expect(screen.getByText('Signing In...')).toBeInTheDocument();
      expect(signInButton).toBeDisabled();

      // Resolve the sign in
      resolveSignIn!({ data: {}, error: null });

      await waitFor(() => {
        expect(mockOnAuthSuccess).toHaveBeenCalled();
      });
    });

    it('should show loading state during sign up', async () => {
      const user = userEvent.setup();
      let resolveSignUp: (value: any) => void;
      const signUpPromise = new Promise((resolve) => {
        resolveSignUp = resolve;
      });
      mockSupabase.auth.signUp.mockReturnValue(signUpPromise);

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Switch to signup mode
      const toggleModeButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleModeButton);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm your password');
      const signUpButton = screen.getByRole('button', { name: /create account$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.type(confirmPasswordInput, 'password123');
      await user.click(signUpButton);

      expect(screen.getByText('Creating Account...')).toBeInTheDocument();
      expect(signUpButton).toBeDisabled();

      // Resolve the sign up
      resolveSignUp!({ data: {}, error: null });

      await waitFor(() => {
        expect(screen.getByText('Account created successfully! You can now sign in.')).toBeInTheDocument();
      });
    });
  });

  describe('mode switching', () => {
    it('should clear form when switching modes', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      // Switch to signup mode
      const toggleModeButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleModeButton);

      expect(passwordInput).toHaveValue('');

      // Switch back to sign in mode
      const backToggleButton = screen.getByText('Already have an account? Sign in');
      await user.click(backToggleButton);

      expect(passwordInput).toHaveValue('');
    });

    it('should clear error messages when switching modes', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: {},
        error: { message: 'Invalid credentials' }
      });

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');
      await user.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });

      // Switch modes
      const toggleModeButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleModeButton);

      expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument();
    });
  });
});