import { useEffect, useCallback, useRef } from 'react';
import { userEngagementTracker, UserInteraction } from '../lib/userEngagementTracker';
import { useAuth } from './useAuth';

export interface UseUserEngagementOptions {
  sessionId?: string;
  trackPageViews?: boolean;
  trackScrolling?: boolean;
  trackClicks?: boolean;
  trackFormSubmissions?: boolean;
  sessionTimeout?: number;
}

export interface UserEngagementHook {
  trackInteraction: (interaction: Omit<UserInteraction, 'type'> & { type?: UserInteraction['type'] }) => void;
  trackPageView: (page: string, metadata?: { title?: string; loadTime?: number; previousPage?: string }) => void;
  trackFeatureUsage: (feature: string, duration?: number, metadata?: Record<string, any>) => void;
  trackConversion: (event: string, value?: number, metadata?: Record<string, any>) => void;
  trackJourneyStep: (step: string, metadata?: Record<string, any>) => void;
  completeJourney: (conversionGoal?: string) => void;
  endSession: () => void;
  sessionId: string;
}

/**
 * Hook for tracking user engagement and feature usage
 */
export function useUserEngagement(options: UseUserEngagementOptions = {}): UserEngagementHook {
  const { user } = useAuth();
  const sessionIdRef = useRef<string>(options.sessionId || generateSessionId());
  const pageViewTimerRef = useRef<number | null>(null);
  const scrollDepthRef = useRef<number>(0);
  const interactionCountRef = useRef<number>(0);

  const sessionId = sessionIdRef.current;

  // Initialize session on mount
  useEffect(() => {
    const metadata = {
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      deviceType: getDeviceType() as 'desktop' | 'mobile' | 'tablet'
    };

    userEngagementTracker.startSession(sessionId, user?.id, metadata);

    // Track initial page view if enabled
    if (options.trackPageViews !== false) {
      const startTime = performance.now();
      userEngagementTracker.trackPageView(sessionId, window.location.pathname, {
        title: document.title,
        loadTime: startTime
      });
    }

    return () => {
      userEngagementTracker.endSession(sessionId);
    };
  }, [sessionId, user?.id, options.trackPageViews]);

  // Track page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page became hidden - pause tracking
        if (pageViewTimerRef.current) {
          clearInterval(pageViewTimerRef.current);
          pageViewTimerRef.current = null;
        }
      } else {
        // Page became visible - resume tracking
        startPageViewTimer();
      }
    };

    const startPageViewTimer = () => {
      if (pageViewTimerRef.current) return;
      
      pageViewTimerRef.current = window.setInterval(() => {
        userEngagementTracker.trackInteraction(sessionId, {
          type: 'scroll',
          duration: 30000, // 30 second intervals
          metadata: { 
            scroll_depth: scrollDepthRef.current,
            interactions_count: interactionCountRef.current
          }
        });
      }, 30000);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startPageViewTimer();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (pageViewTimerRef.current) {
        clearInterval(pageViewTimerRef.current);
      }
    };
  }, [sessionId]);

  // Track scroll depth
  useEffect(() => {
    if (!options.trackScrolling) return;

    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollDepth = documentHeight > 0 ? (scrollTop / documentHeight) * 100 : 0;
      
      scrollDepthRef.current = Math.max(scrollDepthRef.current, scrollDepth);

      // Track milestone scroll depths
      const milestones = [25, 50, 75, 90];
      milestones.forEach(milestone => {
        if (scrollDepth >= milestone && scrollDepthRef.current < milestone) {
          userEngagementTracker.trackInteraction(sessionId, {
            type: 'scroll',
            metadata: { scroll_depth: milestone }
          });
        }
      });
    };

    const throttledScroll = throttle(handleScroll, 1000);
    window.addEventListener('scroll', throttledScroll);

    return () => {
      window.removeEventListener('scroll', throttledScroll);
    };
  }, [sessionId, options.trackScrolling]);

  // Track clicks
  useEffect(() => {
    if (!options.trackClicks) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const element = getElementIdentifier(target);
      
      interactionCountRef.current++;
      
      userEngagementTracker.trackInteraction(sessionId, {
        type: 'click',
        element,
        metadata: {
          tag_name: target.tagName.toLowerCase(),
          class_name: target.className,
          text_content: target.textContent?.slice(0, 100) || '',
          x: event.clientX,
          y: event.clientY
        }
      });
    };

    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, [sessionId, options.trackClicks]);

  // Track form submissions
  useEffect(() => {
    if (!options.trackFormSubmissions) return;

    const handleFormSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      const formId = form.id || form.name || 'unnamed_form';
      
      userEngagementTracker.trackInteraction(sessionId, {
        type: 'form_submit',
        element: formId,
        metadata: {
          form_action: form.action,
          form_method: form.method,
          field_count: form.elements.length
        }
      });
    };

    document.addEventListener('submit', handleFormSubmit);

    return () => {
      document.removeEventListener('submit', handleFormSubmit);
    };
  }, [sessionId, options.trackFormSubmissions]);

  // Track interaction function
  const trackInteraction = useCallback((interaction: Omit<UserInteraction, 'type'> & { type?: UserInteraction['type'] }) => {
    userEngagementTracker.trackInteraction(sessionId, {
      type: 'click',
      ...interaction
    });
  }, [sessionId]);

  // Track page view function
  const trackPageView = useCallback((page: string, metadata?: { title?: string; loadTime?: number; previousPage?: string }) => {
    userEngagementTracker.trackPageView(sessionId, page, metadata);
  }, [sessionId]);

  // Track feature usage function
  const trackFeatureUsage = useCallback((feature: string, duration?: number, metadata?: Record<string, any>) => {
    userEngagementTracker.trackInteraction(sessionId, {
      type: 'feature_use',
      feature,
      duration,
      metadata
    });
  }, [sessionId]);

  // Track conversion function
  const trackConversion = useCallback((event: string, value?: number, metadata?: Record<string, any>) => {
    userEngagementTracker.trackConversion(sessionId, event, value, metadata);
  }, [sessionId]);

  // Track journey step function
  const trackJourneyStep = useCallback((step: string, metadata?: Record<string, any>) => {
    if (user?.id) {
      userEngagementTracker.trackJourneyStep(user.id, sessionId, step, metadata);
    }
  }, [sessionId, user?.id]);

  // Complete journey function
  const completeJourney = useCallback((conversionGoal?: string) => {
    if (user?.id) {
      userEngagementTracker.completeJourney(user.id, sessionId, conversionGoal);
    }
  }, [sessionId, user?.id]);

  // End session function
  const endSession = useCallback(() => {
    userEngagementTracker.endSession(sessionId);
  }, [sessionId]);

  return {
    trackInteraction,
    trackPageView,
    trackFeatureUsage,
    trackConversion,
    trackJourneyStep,
    completeJourney,
    endSession,
    sessionId
  };
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get device type based on screen size and user agent
 */
