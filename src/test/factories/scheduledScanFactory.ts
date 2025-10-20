export interface TestScheduledScan {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'manual';
  source_type: 'url' | 'google_drive' | 'file_upload' | 'rss' | 'api';
  source_config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
  last_run?: string | null;
  next_run?: string | null;
  run_count?: number;
  success_count?: number;
  error_count?: number;
  last_error?: {
    message: string;
    code: string;
    timestamp: string;
    details?: string;
  } | null;
  notification_settings?: {
    on_completion: boolean;
    on_error: boolean;
    email_notifications: boolean;
    webhook_url?: string;
  };
  filters?: {
    keywords?: string[];
    exclude_keywords?: string[];
    min_content_length?: number;
    max_content_length?: number;
    languages?: string[];
  };
  schedule_config?: {
    timezone?: string;
    time_of_day?: string; // HH:MM format
    day_of_week?: number; // 0-6, Sunday = 0
    day_of_month?: number; // 1-31
  };
}

// Realistic scan names and configurations
const SCAN_NAMES = [
  'Daily News Monitor', 'Weekly Report Scan', 'Monthly Content Review',
  'Blog Post Analyzer', 'Social Media Monitor', 'Research Paper Scanner',
  'Press Release Checker', 'Documentation Audit', 'Content Quality Check',
  'Fact Verification Scan', 'Misinformation Monitor', 'Source Validation'
];

const DOMAINS = [
  'example-news.com', 'sample-blog.org', 'test-site.net', 'demo-content.io',
  'mock-news.com', 'fixture-blog.co', 'testing-site.app', 'content-demo.dev'
];

const RSS_FEEDS = [
  'https://example.com/feed.xml', 'https://sample-blog.org/rss',
  'https://news-site.com/feed', 'https://tech-blog.net/rss.xml'
];

const GOOGLE_DRIVE_FOLDERS = [
  '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AbCdEf',
  '1ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210ZyXwVu'
];

const ERROR_CODES = [
  'TIMEOUT_ERROR', 'CONNECTION_ERROR', 'AUTHENTICATION_ERROR', 
  'RATE_LIMIT_ERROR', 'PARSING_ERROR', 'PERMISSION_ERROR',
  'NOT_FOUND_ERROR', 'SERVER_ERROR', 'QUOTA_EXCEEDED'
];

const ERROR_MESSAGES = [
  'Connection timeout after 30 seconds',
  'Failed to authenticate with service',
  'Rate limit exceeded, please try again later',
  'Unable to parse content from source',
  'Insufficient permissions to access resource',
  'Resource not found or has been moved',
  'Internal server error occurred',
  'API quota exceeded for this period'
];

