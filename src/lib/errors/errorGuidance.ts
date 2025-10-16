/**
 * Error Guidance System
 * Provides contextual help and recovery guidance for different error types
 */

import { ApiError, ErrorType, ErrorSeverity } from './types';

export interface ErrorGuidance {
  title: string;
  description: string;
  quickFixes: string[];
  detailedSteps: string[];
  preventionTips: string[];
  relatedLinks: Array<{
    title: string;
    url: string;
    description: string;
  }>;
  estimatedResolutionTime: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ErrorGuidanceService {
  getGuidance(error: ApiError): ErrorGuidance;
  getQuickFix(errorType: ErrorType): string[];
  getPreventionTips(errorType: ErrorType): string[];
}

class ErrorGuidanceServiceImpl implements ErrorGuidanceService {
  private guidanceMap: Map<ErrorType, ErrorGuidance> = new Map();

  constructor() {
    this.initializeGuidance();
  }

  getGuidance(error: ApiError): ErrorGuidance {
    const baseGuidance = this.guidanceMap.get(error.type) || this.getDefaultGuidance();
    
    // Customize guidance based on error severity
    return {
      ...baseGuidance,
      severity: error.severity,
      estimatedResolutionTime: this.getEstimatedResolutionTime(error)
    };
  }

  getQuickFix(errorType: ErrorType): string[] {
    const guidance = this.guidanceMap.get(errorType);
    return guidance?.quickFixes || [];
  }

  getPreventionTips(errorType: ErrorType): string[] {
    const guidance = this.guidanceMap.get(errorType);
    return guidance?.preventionTips || [];
  }

