import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
<<<<<<< HEAD
import { render, screen, fireEvent, waitFor } from '@test/utils/render';
import { userEvent } from '@testing-library/user-event';
=======
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../../test/utils/render';
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
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
<<<<<<< HEAD
    vi.restoreAllMocks();
=======
    vi.clearAllMocks();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
  });

  describe('rendering', () => {
    it('should render sign in form by default', () => {
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      expect(screen.getByText('Sign In')).toBeInTheDocument();
<<<<<<< HEAD
      expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in$/i })).toBeInTheDocument();
      expect(screen.getByText("Don't have an account? Create one")).toBeInTheDocument();
=======
      expect(screen.getByText('Access your AI content verification dashboard')).toBeInTheDocument();
      expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in$/i })).toBeInTheDocument();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });

    it('should render create account form when toggled', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const toggleButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleButton);

      expect(screen.getByText('Create Account')).toBeInTheDocument();
<<<<<<< HEAD
      expect(screen.getByPlaceholderText('Confirm your password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create account$/i })).toBeInTheDocument();
      expect(screen.getByText('Already have an account? Sign in')).toBeInTheDocument();
    });

    it('should render Google sign in button', () => {
=======
      expect(screen.getByText('Get started with enterprise AI accuracy verification')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create account$/i })).toBeInTheDocument();
    });

    it('should render Google sign-in button', () => {
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    });

<<<<<<< HEAD
=======
    it('should render close button', () => {
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: '' }); // SVG close button
      expect(closeButton).toBeInTheDocument();
    });

>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    it('should render enterprise features section', () => {
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      expect(screen.getByText('Enterprise Features')).toBeInTheDocument();
      expect(screen.getByText('• SOC 2 Compliant')).toBeInTheDocument();
      expect(screen.getByText('• GDPR Ready')).toBeInTheDocument();
      expect(screen.getByText('• 99.9% Uptime')).toBeInTheDocument();
    });
  });

  describe('form interactions', () => {
<<<<<<< HEAD
    it('should update email field', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByPlaceholderText('Enter your email');
=======
    it('should allow typing in email field', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByLabelText('Email Address');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      await user.type(emailInput, 'test@example.com');

      expect(emailInput).toHaveValue('test@example.com');
    });

<<<<<<< HEAD
    it('should update password field', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const passwordInput = screen.getByPlaceholderText('Enter your password');
=======
    it('should allow typing in password field', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const passwordInput = screen.getByLabelText('Password');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      await user.type(passwordInput, 'password123');

      expect(passwordInput).toHaveValue('password123');
    });

    it('should toggle password visibility', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

<<<<<<< HEAD
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const toggleButton = screen.getByRole('button', { name: /toggle password visibility/i });

      expect(passwordInput).toHaveAttribute('type', 'password');

      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'text');

      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
=======
      const passwordInput = screen.getByLabelText('Password');
      const toggleButton = screen.getAllByRole('button').find(btn => 
        btn.querySelector('svg')
      );

      expect(passwordInput).toHaveAttribute('type', 'password');

      if (toggleButton) {
        await user.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'text');

        await user.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'password');
      }
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });

    it('should toggle confirm password visibility in signup mode', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Switch to signup mode
      const toggleModeButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleModeButton);

<<<<<<< HEAD
      const confirmPasswordInput = screen.getByPlaceholderText('Confirm your password');
      const toggleButtons = screen.getAllByRole('button', { name: /toggle password visibility/i });
=======
      const confirmPasswordInput = screen.getByLabelText('Confirm Password');
      const toggleButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg')
      );
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      const confirmToggleButton = toggleButtons[1]; // Second toggle button

      expect(confirmPasswordInput).toHaveAttribute('type', 'password');

<<<<<<< HEAD
      await user.click(confirmToggleButton);
      expect(confirmPasswordInput).toHaveAttribute('type', 'text');
=======
      if (confirmToggleButton) {
        await user.click(confirmToggleButton);
        expect(confirmPasswordInput).toHaveAttribute('type', 'text');
      }
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });

    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

