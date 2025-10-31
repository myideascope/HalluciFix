/**
 * Authentication Callback Component
 * Handles OAuth redirects from Cognito/Google
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cognitoAuth } from '../lib/cognitoAuth';
import { useToast } from '../hooks/useToast';
import { logger } from '../lib/logging';

export const AuthCallback: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();
  const { showToast } = useToast();
  const callbackLogger = logger.child({ component: 'AuthCallback' });

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      callbackLogger.info('Processing OAuth callback');

      // Check if we have URL parameters indicating an OAuth callback
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (code) {
        // OAuth callback with authorization code
        callbackLogger.info('OAuth authorization code received');
        
        // The Amplify library should handle the token exchange automatically
        // We just need to check if the user is now authenticated
        const session = await cognitoAuth.getCurrentSession();
        
        if (session) {
          callbackLogger.info('OAuth authentication successful', { userId: session.user.userId });
          setStatus('success');
          showToast('Successfully signed in with Google!', 'success');
          
          // Redirect to dashboard after a short delay
          setTimeout(() => {
            navigate('/dashboard');
          }, 2000);
        } else {
          throw new Error('Failed to establish authenticated session');
        }
      } else {
        // No authorization code - might be a direct navigation
        callbackLogger.warn('No authorization code in callback URL');
        throw new Error('Invalid callback - no authorization code received');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      callbackLogger.error('OAuth callback failed', error as Error);
      
      setStatus('error');
      setError(errorMessage);
      showToast(errorMessage, 'error');
      
      // Redirect to login after a delay
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Completing Sign In</h2>
            <p className="text-gray-600">Please wait while we finish setting up your account...</p>
          </div>
        );

      case 'success':
        return (
          <div className="text-center">
            <div className="text-green-600 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Sign In Successful!</h2>
            <p className="text-gray-600">Redirecting you to the dashboard...</p>
          </div>
        );

      case 'error':
        return (
          <div className="text-center">
            <div className="text-red-600 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Sign In Failed</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <p className="text-sm text-gray-500">Redirecting you back to the login page...</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        {renderContent()}
      </div>
    </div>
  );
};