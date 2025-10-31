import { vi } from 'vitest';

// PII patterns for detection and scrubbing
const PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
  ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  ipAddress: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
  url: /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g
};

// Test data validation utilities
export class TestDataValidator {
  static validateUser(user: any): boolean {
    const requiredFields = ['id', 'email', 'created_at'];
    return requiredFields.every(field => user && user[field] !== undefined);
  }

  static validateAnalysis(analysis: any): boolean {
    const requiredFields = ['id', 'content', 'accuracy_score', 'risk_level', 'user_id'];
    const validRiskLevels = ['low', 'medium', 'high', 'critical'];
    
    return (
      requiredFields.every(field => analysis && analysis[field] !== undefined) &&
      typeof analysis.accuracy_score === 'number' &&
      analysis.accuracy_score >= 0 &&
      analysis.accuracy_score <= 100 &&
      validRiskLevels.includes(analysis.risk_level)
    );
  }

  static validateScheduledScan(scan: any): boolean {
    const requiredFields = ['id', 'name', 'frequency', 'source_type', 'source_config', 'user_id'];
    const validFrequencies = ['daily', 'weekly', 'monthly'];
    const validSourceTypes = ['url', 'google_drive', 'file_upload'];
    
    return (
      requiredFields.every(field => scan && scan[field] !== undefined) &&
      validFrequencies.includes(scan.frequency) &&
      validSourceTypes.includes(scan.source_type) &&
      typeof scan.is_active === 'boolean'
    );
  }

  static validateTestData(data: any, type: 'user' | 'analysis' | 'scheduledScan'): boolean {
    switch (type) {
      case 'user':
        return TestDataValidator.validateUser(data);
      case 'analysis':
        return TestDataValidator.validateAnalysis(data);
      case 'scheduledScan':
        return TestDataValidator.validateScheduledScan(data);
      default:
        return false;
    }
  }
}

// PII scrubbing utilities
export class PIIScrubber {
  static scrubText(text: string): string {
    let scrubbedText = text;
    
    // Replace emails with placeholder
    scrubbedText = scrubbedText.replace(PII_PATTERNS.email, '[EMAIL_REDACTED]');
    
    // Replace phone numbers with placeholder
    scrubbedText = scrubbedText.replace(PII_PATTERNS.phone, '[PHONE_REDACTED]');
    
    // Replace SSNs with placeholder
    scrubbedText = scrubbedText.replace(PII_PATTERNS.ssn, '[SSN_REDACTED]');
    
    // Replace credit cards with placeholder
    scrubbedText = scrubbedText.replace(PII_PATTERNS.creditCard, '[CREDIT_CARD_REDACTED]');
    
    // Replace IP addresses with placeholder
    scrubbedText = scrubbedText.replace(PII_PATTERNS.ipAddress, '[IP_REDACTED]');
    
    // Replace URLs with placeholder (except test domains)
    scrubbedText = scrubbedText.replace(PII_PATTERNS.url, (match) => {
      if (match.includes('example.com') || match.includes('test.com') || match.includes('localhost')) {
        return match; // Keep test URLs
      }
      return '[URL_REDACTED]';
    });
    
    return scrubbedText;
  }

  static scrubObject(obj: any): any {
    if (typeof obj === 'string') {
      return PIIScrubber.scrubText(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => PIIScrubber.scrubObject(item));
    }
    
    if (obj && typeof obj === 'object') {
      const scrubbed: any = {};
      for (const [key, value] of Object.entries(obj)) {
        scrubbed[key] = PIIScrubber.scrubObject(value);
      }
      return scrubbed;
    }
    
    return obj;
  }

  static detectPII(text: string): { type: string; matches: string[] }[] {
    const detectedPII: { type: string; matches: string[] }[] = [];
    
    for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        detectedPII.push({ type, matches });
      }
    }
    
    return detectedPII;
  }

  static hasPII(text: string): boolean {
    return PIIScrubber.detectPII(text).length > 0;
  }
}

// Test data sanitization utilities
export class TestDataSanitizer {
  static sanitizeForTesting(data: any): any {
    // Create a deep copy to avoid mutating original data
    const sanitized = JSON.parse(JSON.stringify(data));
    
    // Scrub PII from the data
    return PIIScrubber.scrubObject(sanitized);
  }