  private initializeGuidance(): void {
    // Network Errors
    this.guidanceMap.set(ErrorType.NETWORK, {
      title: 'Network Connection Issue',
      description: 'Unable to connect to our servers. This is usually a temporary connectivity issue.',
      quickFixes: [
        'Check your internet connection',
        'Try refreshing the page',
        'Disable VPN or proxy temporarily',
        'Switch to a different network if available'
      ],
      detailedSteps: [
        'Verify your internet connection by visiting another website',
        'Check if your firewall or antivirus is blocking the connection',
        'Try using a different browser or incognito mode',
        'Clear your browser cache and cookies',
        'Restart your router or modem',
        'Contact your internet service provider if issues persist'
      ],
      preventionTips: [
        'Ensure stable internet connection before starting important tasks',
        'Save your work frequently to avoid data loss',
        'Consider using offline mode when available',
        'Keep your browser updated for better connectivity handling'
      ],
      relatedLinks: [
        {
          title: 'Network Troubleshooting Guide',
          url: '/help/network-troubleshooting',
          description: 'Step-by-step guide to resolve network issues'
        },
        {
          title: 'Browser Compatibility',
          url: '/help/browser-support',
          description: 'Supported browsers and versions'
        }
      ],
      estimatedResolutionTime: '1-5 minutes',
      severity: 'medium'
    });

    // Authentication Errors
    this.guidanceMap.set(ErrorType.AUTHENTICATION, {
      title: 'Authentication Failed',
      description: 'Your login credentials are invalid or your session has expired.',
      quickFixes: [
        'Sign in again with your credentials',
        'Check if Caps Lock is enabled',
        'Try resetting your password',
        'Clear browser cookies and cache'
      ],
      detailedSteps: [
        'Click the "Sign In" button and enter your credentials',
        'If you forgot your password, use the "Forgot Password" link',
        'Check your email for password reset instructions',
        'Ensure you\'re using the correct email address',
        'Try signing in from a different browser or device',
        'Contact support if you continue having issues'
      ],
      preventionTips: [
        'Use a password manager to avoid typos',
        'Enable two-factor authentication for better security',
        'Don\'t share your login credentials',
        'Sign out properly when using shared computers'
      ],
      relatedLinks: [
        {
          title: 'Password Reset Guide',
          url: '/auth/forgot-password',
          description: 'Reset your password if you\'ve forgotten it'
        },
        {
          title: 'Account Security',
          url: '/help/account-security',
          description: 'Tips for keeping your account secure'
        }
      ],
      estimatedResolutionTime: '2-10 minutes',
      severity: 'high'
    });

    // Authorization Errors
    this.guidanceMap.set(ErrorType.AUTHORIZATION, {
      title: 'Access Denied',
      description: 'You don\'t have permission to access this resource or perform this action.',
      quickFixes: [
        'Check if you\'re signed in to the correct account',
        'Contact your administrator for access',
        'Try accessing a different section',
        'Refresh your browser session'
      ],
      detailedSteps: [
        'Verify you\'re logged in with the correct user account',
        'Check your user role and permissions with your administrator',
        'Try signing out and signing back in',
        'Contact your team lead or administrator to request access',
        'Ensure you\'re accessing the correct environment (dev/staging/prod)',
        'Wait a few minutes if permissions were recently updated'
      ],
      preventionTips: [
        'Understand your role and permissions within the system',
        'Request appropriate access levels from your administrator',
        'Don\'t attempt to access resources outside your scope',
        'Keep your account information up to date'
      ],
      relatedLinks: [
        {
          title: 'User Roles and Permissions',
          url: '/help/user-roles',
          description: 'Understanding different user roles and their permissions'
        },
        {
          title: 'Request Access',
          url: '/help/request-access',
          description: 'How to request additional permissions'
        }
      ],
      estimatedResolutionTime: '5-30 minutes',
      severity: 'medium'
    });

    // Validation Errors
    this.guidanceMap.set(ErrorType.VALIDATION, {
      title: 'Input Validation Error',
      description: 'The information you entered doesn\'t meet the required format or criteria.',
      quickFixes: [
        'Check all required fields are filled',
        'Verify email and phone number formats',
        'Remove special characters if not allowed',
        'Check date and number formats'
      ],
      detailedSteps: [
        'Review each form field for error indicators',
        'Ensure all required fields (marked with *) are completed',
        'Check that email addresses include @ and a valid domain',
        'Verify phone numbers match the expected format',
        'Ensure passwords meet complexity requirements',
        'Check that dates are in the correct format (MM/DD/YYYY)',
        'Remove any copy-pasted content that might include hidden characters'
      ],
      preventionTips: [
        'Read field labels and help text carefully',
        'Use the suggested formats for dates, phones, etc.',
        'Type information directly instead of copy-pasting when possible',
        'Double-check your entries before submitting'
      ],
      relatedLinks: [
        {
          title: 'Form Field Requirements',
          url: '/help/form-requirements',
          description: 'Detailed requirements for each type of form field'
        },
        {
          title: 'Data Format Guide',
          url: '/help/data-formats',
          description: 'Accepted formats for dates, phones, emails, etc.'
        }
      ],
      estimatedResolutionTime: '1-5 minutes',
      severity: 'low'
    });

    // Server Errors
    this.guidanceMap.set(ErrorType.SERVER, {
      title: 'Server Error',
      description: 'Our servers are experiencing technical difficulties. This is usually temporary.',
      quickFixes: [
        'Wait a few minutes and try again',
        'Refresh the page',
        'Check our status page for updates',
        'Try a different browser or device'
      ],
      detailedSteps: [
        'Wait 2-3 minutes before trying again',
        'Check our system status page for known issues',
        'Try accessing the application from a different browser',
        'Clear your browser cache and cookies',
        'Try accessing from a different device or network',
        'Contact support if the issue persists for more than 15 minutes'
      ],
      preventionTips: [
        'Save your work frequently to avoid data loss',
        'Avoid submitting forms multiple times if they seem slow',
        'Check our status page before starting important work',
        'Consider working during off-peak hours for better performance'
      ],
      relatedLinks: [
        {
          title: 'System Status',
          url: 'https://status.hallucifix.com',
          description: 'Real-time system status and incident reports'
        },
        {
          title: 'Maintenance Schedule',
          url: '/help/maintenance',
          description: 'Planned maintenance windows and updates'
        }
      ],
      estimatedResolutionTime: '5-15 minutes',
      severity: 'high'
    });

    // Rate Limit Errors
    this.guidanceMap.set(ErrorType.RATE_LIMIT, {
      title: 'Rate Limit Exceeded',
      description: 'You\'ve made too many requests in a short time. Please wait before trying again.',
      quickFixes: [
        'Wait for the specified time before retrying',
        'Reduce the frequency of your requests',
        'Use batch operations when available',
        'Contact support for higher limits if needed'
      ],
      detailedSteps: [
        'Wait for the time specified in the error message',
        'Avoid rapid clicking or form submissions',
        'Use bulk operations instead of individual requests when possible',
        'Implement proper delays between automated requests',
        'Contact support if you need higher rate limits for legitimate use',
        'Consider upgrading your plan for higher limits'
      ],
      preventionTips: [
        'Avoid rapid clicking on buttons or links',
        'Use batch operations for bulk data processing',
        'Implement proper delays in automated scripts',
        'Monitor your usage to stay within limits'
      ],
      relatedLinks: [
        {
          title: 'API Rate Limits',
          url: '/help/rate-limits',
          description: 'Understanding API rate limits and best practices'
        },
        {
          title: 'Bulk Operations Guide',
          url: '/help/bulk-operations',
          description: 'How to use bulk operations efficiently'
        }
      ],
      estimatedResolutionTime: '1-60 minutes',
      severity: 'medium'
    });

    // File Processing Errors
    this.guidanceMap.set(ErrorType.FILE_PROCESSING_ERROR, {
      title: 'File Processing Error',
      description: 'There was an issue processing your file. This could be due to file format, size, or content issues.',
      quickFixes: [
        'Check if the file format is supported',
        'Ensure the file size is within limits',
        'Try uploading a different file',
        'Check if the file is corrupted'
      ],
      detailedSteps: [
        'Verify the file format is supported (PDF, DOCX, TXT, etc.)',
        'Check that the file size is under the maximum limit (usually 10MB)',
        'Ensure the file is not password-protected or encrypted',
        'Try opening the file in its native application to check for corruption',
        'Save the file in a different format if possible',
        'Try uploading from a different device or browser'
      ],
      preventionTips: [
        'Use supported file formats (check our documentation)',
        'Keep file sizes reasonable (under 10MB when possible)',
        'Ensure files are not corrupted before uploading',
        'Remove passwords or encryption before uploading'
      ],
      relatedLinks: [
        {
          title: 'Supported File Formats',
          url: '/help/file-formats',
          description: 'List of supported file types and formats'
        },
        {
          title: 'File Size Limits',
          url: '/help/file-limits',
          description: 'Maximum file sizes and optimization tips'
        }
      ],
      estimatedResolutionTime: '2-10 minutes',
      severity: 'medium'
    });
  }