export const createTestScheduledScan = (overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  const now = new Date();
  const frequency = overrides.frequency || (['daily', 'weekly', 'monthly'][Math.floor(Math.random() * 3)] as TestScheduledScan['frequency']);
  const sourceType = overrides.source_type || (['url', 'google_drive', 'rss'][Math.floor(Math.random() * 3)] as TestScheduledScan['source_type']);
  
  // Calculate next run based on frequency
  const nextRun = new Date(now);
  switch (frequency) {
    case 'daily':
      nextRun.setDate(nextRun.getDate() + 1);
      break;
    case 'weekly':
      nextRun.setDate(nextRun.getDate() + 7);
      break;
    case 'monthly':
      nextRun.setMonth(nextRun.getMonth() + 1);
      break;
    case 'manual':
      // Manual scans don't have next_run
      break;
  }

  const runCount = Math.floor(Math.random() * 50) + 1;
  const errorCount = Math.floor(runCount * 0.1); // 10% error rate
  const successCount = runCount - errorCount;

  const baseScan: TestScheduledScan = {
    id: `scan-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    name: SCAN_NAMES[Math.floor(Math.random() * SCAN_NAMES.length)],
    frequency,
    source_type: sourceType,
    source_config: generateSourceConfig(sourceType),
    is_active: Math.random() > 0.2, // 80% active
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    user_id: `user-${Math.random().toString(36).substr(2, 9)}`,
    last_run: Math.random() > 0.3 ? now.toISOString() : null, // 70% have run before
    next_run: frequency === 'manual' ? null : nextRun.toISOString(),
    run_count: runCount,
    success_count: successCount,
    error_count: errorCount,
    last_error: errorCount > 0 && Math.random() > 0.5 ? generateLastError() : null,
    notification_settings: {
      on_completion: Math.random() > 0.5,
      on_error: Math.random() > 0.3,
      email_notifications: Math.random() > 0.4,
      webhook_url: Math.random() > 0.8 ? 'https://webhook.example.com/scan-results' : undefined
    },
    filters: Math.random() > 0.6 ? generateFilters() : undefined,
    schedule_config: frequency !== 'manual' ? generateScheduleConfig(frequency) : undefined
  };

  return { ...baseScan, ...overrides };
};

const generateSourceConfig = (sourceType: TestScheduledScan['source_type']): Record<string, any> => {
  switch (sourceType) {
    case 'url':
      return {
        url: `https://${DOMAINS[Math.floor(Math.random() * DOMAINS.length)]}`,
        selector: ['article', 'div.content', '.post-content', 'main'][Math.floor(Math.random() * 4)],
        max_articles: Math.floor(Math.random() * 20) + 5,
        exclude_selectors: ['.advertisement', '.sidebar', '.footer'],
        follow_links: Math.random() > 0.7,
        max_depth: Math.floor(Math.random() * 3) + 1
      };
    
    case 'google_drive':
      return {
        folder_id: GOOGLE_DRIVE_FOLDERS[Math.floor(Math.random() * GOOGLE_DRIVE_FOLDERS.length)],
        file_types: ['pdf', 'docx', 'txt', 'pptx'].slice(0, Math.floor(Math.random() * 3) + 2),
        max_file_size_mb: [5, 10, 25, 50][Math.floor(Math.random() * 4)],
        recursive: Math.random() > 0.5,
        modified_since_days: Math.floor(Math.random() * 30) + 1
      };
    
    case 'rss':
      return {
        feed_url: RSS_FEEDS[Math.floor(Math.random() * RSS_FEEDS.length)],
        max_items: Math.floor(Math.random() * 50) + 10,
        filter_keywords: ['technology', 'AI', 'science'].slice(0, Math.floor(Math.random() * 3)),
        exclude_keywords: ['advertisement', 'sponsored'].slice(0, Math.floor(Math.random() * 2))
      };
    
    case 'file_upload':
      return {
        file_types: ['pdf', 'docx', 'txt'],
        max_file_size_mb: 25,
        batch_size: Math.floor(Math.random() * 20) + 5
      };
    
    case 'api':
      return {
        endpoint_url: 'https://api.example.com/content',
        api_key_required: true,
        rate_limit_per_minute: Math.floor(Math.random() * 100) + 10,
        response_format: 'json'
      };
    
    default:
      return {};
  }
};

const generateLastError = (): TestScheduledScan['last_error'] => {
  const errorCode = ERROR_CODES[Math.floor(Math.random() * ERROR_CODES.length)];
  const errorMessage = ERROR_MESSAGES[Math.floor(Math.random() * ERROR_MESSAGES.length)];
  const errorDate = new Date();
  errorDate.setHours(errorDate.getHours() - Math.floor(Math.random() * 24));
  
  return {
    message: errorMessage,
    code: errorCode,
    timestamp: errorDate.toISOString(),
    details: `Error occurred during scan execution. Code: ${errorCode}`
  };
};

const generateFilters = (): TestScheduledScan['filters'] => {
  return {
    keywords: ['important', 'urgent', 'breaking'].slice(0, Math.floor(Math.random() * 3)),
    exclude_keywords: ['spam', 'advertisement'].slice(0, Math.floor(Math.random() * 2)),
    min_content_length: Math.floor(Math.random() * 100) + 50,
    max_content_length: Math.floor(Math.random() * 5000) + 1000,
    languages: ['en', 'es', 'fr'].slice(0, Math.floor(Math.random() * 2) + 1)
  };
};