<<<<<<< HEAD
      const closeButton = screen.getByRole('button', { name: /close/i });
=======
      const closeButton = screen.getByRole('button', { name: '' }); // SVG close button
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
<<<<<<< HEAD
  });

  describe('Google OAuth', () => {
    it('should handle successful Google sign in', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
=======

    it('should toggle between sign in and sign up modes', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Start in sign in mode
      expect(screen.getByText('Sign In')).toBeInTheDocument();

      // Switch to sign up
      const signUpToggle = screen.getByText("Don't have an account? Create one");
      await user.click(signUpToggle);

      expect(screen.getByText('Create Account')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();

      // Switch back to sign in
      const signInToggle = screen.getByText('Already have an account? Sign in');
      await user.click(signInToggle);

      expect(screen.getByText('Sign In')).toBeInTheDocument();
      expect(screen.queryByLabelText('Confirm Password')).not.toBeInTheDocument();
    });
  });

  describe('Google OAuth', () => {
    it('should handle successful Google sign-in', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({ error: null } as any);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

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
<<<<<<< HEAD
        data: {},
        error: { message: 'provider is not enabled' }
      });
=======
        error: { message: 'provider is not enabled' }
      } as any);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      await waitFor(() => {
        expect(screen.getByText(/google sign-in is not configured/i)).toBeInTheDocument();
      });
    });

<<<<<<< HEAD
    it('should handle Google OAuth general errors', async () => {
=======
    it('should handle Google OAuth generic errors', async () => {
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      const user = userEvent.setup();
      mockSupabase.auth.signInWithOAuth.mockRejectedValue(new Error('Network error'));

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to sign in with google/i)).toBeInTheDocument();
      });
    });

<<<<<<< HEAD
    it('should show loading state during Google sign in', async () => {
      const user = userEvent.setup();
      let resolveOAuth: (value: any) => void;
      const oauthPromise = new Promise((resolve) => {
        resolveOAuth = resolve;
      });
      mockSupabase.auth.signInWithOAuth.mockReturnValue(oauthPromise);
=======
    it('should show loading state during Google sign-in', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithOAuth.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ error: null } as any), 100))
      );
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      expect(googleButton).toBeDisabled();
<<<<<<< HEAD

      // Resolve the OAuth
      resolveOAuth!({ data: {}, error: null });
=======
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });

  describe('email/password authentication', () => {
    it('should handle successful sign in', async () => {
      const user = userEvent.setup();
<<<<<<< HEAD
      mockSupabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
=======
      mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null } as any);

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(signInButton);

      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });

<<<<<<< HEAD
      expect(mockOnAuthSuccess).toHaveBeenCalled();
=======
      await waitFor(() => {
        expect(mockOnAuthSuccess).toHaveBeenCalled();
      });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });

    it('should handle sign in errors', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
<<<<<<< HEAD
        data: {},
        error: { message: 'Invalid credentials' }
      });

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
=======
        error: { message: 'Invalid credentials' }
      } as any);

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
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
<<<<<<< HEAD
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
=======
      mockSupabase.auth.signUp.mockResolvedValue({ error: null } as any);

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Switch to sign up mode
      const toggleButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleButton);

      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
      const confirmPasswordInput = screen.getByLabelText('Confirm Password');
      const signUpButton = screen.getByRole('button', { name: /create account$/i });

      await user.type(emailInput, 'newuser@example.com');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      await user.type(passwordInput, 'password123');
      await user.type(confirmPasswordInput, 'password123');
      await user.click(signUpButton);

      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
<<<<<<< HEAD
        email: 'test@example.com',
=======
        email: 'newuser@example.com',
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
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
<<<<<<< HEAD
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
=======
        error: { message: 'Email already registered' }
      } as any);

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Switch to sign up mode
      const toggleButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleButton);

      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
      const confirmPasswordInput = screen.getByLabelText('Confirm Password');
      const signUpButton = screen.getByRole('button', { name: /create account$/i });

      await user.type(emailInput, 'existing@example.com');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      await user.type(passwordInput, 'password123');
      await user.type(confirmPasswordInput, 'password123');
      await user.click(signUpButton);

      await waitFor(() => {
        expect(screen.getByText('Email already registered')).toBeInTheDocument();
      });
    });
