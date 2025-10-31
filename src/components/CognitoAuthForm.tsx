/**
 * Cognito Authentication Form Component
 * Handles login, signup, and password reset with AWS Cognito
 */

import React, { useState } from 'react';
import { useCognitoAuth } from '../hooks/useCognitoAuth';
import { useToast } from '../hooks/useToast';
import { logger } from '../lib/logging';

interface CognitoAuthFormProps {
  mode?: 'signin' | 'signup' | 'reset' | 'confirm-signup' | 'confirm-reset';
  onModeChange?: (mode: 'signin' | 'signup' | 'reset' | 'confirm-signup' | 'confirm-reset') => void;
  onSuccess?: () => void;
}

export const CognitoAuthForm: React.FC<CognitoAuthFormProps> = ({
  mode = 'signin',
  onModeChange,
  onSuccess
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  const auth = useCognitoAuth();
  const { showToast } = useToast();
  const formLogger = logger.child({ component: 'CognitoAuthForm' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      switch (mode) {
        case 'signin':
          await handleSignIn();
          break;
        case 'signup':
          await handleSignUp();
          break;
        case 'reset':
          await handlePasswordReset();
          break;
        case 'confirm-signup':
          await handleConfirmSignUp();
          break;
        case 'confirm-reset':
          await handleConfirmPasswordReset();
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      showToast(errorMessage, 'error');
      formLogger.error('Authentication form error', error as Error, { mode });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    await auth.signInWithEmailPassword(email, password);
    showToast('Successfully signed in!', 'success');
    onSuccess?.();
  };

  const handleSignUp = async () => {
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    const result = await auth.signUpWithEmailPassword(email, password);
    
    if (result.isConfirmed) {
      showToast('Account created successfully!', 'success');
      onSuccess?.();
    } else {
      setPendingEmail(email);
      showToast('Please check your email for a confirmation code', 'info');
      onModeChange?.('confirm-signup');
    }
  };

  const handlePasswordReset = async () => {
    await auth.resetPassword(email);
    setPendingEmail(email);
    showToast('Password reset code sent to your email', 'info');
    onModeChange?.('confirm-reset');
  };

  const handleConfirmSignUp = async () => {
    await auth.confirmSignUp(pendingEmail || email, code);
    showToast('Email confirmed! You can now sign in.', 'success');
    onModeChange?.('signin');
  };

  const handleConfirmPasswordReset = async () => {
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    await auth.confirmPasswordReset(pendingEmail || email, code, password);
    showToast('Password reset successfully!', 'success');
    onModeChange?.('signin');
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await auth.signInWithGoogle();
      // Redirect will happen automatically
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Google sign in failed';
      showToast(errorMessage, 'error');
      formLogger.error('Google sign in error', error as Error);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    try {
      await auth.resendConfirmationCode(pendingEmail || email);
      showToast('Confirmation code resent', 'info');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to resend code';
      showToast(errorMessage, 'error');
    }
  };

  const renderForm = () => {
    switch (mode) {
      case 'signin':
        return (
          <>
            <h2 className="text-2xl font-bold text-center mb-6">Sign In</h2>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sign In with Google
              </button>

              <div className="text-center space-y-2">
                <button
                  type="button"
                  onClick={() => onModeChange?.('signup')}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Don't have an account? Sign up
                </button>
                <br />
                <button
                  type="button"
                  onClick={() => onModeChange?.('reset')}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Forgot your password?
                </button>
              </div>
            </div>
          </>
        );

      case 'signup':
        return (
          <>
            <h2 className="text-2xl font-bold text-center mb-6">Sign Up</h2>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating Account...' : 'Sign Up'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => onModeChange?.('signin')}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </div>
          </>
        );

      case 'confirm-signup':
        return (
          <>
            <h2 className="text-2xl font-bold text-center mb-6">Confirm Your Email</h2>
            
            <div className="space-y-4">
              <p className="text-gray-600 text-center">
                We sent a confirmation code to {pendingEmail || email}
              </p>

              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmation Code
                </label>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Confirming...' : 'Confirm Email'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendCode}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Resend confirmation code
                </button>
              </div>
            </div>
          </>
        );

      case 'reset':
        return (
          <>
            <h2 className="text-2xl font-bold text-center mb-6">Reset Password</h2>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send Reset Code'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => onModeChange?.('signin')}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Back to sign in
                </button>
              </div>
            </div>
          </>
        );

      case 'confirm-reset':
        return (
          <>
            <h2 className="text-2xl font-bold text-center mb-6">Set New Password</h2>
            
            <div className="space-y-4">
              <p className="text-gray-600 text-center">
                Enter the code sent to {pendingEmail || email}
              </p>

              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                  Reset Code
                </label>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
      <form onSubmit={handleSubmit}>
        {renderForm()}
      </form>
    </div>
  );
};