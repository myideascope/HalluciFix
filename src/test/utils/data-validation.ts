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