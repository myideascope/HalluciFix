import React, { useState } from 'react';
import { Shield, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Chrome, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAuthErrorRecovery } from '../lib/auth/authErrorRecovery';
import { useComponentLogger } from '../hooks/useLogger';
import OAuthErrorDisplay from './OAuthErrorDisplay';
import AuthenticationErrorBoundary from './auth/AuthenticationErrorBoundary';

import { logger } from '../lib/logging';
interface AuthFormProps {
  onAuthSuccess: () => void;
  onClose: () => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ onAuthSuccess, onClose }) => {
  const { 
    signInWithGoogle, 
    signInWithEmailPassword, 
    signUpWithEmailPassword, 
    isOAuthAvailable, 
    user
  } = useAuth();
  const { handleAuthError, canRecover } = useAuthErrorRecovery();
  const { logError } = useComponentLogger('AuthForm');
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [success, setSuccess] = useState('');
  const [oauthError, setOAuthError] = useState<Error | null>(null);
  const [oauthAvailabilityMessage, setOAuthAvailabilityMessage] = useState<string>('');
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryAttempted, setRecoveryAttempted] = useState(false);

  // Check OAuth availability on component mount
  React.useEffect(() => {
    if (!isOAuthAvailable) {
      // Try to get more specific information about why OAuth is not available
      try {
        // Import the OAuth config to get detailed status
        import('../lib/oauth/oauthConfig').then(({ oauthConfig }) => {
          const status = oauthConfig.getAvailabilityStatus();
          if (!status.available && status.reason) {
            setOAuthAvailabilityMessage(status.reason);
          }
        }).catch(() => {
          setOAuthAvailabilityMessage('OAuth configuration could not be loaded');
        });
      } catch (error) {
        setOAuthAvailabilityMessage('OAuth service initialization failed');
      }
    }
  }, [isOAuthAvailable]);

  const handleGoogleSignIn = async () => {
    setError('');
    setOAuthError(null);
    setLoading(true);
    setRecoveryAttempted(false);

    try {
      if (!isOAuthAvailable) {
        const message = oauthAvailabilityMessage 
          ? `Google Sign-In is not available: ${oauthAvailabilityMessage}. Please use email/password authentication or contact your administrator.`
          : 'Google Sign-In is not configured for this application. Please use email/password authentication or contact your administrator.';
        setError(message);
        setLoading(false);
        return;
      }

      await signInWithGoogle();
      // If we reach here, the redirect should have happened
      // If not, there might be a popup blocker or other issue
    } catch (error: any) {
      logError('Google sign-in failed', error, {
        isOAuthAvailable,
        oauthAvailabilityMessage,
        userAgent: navigator.userAgent,
      });
      
      // Attempt automatic recovery for authentication errors
      if (error.message.includes('authentication') || error.message.includes('token') || error.message.includes('session')) {
        await attemptAuthRecovery(error);
      } else if (error.message.includes('OAuth') || error.message.includes('authentication')) {
        setOAuthError(error);
      } else {
        setError(error.message || 'Failed to sign in with Google. Please try again or use email/password authentication.');
      }
    } finally {
      setLoading(false);
    }
  };

  const attemptAuthRecovery = async (error: Error) => {
    if (!canRecover('token_expired', user?.id)) {
      setError(error.message);
      return;
    }

    setIsRecovering(true);
    setRecoveryAttempted(true);

    try {
      const recoveryResult = await handleAuthError(error, user?.id);
      
      if (recoveryResult.success) {
        setSuccess('Authentication recovered successfully. Please try signing in again.');
        // Clear the error and allow user to retry
        setError('');
      } else {
        setError(recoveryResult.error?.userMessage || 'Authentication recovery failed. Please try again.');
      }
    } catch (recoveryError) {
      logError('Auth recovery failed', recoveryError as Error, {
        originalError: error.message,
        userId: user?.id,
        recoveryAttempted: true,
      });
      setError('Authentication recovery failed. Please try signing in again.');
    } finally {
      setIsRecovering(false);
    }
  };

  const handleOAuthRetry = () => {
    setOAuthError(null);
    handleGoogleSignIn();
  };

  const handleUseAlternative = () => {
    setOAuthError(null);
    // Focus on email input
    const emailInput = document.getElementById('email');
    emailInput?.focus();
  };

  const handleContactSupport = () => {
    // In a real app, this would open a support ticket or contact form
    window.open('mailto:support@hallucifix.com?subject=OAuth Authentication Issue', '_blank');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    setRecoveryAttempted(false);

    if (!isLogin && password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        await signInWithEmailPassword(email, password);
        onAuthSuccess();
      } else {
        const result = await signUpWithEmailPassword(email, password);
        
        if (result.user && !result.user.email_confirmed_at) {
          setSuccess('Account created successfully! Please check your email to verify your account before signing in.');
        } else {
          setSuccess('Account created successfully! You can now sign in.');
        }
        
        setIsLogin(true);
        setPassword('');
        setConfirmPassword('');
      }
    } catch (error: any) {
      logger.error("Email/password authentication error:", error instanceof Error ? error : new Error(String(error)));
      
      // Attempt automatic recovery for authentication errors
      if (isLogin && (error.message.includes('authentication') || error.message.includes('token') || error.message.includes('session'))) {
        await attemptAuthRecovery(error);
      } else {
        setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthenticationErrorBoundary
      userId={user?.id}
      onRecoverySuccess={() => {
        setSuccess('Authentication recovered successfully!');
        setError('');
      }}
      onRecoveryFailure={(error) => {
        setError(error.userMessage || 'Authentication recovery failed');
      }}
    >
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">
            {isLogin ? 'Sign In' : 'Create Account'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="p-3 bg-blue-100 rounded-lg w-fit mx-auto mb-4">
              <Shield className="w-8 h-8 text-blue-600" />
            </div>
            <p className="text-slate-600">
              {isLogin 
                ? 'Access your AI content verification dashboard' 
                : 'Get started with enterprise AI accuracy verification'
              }
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          {isRecovering && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center space-x-3">
              <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
              <p className="text-sm text-blue-700">Attempting to recover authentication...</p>
            </div>
          )}

          {recoveryAttempted && !isRecovering && !success && (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm text-orange-700 mb-2">
                Automatic recovery was attempted. If you're still having issues:
              </p>
              <ul className="text-xs text-orange-600 space-y-1">
                <li>• Try refreshing the page</li>
                <li>• Clear your browser cache</li>
                <li>• Contact support if the problem persists</li>
              </ul>
            </div>
          )}

          {oauthError && (
            <div className="mb-6">
              <OAuthErrorDisplay
                error={oauthError}
                onRetry={handleOAuthRetry}
                onUseAlternative={handleUseAlternative}
                onContactSupport={handleContactSupport}
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Confirm your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  <span>{isLogin ? 'Signing In...' : 'Creating Account...'}</span>
                </>
              ) : (
                <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
              )}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Or continue with</span>
              </div>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={loading || !isOAuthAvailable}
              className={`
                mt-4 w-full flex items-center justify-center space-x-3 px-6 py-3 border rounded-lg font-medium transition-all
                ${isOAuthAvailable 
                  ? 'border-slate-300 hover:bg-slate-50 text-slate-700' 
                  : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                }
                ${loading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              title={!isOAuthAvailable ? (oauthAvailabilityMessage || 'Google OAuth is not configured') : ''}
            >
              <Chrome className={`w-5 h-5 ${isOAuthAvailable ? 'text-slate-600' : 'text-slate-400'}`} />
              <span>
                {loading ? 'Signing in...' : 'Sign in with Google'}
                {!isOAuthAvailable && ' (Unavailable)'}
              </span>
            </button>

            {!isOAuthAvailable && oauthAvailabilityMessage && (
              <div className="mt-2 text-xs text-slate-500 text-center">
                {oauthAvailabilityMessage}
              </div>
            )}
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setSuccess('');
                setPassword('');
                setConfirmPassword('');
              }}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              {isLogin 
                ? "Don't have an account? Create one" 
                : 'Already have an account? Sign in'
              }
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-2">Enterprise Features</p>
              <div className="flex items-center justify-center space-x-4 text-xs text-slate-600">
                <span>• SOC 2 Compliant</span>
                <span>• GDPR Ready</span>
                <span>• 99.9% Uptime</span>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </AuthenticationErrorBoundary>
  );
};

export default AuthForm;