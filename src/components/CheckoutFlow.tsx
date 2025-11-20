import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { subscriptionService } from '../lib/subscriptionServiceClient';
import { SubscriptionPlan } from '../types/subscription';
import CheckoutLoading from './CheckoutLoading';
import CheckoutError from './CheckoutError';
import CheckoutSuccess from './CheckoutSuccess';
import CheckoutCancel from './CheckoutCancel';

interface CheckoutFlowProps {
  plan: SubscriptionPlan;
  onSuccess?: (sessionId: string) => void;
  onCancel?: () => void;
  onError?: (error: string) => void;
  successUrl?: string;
  cancelUrl?: string;
  trialDays?: number;
  allowPromotionCodes?: boolean;
  metadata?: Record<string, string>;
}

type CheckoutState = 'loading' | 'redirecting' | 'success' | 'cancel' | 'error';

export const CheckoutFlow: React.FC<CheckoutFlowProps> = ({
  plan,
  onSuccess,
  onCancel,
  onError,
  successUrl,
  cancelUrl,
  trialDays,
  allowPromotionCodes = true,
  metadata = {}
}) => {
  const [state, setState] = useState<CheckoutState>('loading');
  const [error, setError] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const { user } = useAuth();

  const initiateCheckout = useCallback(async () => {
    if (!user) {
      setError('User must be logged in to start checkout');
      setState('error');
      return;
    }

    try {
      setState('loading');
      
      const checkoutOptions = {
        successUrl: successUrl || `${window.location.origin}/billing/success?plan=${plan.id}`,
        cancelUrl: cancelUrl || `${window.location.origin}/billing/cancel?plan=${plan.id}`,
        trialPeriodDays: trialDays || plan.trialDays,
        allowPromotionCodes,
        metadata: {
          planId: plan.id,
          planName: plan.name,
          userId: user.id,
          ...metadata,
        },
      };

      const { sessionId: newSessionId, url } = await subscriptionService.createCheckoutSession(
        user.id,
        plan.stripePriceId,
        checkoutOptions
      );

      setSessionId(newSessionId);
      setState('redirecting');

      // Small delay to show the redirecting state
      setTimeout(() => {
        window.location.href = url;
      }, 1000);

    } catch (error: any) {
      console.error('Checkout initiation error:', error);
      const errorMessage = error.message || 'Failed to start checkout process';
      setError(errorMessage);
      setState('error');
      
      if (onError) {
        onError(errorMessage);
      }
    }
  }, [user, plan, successUrl, cancelUrl, trialDays, allowPromotionCodes, metadata, onError]);

  useEffect(() => {
    if (user && plan) {
      initiateCheckout();
    }
  }, [user, plan, initiateCheckout]);

  const handleRetry = () => {
    setError('');
    initiateCheckout();
  };

  const handleCancel = () => {
    setState('cancel');
    if (onCancel) {
      onCancel();
    }
  };

  const handleSuccess = () => {
    setState('success');
    if (onSuccess) {
      onSuccess(sessionId);
    }
  };

  // Handle URL parameters for success/cancel states
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionIdParam = urlParams.get('session_id');
    const canceled = urlParams.get('canceled');
    
    if (sessionIdParam) {
      setSessionId(sessionIdParam);
      setState('success');
    } else if (canceled === 'true') {
      setState('cancel');
    }
  }, []);

  const renderState = () => {
    switch (state) {
      case 'loading':
        return (
          <CheckoutLoading 
            planName={plan.name}
            message="Preparing your checkout session..."
          />
        );
        
      case 'redirecting':
        return (
          <CheckoutLoading 
            planName={plan.name}
            message="Redirecting to secure checkout..."
          />
        );
        
      case 'success':
        return (
          <CheckoutSuccess 
            sessionId={sessionId}
            planId={plan.id}
            onContinue={handleSuccess}
          />
        );
        
      case 'cancel':
        return (
          <CheckoutCancel 
            planName={plan.name}
            onRetry={handleRetry}
            onBackToPlans={handleCancel}
          />
        );
        
      case 'error':
        return (
          <CheckoutError 
            error={error}
            planName={plan.name}
            onRetry={handleRetry}
            onBackToPlans={handleCancel}
          />
        );
        
      default:
        return (
          <CheckoutLoading 
            planName={plan.name}
            message="Initializing..."
          />
        );
    }
  };

  return renderState();
};

export default CheckoutFlow;