import React, { useEffect, useState } from 'react';
import { Shield, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { OAuthService } from '../lib/oauth/oauthService';
import { SessionManager } from '../lib/oauth/sessionManager';
import { useToast } from '../hooks/useToast';

import { logger } from '../lib/logging';
interface OAuthCallbackProps {
  oauthService: OAuthService;
}

const OAuthCallback: React.FC<OAuthCallbackProps> = ({ oauthService }) => {
  const { showToast } = useToast();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Extract parameters from URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');

        // Handle OAuth errors
        if (error) {
          let userMessage = 'Authentication failed';
          
          switch (error) {
            case 'access_denied':
              userMessage = 'You denied access to the application. Please try again if you want to sign in.';
              break;
            case 'invalid_request':
              userMessage = 'Invalid authentication request. Please try signing in again.';
              break;
            case 'unauthorized_client':
              userMessage = 'Application is not authorized. Please contact support.';
              break;
            case 'unsupported_response_type':
              userMessage = 'Authentication method not supported. Please contact support.';
              break;
            case 'invalid_scope':
              userMessage = 'Invalid permissions requested. Please contact support.';
              break;
            case 'server_error':
              userMessage = 'Server error occurred. Please try again later.';
              break;
            case 'temporarily_unavailable':
              userMessage = 'Authentication service is temporarily unavailable. Please try again later.';
              break;
            default:
              userMessage = errorDescription || 'An unknown error occurred during authentication.';
          }

          setStatus('error');
          setMessage(userMessage);
          
          // Log error for monitoring
          logger.error("OAuth callback error:", { error, errorDescription } instanceof Error ? { error, errorDescription } : new Error(String({ error, errorDescription })));
          
          // Redirect to login after delay
          setTimeout(() => {
            window.location.href = '/';
          }, 3000);
          return;
        }

        // Validate required parameters
        if (!code || !state) {
          setStatus('error');
          setMessage('Missing required authentication parameters. Please try signing in again.');
          
          setTimeout(() => {
            window.location.href = '/';
          }, 3000);
          return;
        }

        setMessage('Exchanging authorization code for tokens...');

        // Get redirect URI (should match what was used in initiation)
        const redirectUri = `${window.location.origin}/auth/callback`;

        // Handle OAuth callback
        const result = await oauthService.handleCallback(code, state, redirectUri);

        setMessage('Creating user session...');

        // Use SessionManager to create the session with enhanced JWT integration
        await SessionManager.createSession(result.user, {
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresAt: result.tokens.expiresAt,
          scope: result.tokens.scope || 'openid email profile'
        });

        setStatus('success');
        setMessage('Authentication successful! Redirecting...');

        showToast('Successfully signed in with Google!', 'success');

        // Clear URL parameters and redirect to main app
        setTimeout(() => {
          window.history.replaceState({}, document.title, '/');
          window.location.reload();
        }, 1500);

      } catch (error) {
        logger.error("OAuth callback handling failed:", error instanceof Error ? error : new Error(String(error)));
        
        setStatus('error');
        setMessage(
          error instanceof Error 
            ? `Authentication failed: ${error.message}`
            : 'An unexpected error occurred during authentication.'
        );

        // Redirect to login after delay
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    };

    handleCallback();
  }, [oauthService, showToast]);

  const getStatusIcon = () => {
    switch (status) {
      case 'processing':
        return <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />;
      case 'success':
        return <CheckCircle2 className="w-8 h-8 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-8 h-8 text-red-600" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'processing':
        return 'bg-blue-50 border-blue-200';
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8">
        <div className="text-center">
          <div className="p-3 bg-blue-100 rounded-lg w-fit mx-auto mb-6">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          
          <h1 className="text-2xl font-bold text-slate-900 mb-4">
            Google Authentication
          </h1>
          
          <div className={`p-4 rounded-lg border ${getStatusColor()} mb-6`}>
            <div className="flex items-center justify-center space-x-3">
              {getStatusIcon()}
              <p className="text-sm font-medium text-slate-700">
                {message}
              </p>
            </div>
          </div>

          {status === 'processing' && (
            <p className="text-sm text-slate-500">
              Please wait while we complete your authentication...
            </p>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                You will be redirected to the login page shortly.
              </p>
              <button
                onClick={() => window.location.href = '/'}
                className="text-blue-600 hover:text-blue-700 font-medium text-sm"
              >
                Return to login now
              </button>
            </div>
          )}

          {status === 'success' && (
            <p className="text-sm text-slate-500">
              Redirecting to your dashboard...
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default OAuthCallback;