const generateScheduleConfig = (frequency: TestScheduledScan['frequency']): TestScheduledScan['schedule_config'] => {
  const config: TestScheduledScan['schedule_config'] = {
    timezone: 'UTC',
    time_of_day: `${Math.floor(Math.random() * 24).toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`
  };
  
  if (frequency === 'weekly') {
    config.day_of_week = Math.floor(Math.random() * 7);
  } else if (frequency === 'monthly') {
    config.day_of_month = Math.floor(Math.random() * 28) + 1;
  }
  
  return config;
};

// Specialized factory functions
export const createUrlScan = (overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  return createTestScheduledScan({
    source_type: 'url',
    source_config: {
      url: 'https://example-news.com',
      selector: 'article.content',
      max_articles: 10,
      exclude_selectors: ['.advertisement', '.sidebar'],
      follow_links: false
    },
    ...overrides
  });
};

export const createGoogleDriveScan = (overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  return createTestScheduledScan({
    source_type: 'google_drive',
    source_config: {
      folder_id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      file_types: ['pdf', 'docx', 'txt'],
      max_file_size_mb: 10,
      recursive: true,
      modified_since_days: 7
    },
    ...overrides
  });
};

export const createRssScan = (overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  return createTestScheduledScan({
    source_type: 'rss',
    source_config: {
      feed_url: 'https://example.com/feed.xml',
      max_items: 50,
      filter_keywords: ['technology', 'AI'],
      exclude_keywords: ['advertisement']
    },
    ...overrides
  });
};

export const createInactiveScan = (overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  return createTestScheduledScan({
    is_active: false,
    last_run: null,
    next_run: null,
    run_count: 0,
    success_count: 0,
    error_count: 0,
    last_error: null,
    ...overrides
  });
};

export const createErrorProneScan = (overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  const runCount = Math.floor(Math.random() * 20) + 10;
  const errorCount = Math.floor(runCount * 0.4); // 40% error rate
  
  return createTestScheduledScan({
    run_count: runCount,
    success_count: runCount - errorCount,
    error_count: errorCount,
    last_error: generateLastError(),
    ...overrides
  });
};

export const createManualScan = (overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  return createTestScheduledScan({
    frequency: 'manual',
    next_run: null,
    source_type: 'file_upload',
    ...overrides
  });
};

export const createRecentScan = (hoursAgo: number, overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  const lastRun = new Date();
  lastRun.setHours(lastRun.getHours() - hoursAgo);
  
  return createTestScheduledScan({
    last_run: lastRun.toISOString(),
    ...overrides
  });
};

export const createScanForUser = (userId: string, overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  return createTestScheduledScan({
    user_id: userId,
    ...overrides
  });
};

// Factory for creating multiple scans with different characteristics
export const createTestScheduledScans = (count: number, overrides: Partial<TestScheduledScan> = {}): TestScheduledScan[] => {
  return Array.from({ length: count }, () => createTestScheduledScan(overrides));
};

export const createMixedScans = (count: number): TestScheduledScan[] => {
  const scans: TestScheduledScan[] = [];
  const sourceTypes: TestScheduledScan['source_type'][] = ['url', 'google_drive', 'rss', 'file_upload'];
  const frequencies: TestScheduledScan['frequency'][] = ['daily', 'weekly', 'monthly', 'manual'];
  
  for (let i = 0; i < count; i++) {
    const sourceType = sourceTypes[i % sourceTypes.length];
    const frequency = frequencies[i % frequencies.length];
    scans.push(createTestScheduledScan({ source_type: sourceType, frequency }));
  }
  
  return scans;
};

export const createScansForUser = (userId: string, count: number): TestScheduledScan[] => {
  return Array.from({ length: count }, () => createTestScheduledScan({ user_id: userId }));
};

export const createActiveScans = (count: number): TestScheduledScan[] => {
  return Array.from({ length: count }, () => createTestScheduledScan({ is_active: true }));
};

export const createInactiveScans = (count: number): TestScheduledScan[] => {
  return Array.from({ length: count }, () => createInactiveScan());
};