  static generateSafeTestEmail(prefix: string = 'test'): string {
    const randomId = Math.random().toString(36).substr(2, 9);
    return `${prefix}-${randomId}@example.com`;
  }

  static generateSafeTestUrl(path: string = ''): string {
    const randomId = Math.random().toString(36).substr(2, 9);
    return `https://test-${randomId}.example.com${path}`;
  }

  static generateSafeTestPhone(): string {
    // Generate a fake phone number in a safe format
    const area = Math.floor(Math.random() * 900) + 100;
    const exchange = Math.floor(Math.random() * 900) + 100;
    const number = Math.floor(Math.random() * 9000) + 1000;
    return `555-${area}-${exchange}`;
  }
}

// Assertion helpers for test validation
export const assertNoPII = (data: any): void => {
  const dataString = JSON.stringify(data);
  const detectedPII = PIIScrubber.detectPII(dataString);
  
  if (detectedPII.length > 0) {
    throw new Error(`PII detected in test data: ${JSON.stringify(detectedPII)}`);
  }
};

export const assertValidTestData = (data: any, type: 'user' | 'analysis' | 'scheduledScan'): void => {
  if (!TestDataValidator.validateTestData(data, type)) {
    throw new Error(`Invalid test data for type ${type}: ${JSON.stringify(data)}`);
  }
};

// Mock console methods to capture and validate log output
export const mockConsoleForTesting = () => {
  const originalConsole = { ...console };
  const logs: string[] = [];
  
  console.log = vi.fn((...args) => {
    const message = args.join(' ');
    logs.push(PIIScrubber.scrubText(message));
  });
  
  console.error = vi.fn((...args) => {
    const message = args.join(' ');
    logs.push(PIIScrubber.scrubText(message));
  });
  
  console.warn = vi.fn((...args) => {
    const message = args.join(' ');
    logs.push(PIIScrubber.scrubText(message));
  });
  
  return {
    getLogs: () => logs,
    restore: () => {
      Object.assign(console, originalConsole);
    },
    assertNoPIIInLogs: () => {
      logs.forEach(log => {
        if (PIIScrubber.hasPII(log)) {
          throw new Error(`PII detected in console logs: ${log}`);
        }
      });
    }
  };
};

