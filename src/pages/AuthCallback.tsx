import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export const AuthCallback: React.FC = () => {
  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Check URL parameters for OAuth callback data
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');

        if (error) {
          setError(errorDescription || error);
          setProcessing(false);
          return;
        }

        if (code) {
          // OAuth code received - AWS Cognito will handle this automatically
          console.log('OAuth authorization code received');
          
          // Wait for auth state to update
          setTimeout(() => {
            if (user) {
              // Redirect to dashboard on successful authentication
              window.location.href = '/dashboard';
            } else {
              setError('Authentication failed. Please try again.');
              setProcessing(false);
            }
          }, 2000);
        } else {
          // No code parameter - might be a direct access
          setError('Invalid authentication callback');
          setProcessing(false);
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        setError('Authentication failed. Please try again.');
        setProcessing(false);
      }
    };

    handleAuthCallback();
  }, [user]);

  if (loading || processing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">
              Completing sign in...
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Please wait while we complete your authentication.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 text-red-600">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">
              Authentication Failed
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {error}
            </p>
            <div className="mt-6">
              <button
                onClick={() => window.location.href = '/'}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Return to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success case - user is authenticated
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-green-600">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">
            Sign In Successful
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Welcome back! Redirecting you to the dashboard...
          </p>
        </div>
      </div>
    </div>
  );
};