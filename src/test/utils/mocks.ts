import { vi } from 'vitest';

// Mock Supabase client
export const createMockSupabaseClient = () => ({
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } }
    }),
  },
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  gt: vi.fn().mockReturnThis(),
  lt: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  like: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  contains: vi.fn().mockReturnThis(),
  containedBy: vi.fn().mockReturnThis(),
  rangeGt: vi.fn().mockReturnThis(),
  rangeLt: vi.fn().mockReturnThis(),
  rangeGte: vi.fn().mockReturnThis(),
  rangeLte: vi.fn().mockReturnThis(),
  rangeAdjacent: vi.fn().mockReturnThis(),
  overlaps: vi.fn().mockReturnThis(),
  textSearch: vi.fn().mockReturnThis(),
  match: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  filter: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
  abortSignal: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: null, error: null }),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  csv: vi.fn().mockResolvedValue({ data: '', error: null }),
  geojson: vi.fn().mockResolvedValue({ data: null, error: null }),
  explain: vi.fn().mockResolvedValue({ data: null, error: null }),
  rollback: vi.fn().mockResolvedValue({ data: null, error: null }),
  returns: vi.fn().mockReturnThis(),
});

// Mock Google APIs
export const createMockGoogleAuth = () => ({
  getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' }),
  setCredentials: vi.fn(),
  on: vi.fn(),
  generateAuthUrl: vi.fn().mockReturnValue('https://mock-auth-url.com'),
  getToken: vi.fn().mockResolvedValue({ tokens: { access_token: 'mock-token' } }),
});

export const createMockGoogleDrive = () => ({
  files: {
    list: vi.fn().mockResolvedValue({
      data: {
        files: [
          {
            id: 'mock-file-1',
            name: 'Test Document.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          }
        ]
      }
    }),
    get: vi.fn().mockResolvedValue({
      data: 'Mock file content'
    }),
    export: vi.fn().mockResolvedValue({
      data: 'Mock exported content'
    }),
  }
});

// Mock analysis service responses
export const createMockAnalysisResult = (overrides = {}) => ({
  id: 'mock-analysis-id',
  user_id: 'test-user-id',
  content: 'Test content for analysis',
  accuracy: 85.5,
  risk_level: 'medium',
  hallucinations: [
    {
      text: 'suspicious claim',
      confidence: 0.8,
      reasoning: 'This claim appears to be exaggerated'
    }
  ],
  verification_sources: 5,
  processing_time: 1250,
  created_at: new Date().toISOString(),
  ...overrides
});

// Mock fetch responses
export const mockFetch = (response: any, options: { ok?: boolean; status?: number } = {}) => {
  const { ok = true, status = 200 } = options;
  
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(response),
    text: vi.fn().mockResolvedValue(typeof response === 'string' ? response : JSON.stringify(response)),
    blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(response)])),
  });
};

// Mock localStorage
export const mockLocalStorage = () => {
  const store: Record<string, string> = {};
  
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    length: 0,
    key: vi.fn(),
  };
};

// Mock file operations
export const createMockFile = (name: string, content: string, type: string = 'text/plain') => {
  const file = new File([content], name, { type });
  return file;
};

export const createMockFileList = (files: File[]) => {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] || null,
    [Symbol.iterator]: function* () {
      for (const file of files) {
        yield file;
      }
    }
  };
  
  // Add files as indexed properties
  files.forEach((file, index) => {
    (fileList as any)[index] = file;
  });
  
  return fileList as FileList;
};

// Mock URL.createObjectURL and URL.revokeObjectURL
export const mockURL = () => {
  global.URL.createObjectURL = vi.fn().mockReturnValue('mock-object-url');
  global.URL.revokeObjectURL = vi.fn();
};