// Enhanced data validation utilities for comprehensive testing
export const validateTestData = {
  user: (user: any): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const required = ['id', 'email', 'created_at', 'updated_at'];
    
    required.forEach(field => {
      if (user[field] === undefined || user[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    });
    
    if (user.email && !isValidEmail(user.email)) {
      errors.push('Invalid email format');
    }
    
    if (user.role && !['user', 'admin'].includes(user.role)) {
      errors.push('Invalid role value');
    }
    
    if (user.subscription_status && !['active', 'inactive', 'trialing', 'past_due', 'canceled'].includes(user.subscription_status)) {
      errors.push('Invalid subscription_status value');
    }
    
    if (user.subscription_plan && !['free', 'pro', 'enterprise'].includes(user.subscription_plan)) {
      errors.push('Invalid subscription_plan value');
    }
    
    if (user.usage_current !== undefined && user.usage_quota !== undefined) {
      if (user.usage_current < 0 || user.usage_quota < 0) {
        errors.push('Usage values cannot be negative');
      }
    }
    
    return { valid: errors.length === 0, errors };
  },
  
  analysis: (analysis: any): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const required = ['id', 'content', 'accuracy_score', 'risk_level', 'created_at', 'user_id'];
    
    required.forEach(field => {
      if (analysis[field] === undefined || analysis[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    });
    
    if (analysis.accuracy_score !== undefined) {
      if (typeof analysis.accuracy_score !== 'number' || 
          analysis.accuracy_score < 0 || 
          analysis.accuracy_score > 100) {
        errors.push('accuracy_score must be a number between 0 and 100');
      }
    }
    
    if (analysis.risk_level && !['low', 'medium', 'high', 'critical'].includes(analysis.risk_level)) {
      errors.push('Invalid risk_level value');
    }
    
    if (analysis.status && !['completed', 'processing', 'failed', 'pending'].includes(analysis.status)) {
      errors.push('Invalid status value');
    }
    
    if (analysis.content && typeof analysis.content !== 'string') {
      errors.push('content must be a string');
    }
    
    if (analysis.analysis_details) {
      const details = analysis.analysis_details;
      if (details.confidence_score !== undefined && 
          (details.confidence_score < 0 || details.confidence_score > 1)) {
        errors.push('confidence_score must be between 0 and 1');
      }
      
      if (details.sources_checked !== undefined && details.sources_checked < 0) {
        errors.push('sources_checked cannot be negative');
      }
      
      if (details.processing_time_ms !== undefined && details.processing_time_ms < 0) {
        errors.push('processing_time_ms cannot be negative');
      }
    }
    
    if (analysis.hallucinations && Array.isArray(analysis.hallucinations)) {
      analysis.hallucinations.forEach((hallucination: any, index: number) => {
        if (!hallucination.text || !hallucination.type || !hallucination.explanation) {
          errors.push(`Hallucination ${index} missing required fields`);
        }
        
        if (hallucination.confidence !== undefined && 
            (hallucination.confidence < 0 || hallucination.confidence > 1)) {
          errors.push(`Hallucination ${index} confidence must be between 0 and 1`);
        }
        
        if (hallucination.startIndex !== undefined && hallucination.endIndex !== undefined) {
          if (hallucination.startIndex < 0 || hallucination.endIndex < hallucination.startIndex) {
            errors.push(`Hallucination ${index} has invalid index range`);
          }
        }
      });
    }
    
    return { valid: errors.length === 0, errors };
  },
  
  scheduledScan: (scan: any): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const required = ['id', 'name', 'frequency', 'source_type', 'source_config', 'is_active', 'created_at', 'user_id'];
    
    required.forEach(field => {
      if (scan[field] === undefined || scan[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    });
    
    if (scan.frequency && !['daily', 'weekly', 'monthly', 'manual'].includes(scan.frequency)) {
      errors.push('Invalid frequency value');
    }
    
    if (scan.source_type && !['url', 'google_drive', 'file_upload', 'rss', 'api'].includes(scan.source_type)) {
      errors.push('Invalid source_type value');
    }
    
    if (typeof scan.is_active !== 'boolean') {
      errors.push('is_active must be a boolean');
    }
    
    if (scan.run_count !== undefined && scan.run_count < 0) {
      errors.push('run_count cannot be negative');
    }
    
    if (scan.success_count !== undefined && scan.error_count !== undefined && scan.run_count !== undefined) {
      if (scan.success_count + scan.error_count !== scan.run_count) {
        errors.push('success_count + error_count must equal run_count');
      }
    }
    
    // Validate source_config based on source_type
    if (scan.source_config && scan.source_type) {
      const configErrors = validateSourceConfig(scan.source_type, scan.source_config);
      errors.push(...configErrors);
    }
    
    return { valid: errors.length === 0, errors };
  },
  
  stripeCustomer: (customer: any): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const required = ['id', 'email', 'created'];
    
    required.forEach(field => {
      if (customer[field] === undefined || customer[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    });
    
    if (customer.email && !isValidEmail(customer.email)) {
      errors.push('Invalid email format');
    }
    
    if (customer.created && (typeof customer.created !== 'number' || customer.created <= 0)) {
      errors.push('created must be a positive timestamp');
    }
    
    return { valid: errors.length === 0, errors };
  },
  
  stripeSubscription: (subscription: any): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const required = ['id', 'customer', 'status', 'current_period_start', 'current_period_end'];
    
    required.forEach(field => {
      if (subscription[field] === undefined || subscription[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    });
    
    const validStatuses = ['active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'trialing', 'unpaid'];
    if (subscription.status && !validStatuses.includes(subscription.status)) {
      errors.push('Invalid subscription status');
    }
    
    if (subscription.current_period_start && subscription.current_period_end) {
      if (subscription.current_period_start >= subscription.current_period_end) {
        errors.push('current_period_start must be before current_period_end');
      }
    }
    
    return { valid: errors.length === 0, errors };
  },
  
  googleDriveFile: (file: any): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const required = ['id', 'name', 'mimeType', 'modifiedTime', 'webViewLink'];
    
    required.forEach(field => {
      if (file[field] === undefined || file[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    });
    
    if (file.size && (isNaN(parseInt(file.size)) || parseInt(file.size) < 0)) {
      errors.push('size must be a valid positive number string');
    }
    
    if (file.modifiedTime && !isValidISODate(file.modifiedTime)) {
      errors.push('modifiedTime must be a valid ISO date string');
    }
    
    if (file.webViewLink && !isValidUrl(file.webViewLink)) {
      errors.push('webViewLink must be a valid URL');
    }
    
    if (file.capabilities) {
      const booleanFields = ['canDownload', 'canEdit', 'canShare', 'canComment'];
      booleanFields.forEach(field => {
        if (file.capabilities[field] !== undefined && typeof file.capabilities[field] !== 'boolean') {
          errors.push(`capabilities.${field} must be a boolean`);
        }
      });
    }
    
    return { valid: errors.length === 0, errors };
  }
};

// Helper validation functions
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const isValidISODate = (dateString: string): boolean => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && dateString === date.toISOString();
};

const validateSourceConfig = (sourceType: string, config: any): string[] => {
  const errors: string[] = [];
  
  switch (sourceType) {
    case 'url':
      if (!config.url) {
        errors.push('URL source_config missing url field');
      } else if (!isValidUrl(config.url)) {
        errors.push('URL source_config has invalid url');
      }
      
      if (config.max_articles !== undefined && (config.max_articles <= 0 || config.max_articles > 1000)) {
        errors.push('max_articles must be between 1 and 1000');
      }
      break;
      
    case 'google_drive':
      if (!config.folder_id) {
        errors.push('Google Drive source_config missing folder_id field');
      }
      
      if (config.file_types && !Array.isArray(config.file_types)) {
        errors.push('file_types must be an array');
      }
      
      if (config.max_file_size_mb !== undefined && config.max_file_size_mb <= 0) {
        errors.push('max_file_size_mb must be positive');
      }
      break;
      
    case 'rss':
      if (!config.feed_url) {
        errors.push('RSS source_config missing feed_url field');
      } else if (!isValidUrl(config.feed_url)) {
        errors.push('RSS source_config has invalid feed_url');
      }
      
      if (config.max_items !== undefined && config.max_items <= 0) {
        errors.push('max_items must be positive');
      }
      break;
      
    case 'file_upload':
      if (config.file_types && !Array.isArray(config.file_types)) {
        errors.push('file_types must be an array');
      }
      
      if (config.max_file_size_mb !== undefined && config.max_file_size_mb <= 0) {
        errors.push('max_file_size_mb must be positive');
      }
      break;
  }
  
  return errors;
};

// Enhanced data consistency checks
export const checkDataConsistency = {
  userAnalysisRelationship: (users: any[], analyses: any[]): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const userIds = new Set(users.map(u => u.id));
    
    analyses.forEach((analysis, index) => {
      if (!userIds.has(analysis.user_id)) {
        errors.push(`Analysis ${index} references non-existent user: ${analysis.user_id}`);
      }
    });
    
    return { valid: errors.length === 0, errors };
  },
  
  userScanRelationship: (users: any[], scans: any[]): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const userIds = new Set(users.map(u => u.id));
    
    scans.forEach((scan, index) => {
      if (!userIds.has(scan.user_id)) {
        errors.push(`Scan ${index} references non-existent user: ${scan.user_id}`);
      }
    });
    
    return { valid: errors.length === 0, errors };
  },
  
  dateConsistency: (items: any[]): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    items.forEach((item, index) => {
      if (item.created_at && item.updated_at) {
        const created = new Date(item.created_at);
        const updated = new Date(item.updated_at);
        
        if (created > updated) {
          errors.push(`Item ${index} has created_at after updated_at`);
        }
      }
      
      if (item.trial_end && item.created_at) {
        const created = new Date(item.created_at);
        const trialEnd = new Date(item.trial_end);
        
        if (trialEnd <= created) {
          errors.push(`Item ${index} has trial_end before or equal to created_at`);
        }
      }
    });
    
    return { valid: errors.length === 0, errors };
  },
  
  subscriptionConsistency: (users: any[], subscriptions: any[]): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const userSubscriptionMap = new Map();
    
    // Map users to their subscription info
    users.forEach(user => {
      if (user.subscription_status && user.subscription_plan) {
        userSubscriptionMap.set(user.id, {
          status: user.subscription_status,
          plan: user.subscription_plan,
          stripeCustomerId: user.stripe_customer_id
        });
      }
    });
    
    // Check subscription consistency
    subscriptions.forEach((subscription, index) => {
      const userInfo = userSubscriptionMap.get(subscription.user_id);
      
      if (userInfo) {
        if (subscription.status !== userInfo.status) {
          errors.push(`Subscription ${index} status mismatch with user data`);
        }
        
        if (subscription.plan !== userInfo.plan) {
          errors.push(`Subscription ${index} plan mismatch with user data`);
        }
        
        if (subscription.stripe_customer_id !== userInfo.stripeCustomerId) {
          errors.push(`Subscription ${index} Stripe customer ID mismatch with user data`);
        }
      }
    });
    
    return { valid: errors.length === 0, errors };
  },
  
  usageConsistency: (users: any[], usageRecords: any[]): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    usageRecords.forEach((usage, index) => {
      const user = users.find(u => u.id === usage.user_id);
      
      if (user) {
        if (usage.analyses_count !== user.usage_current) {
          errors.push(`Usage record ${index} analyses_count doesn't match user usage_current`);
        }
        
        if (usage.quota_limit !== user.usage_quota) {
          errors.push(`Usage record ${index} quota_limit doesn't match user usage_quota`);
        }
      }
    });
    
    return { valid: errors.length === 0, errors };
  }
};

// Comprehensive data validation suite
export const validateDataSet = (dataSet: {
  users?: any[];
  analyses?: any[];
  scheduledScans?: any[];
  subscriptions?: any[];
  paymentHistory?: any[];
  usageRecords?: any[];
}): { valid: boolean; errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate individual items
  if (dataSet.users) {
    dataSet.users.forEach((user, index) => {
      const validation = validateTestData.user(user);
      if (!validation.valid) {
        errors.push(`User ${index}: ${validation.errors.join(', ')}`);
      }
    });
  }
  
  if (dataSet.analyses) {
    dataSet.analyses.forEach((analysis, index) => {
      const validation = validateTestData.analysis(analysis);
      if (!validation.valid) {
        errors.push(`Analysis ${index}: ${validation.errors.join(', ')}`);
      }
    });
  }
  
  if (dataSet.scheduledScans) {
    dataSet.scheduledScans.forEach((scan, index) => {
      const validation = validateTestData.scheduledScan(scan);
      if (!validation.valid) {
        errors.push(`Scheduled scan ${index}: ${validation.errors.join(', ')}`);
      }
    });
  }
  
  // Check relationships and consistency
  if (dataSet.users && dataSet.analyses) {
    const relationshipCheck = checkDataConsistency.userAnalysisRelationship(dataSet.users, dataSet.analyses);
    if (!relationshipCheck.valid) {
      errors.push(...relationshipCheck.errors);
    }
  }
  
  if (dataSet.users && dataSet.scheduledScans) {
    const relationshipCheck = checkDataConsistency.userScanRelationship(dataSet.users, dataSet.scheduledScans);
    if (!relationshipCheck.valid) {
      errors.push(...relationshipCheck.errors);
    }
  }
  
  if (dataSet.users && dataSet.subscriptions) {
    const consistencyCheck = checkDataConsistency.subscriptionConsistency(dataSet.users, dataSet.subscriptions);
    if (!consistencyCheck.valid) {
      errors.push(...consistencyCheck.errors);
    }
  }
  
  // Check date consistency across all items
  const allItemsWithDates = [
    ...(dataSet.users || []),
    ...(dataSet.analyses || []),
    ...(dataSet.scheduledScans || [])
  ];
  
  if (allItemsWithDates.length > 0) {
    const dateCheck = checkDataConsistency.dateConsistency(allItemsWithDates);
    if (!dateCheck.valid) {
      errors.push(...dateCheck.errors);
    }
  }
  
  // Generate warnings for potential issues
  if (dataSet.users) {
    const unconfirmedUsers = dataSet.users.filter(u => !u.email_confirmed_at);
    if (unconfirmedUsers.length > dataSet.users.length * 0.5) {
      warnings.push(`High percentage of unconfirmed users (${unconfirmedUsers.length}/${dataSet.users.length})`);
    }
    
    const inactiveUsers = dataSet.users.filter(u => u.subscription_status === 'inactive');
    if (inactiveUsers.length > dataSet.users.length * 0.3) {
      warnings.push(`High percentage of inactive users (${inactiveUsers.length}/${dataSet.users.length})`);
    }
  }
  
  if (dataSet.scheduledScans) {
    const inactiveScans = dataSet.scheduledScans.filter(s => !s.is_active);
    if (inactiveScans.length > dataSet.scheduledScans.length * 0.5) {
      warnings.push(`High percentage of inactive scans (${inactiveScans.length}/${dataSet.scheduledScans.length})`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};