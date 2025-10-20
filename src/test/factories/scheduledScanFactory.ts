export interface TestScheduledScan {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  source_type: 'url' | 'google_drive' | 'file_upload';
  source_config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
  last_run?: string | null;
  next_run?: string | null;
}

export const createTestScheduledScan = (overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  const now = new Date();
  const frequency = overrides.frequency || 'daily';
  
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
  }

  const baseScan: TestScheduledScan = {
    id: `scan-${Math.random().toString(36).substr(2, 9)}`,
    name: `Test Scan ${Math.random().toString(36).substr(2, 5)}`,
    frequency,
    source_type: 'url',
    source_config: {
      url: 'https://example.com',
      selector: 'article',
      max_articles: 10
    },
    is_active: true,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    user_id: `user-${Math.random().toString(36).substr(2, 9)}`,
    last_run: now.toISOString(),
    next_run: nextRun.toISOString()
  };

  return { ...baseScan, ...overrides };
};

export const createUrlScan = (overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  return createTestScheduledScan({
    source_type: 'url',
    source_config: {
      url: 'https://example-news.com',
      selector: 'article.content',
      max_articles: 10
    },
    ...overrides
  });
};

export const createGoogleDriveScan = (overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  return createTestScheduledScan({
    source_type: 'google_drive',
    source_config: {
      folder_id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      file_types: ['pdf', 'docx', 'txt']
    },
    ...overrides
  });
};

export const createInactiveScan = (overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => {
  return createTestScheduledScan({
    is_active: false,
    last_run: null,
    next_run: null,
    ...overrides
  });
};

// Factory for creating multiple scans
export const createTestScheduledScans = (count: number, overrides: Partial<TestScheduledScan> = {}): TestScheduledScan[] => {
  return Array.from({ length: count }, () => createTestScheduledScan(overrides));
};