<<<<<<< HEAD
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
=======

    it('should show loading state during authentication', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithPassword.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ error: null } as any), 100))
      );

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(signInButton);

      expect(screen.getByText('Signing In...')).toBeInTheDocument();
      expect(signInButton).toBeDisabled();
    });
  });

  describe('form validation', () => {
    it('should validate password mismatch in sign up mode', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Switch to sign up mode
      const toggleButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleButton);

      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
      const confirmPasswordInput = screen.getByLabelText('Confirm Password');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
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

<<<<<<< HEAD
      const emailInput = screen.getByPlaceholderText('Enter your email');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, '123');
=======
      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, '123'); // Too short
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      await user.click(signInButton);

      expect(screen.getByText('Password must be at least 6 characters long')).toBeInTheDocument();
      expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
    });

<<<<<<< HEAD
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
=======
    it('should require email field', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(passwordInput, 'password123');
      await user.click(signInButton);

      // HTML5 validation should prevent submission
      expect(emailInput).toBeInvalid();
    });

    it('should require password field', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.click(signInButton);

      // HTML5 validation should prevent submission
      expect(passwordInput).toBeInvalid();
    });
  });

  describe('error and success states', () => {
    it('should clear errors when switching between modes', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        error: { message: 'Invalid credentials' }
      } as any);

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Trigger an error in sign in mode
      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');
      await user.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });

<<<<<<< HEAD
      // Switch modes
      const toggleModeButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleModeButton);

      expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument();
    });
=======
      // Switch to sign up mode
      const toggleButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleButton);

      // Error should be cleared
      expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument();
    });

    it('should clear form fields when switching modes', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const passwordInput = screen.getByLabelText('Password');
      await user.type(passwordInput, 'password123');

      // Switch to sign up mode
      const toggleButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleButton);

      // Password field should be cleared
      expect(passwordInput).toHaveValue('');
    });

    it('should display success message after successful sign up', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signUp.mockResolvedValue({ error: null } as any);

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Switch to sign up mode
      const toggleButton = screen.getByText("Don't have an account? Create one");
      await user.click(toggleButton);

      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
      const confirmPasswordInput = screen.getByLabelText('Confirm Password');
      const signUpButton = screen.getByRole('button', { name: /create account$/i });

      await user.type(emailInput, 'newuser@example.com');
      await user.type(passwordInput, 'password123');
      await user.type(confirmPasswordInput, 'password123');
      await user.click(signUpButton);

      await waitFor(() => {
        expect(screen.getByText('Account created successfully! You can now sign in.')).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('should have proper form labels', () => {
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      // Tab through form elements
      await user.tab();
      expect(screen.getByLabelText('Email Address')).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText('Password')).toHaveFocus();

      await user.tab();
      // Should focus on password visibility toggle
      
      await user.tab();
      expect(screen.getByRole('button', { name: /sign in$/i })).toHaveFocus();
    });

    it('should announce errors to screen readers', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        error: { message: 'Invalid credentials' }
      } as any);

      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
      const signInButton = screen.getByRole('button', { name: /sign in$/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');
      await user.click(signInButton);

      await waitFor(() => {
        const errorMessage = screen.getByText('Invalid credentials');
        expect(errorMessage.closest('div')).toHaveAttribute('role', 'alert');
      });
    });

    it('should have proper ARIA attributes for password visibility toggles', () => {
      render(<AuthForm onAuthSuccess={mockOnAuthSuccess} onClose={mockOnClose} />);

      const passwordInput = screen.getByLabelText('Password');
      const toggleButton = screen.getAllByRole('button').find(btn => 
        btn.querySelector('svg')
      );

      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(toggleButton).toHaveAttribute('type', 'button');
    });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
  });
});