function getDeviceType(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  const screenWidth = window.screen.width;

  if (userAgent.includes('tablet') || userAgent.includes('ipad')) {
    return 'tablet';
  }

  if (userAgent.includes('mobile') || userAgent.includes('android') || userAgent.includes('iphone') || screenWidth < 768) {
    return 'mobile';
  }

  return 'desktop';
}

/**
 * Get element identifier for tracking
 */
function getElementIdentifier(element: HTMLElement): string {
  // Try to get a meaningful identifier
  if (element.id) {
    return `#${element.id}`;
  }

  if (element.getAttribute('data-testid')) {
    return `[data-testid="${element.getAttribute('data-testid')}"]`;
  }

  if (element.className) {
    const classes = element.className.split(' ').filter(c => c.length > 0);
    if (classes.length > 0) {
      return `.${classes[0]}`;
    }
  }

  // Fallback to tag name
  return element.tagName.toLowerCase();
}

/**
 * Throttle function to limit event frequency
 */
function throttle<T extends (...args: any[]) => any>(func: T, limit: number): T {
  let inThrottle: boolean;
  return ((...args: any[]) => {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }) as T;
}

/**
 * Hook for tracking specific feature usage with timing
 */
export function useFeatureTracking(featureName: string) {
  const { trackFeatureUsage } = useUserEngagement();
  const startTimeRef = useRef<number | null>(null);

  const startTracking = useCallback((metadata?: Record<string, any>) => {
    startTimeRef.current = performance.now();
    trackFeatureUsage(featureName, undefined, { ...metadata, action: 'started' });
  }, [featureName, trackFeatureUsage]);

  const endTracking = useCallback((metadata?: Record<string, any>) => {
    if (startTimeRef.current) {
      const duration = performance.now() - startTimeRef.current;
      trackFeatureUsage(featureName, duration, { ...metadata, action: 'completed' });
      startTimeRef.current = null;
    }
  }, [featureName, trackFeatureUsage]);

  const trackUsage = useCallback((duration?: number, metadata?: Record<string, any>) => {
    trackFeatureUsage(featureName, duration, metadata);
  }, [featureName, trackFeatureUsage]);

  return {
    startTracking,
    endTracking,
    trackUsage
  };
}

/**
 * Hook for tracking conversion funnels
 */
export function useConversionTracking(funnelName: string) {
  const { trackConversion, trackJourneyStep } = useUserEngagement();

  const trackStep = useCallback((step: string, value?: number, metadata?: Record<string, any>) => {
    trackConversion(`${funnelName}_${step}`, value, { ...metadata, funnel: funnelName });
    trackJourneyStep(step, { ...metadata, funnel: funnelName });
  }, [funnelName, trackConversion, trackJourneyStep]);

  return {
    trackStep
  };
}