  private getDefaultGuidance(): ErrorGuidance {
    return {
      title: 'Unexpected Error',
      description: 'An unexpected error occurred. Please try again or contact support if the issue persists.',
      quickFixes: [
        'Refresh the page and try again',
        'Clear your browser cache',
        'Try using a different browser',
        'Contact support with the error details'
      ],
      detailedSteps: [
        'Refresh the page using Ctrl+F5 (or Cmd+Shift+R on Mac)',
        'Clear your browser cache and cookies',
        'Try accessing the application in incognito/private mode',
        'Try using a different browser (Chrome, Firefox, Safari, Edge)',
        'Check if the issue occurs on different devices',
        'Contact our support team with the error ID and details'
      ],
      preventionTips: [
        'Keep your browser updated to the latest version',
        'Regularly clear browser cache and cookies',
        'Avoid using very old or unsupported browsers',
        'Report recurring issues to help us improve the system'
      ],
      relatedLinks: [
        {
          title: 'Browser Support',
          url: '/help/browser-support',
          description: 'Supported browsers and troubleshooting tips'
        },
        {
          title: 'Contact Support',
          url: '/support',
          description: 'Get help from our support team'
        }
      ],
      estimatedResolutionTime: '5-15 minutes',
      severity: 'medium'
    };
  }

  private getEstimatedResolutionTime(error: ApiError): string {
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        return 'Immediate attention required';
      case ErrorSeverity.HIGH:
        return '5-30 minutes';
      case ErrorSeverity.MEDIUM:
        return '1-15 minutes';
      case ErrorSeverity.LOW:
        return '1-5 minutes';
      default:
        return '5-15 minutes';
    }
  }
}

// Singleton instance
export const errorGuidanceService = new ErrorGuidanceServiceImpl();

// Helper functions for quick access
export const getErrorGuidance = (error: ApiError): ErrorGuidance => {
  return errorGuidanceService.getGuidance(error);
};

export const getQuickFixes = (errorType: ErrorType): string[] => {
  return errorGuidanceService.getQuickFix(errorType);
};

export const getPreventionTips = (errorType: ErrorType): string[] => {
  return errorGuidanceService.getPreventionTips(errorType);
};