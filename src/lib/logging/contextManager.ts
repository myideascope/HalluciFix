/**
 * Context Manager for Request/Session Tracking
 * Manages contextual information like request ID, user ID, session ID
 */

import { LogContext } from './types';

class ContextManager {
  private context: LogContext = {};
  private requestIdCounter = 0;

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    const timestamp = Date.now();
    const counter = ++this.requestIdCounter;
    const random = Math.random().toString(36).substr(2, 9);
    return `req_${timestamp}_${counter}_${random}`;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 16);
    return `sess_${timestamp}_${random}`;
  }

  /**
   * Set request context
   */
  setRequestContext(requestContext: Partial<LogContext>): void {
    this.context = {
      ...this.context,
      requestId: requestContext.requestId || this.generateRequestId(),
      method: requestContext.method,
      endpoint: requestContext.endpoint,
      userAgent: requestContext.userAgent,
      ip: requestContext.ip,
    };
  }

  /**
   * Set user context
   */
  setUserContext(userId: string, sessionId?: string): void {
    this.context = {
      ...this.context,
      userId,
      sessionId: sessionId || this.generateSessionId(),
    };
  }

  /**
   * Set session context
   */
  setSessionContext(sessionId: string): void {
    this.context = {
      ...this.context,
      sessionId,
    };
  }

  /**
   * Add custom context
   */
  addContext(key: string, value: any): void {
    this.context[key] = value;
  }

  /**
   * Get current context
   */
  getContext(): LogContext {
    return { ...this.context };
  }

  /**
   * Clear specific context keys
   */
  clearContext(keys?: string[]): void {
    if (keys) {
      keys.forEach(key => {
        delete this.context[key];
      });
    } else {
      this.context = {};
    }
  }

  /**
   * Create a new request context
   */
  createRequestContext(request?: {
    method?: string;
    url?: string;
    userAgent?: string;
    ip?: string;
  }): LogContext {
    const requestId = this.generateRequestId();
    
    return {
      requestId,
      method: request?.method,
      endpoint: request?.url,
      userAgent: request?.userAgent,
      ip: request?.ip,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Extract context from browser environment
   */
  getBrowserContext(): LogContext {
    if (typeof window === 'undefined') {
      return {};
    }

    return {
      userAgent: navigator.userAgent,
      url: window.location.href,
      referrer: document.referrer || undefined,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Extract context from error
   */
  getErrorContext(error: Error): LogContext {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const contextManager = new ContextManager();

// Export class for custom instances
export { ContextManager };