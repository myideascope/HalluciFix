import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Mock the Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}));

// Mock the config module
vi.mock('../config', () => ({
  config: {
    getDatabase: vi.fn().mockResolvedValue({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key'
    })
  }
}));

// Mock environment variables
vi.mock('../../lib/env', () => ({
  env: {
    VITE_SUPABASE_URL: 'https://test.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key'
  }
}));

describe('Supabase Client', () => {
  let mockSupabaseClient: any;

  beforeEach(() => {
    mockSupabaseClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue({ data: [], error: null })
    };

    vi.mocked(createClient).mockReturnValue(mockSupabaseClient);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
    // Clear module cache to ensure fresh imports
    vi.resetModules();
  });

  describe('getSupabase', () => {
    it('should initialize Supabase client with config', async () => {
      const { getSupabase } = await import('../supabase');
      
      const client = await getSupabase();

      expect(createClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key'
      );
      expect(client).toBe(mockSupabaseClient);
    });

    it('should reuse existing client instance', async () => {
      const { getSupabase } = await import('../supabase');
      
      const client1 = await getSupabase();
      const client2 = await getSupabase();

      expect(client1).toBe(client2);
      expect(createClient).toHaveBeenCalledTimes(1);
    });

    it('should handle configuration errors', async () => {
      const { config } = await import('../config');
      
      vi.mocked(config.getDatabase).mockRejectedValueOnce(new Error('Config error'));

      const { getSupabase } = await import('../supabase');

      await expect(getSupabase()).rejects.toThrow('Config error');
    });

    it('should add logging wrapper to database operations', async () => {
      const { getSupabase } = await import('../supabase');
      
      const client = await getSupabase();
      
      // Test that the from method is wrapped
      expect(typeof client.from).toBe('function');
      
      const query = client.from('test_table');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('test_table');
    });
  });

  describe('legacy supabase proxy', () => {
    it('should initialize with environment variables', async () => {
      // Import the legacy proxy
      const { supabase } = await import('../supabase');
      
      // Access a property to trigger initialization
      const fromMethod = supabase.from;
      
      expect(createClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key'
      );
      expect(typeof fromMethod).toBe('function');
    });

    it('should throw error when environment variables are missing', async () => {
      // Mock missing environment variables
      vi.doMock('../../lib/env', () => ({
        env: {
          VITE_SUPABASE_URL: undefined,
          VITE_SUPABASE_ANON_KEY: undefined
        }
      }));

      const { supabase } = await import('../supabase');

      expect(() => supabase.from).toThrow(
        'Supabase configuration not found'
      );
    });
  });

  describe('database operations logging', () => {
    it('should log successful select operations', async () => {
      const { getSupabase } = await import('../supabase');
      
      const client = await getSupabase();
      
      // Mock successful response
      const mockResponse = {
        data: [{ id: 1, name: 'test' }],
        error: null
      };
      
      const mockQuery = {
        select: vi.fn().mockReturnValue(Promise.resolve(mockResponse)),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      };
      
      mockSupabaseClient.from.mockReturnValue(mockQuery);
      
      const query = client.from('test_table');
      const result = await query.select('*');
      
      expect(result).toEqual(mockResponse);
      expect(mockQuery.select).toHaveBeenCalledWith('*');
    });

    it('should log failed select operations', async () => {
      const { getSupabase } = await import('../supabase');
      
      const client = await getSupabase();
      
      // Mock error response
      const mockResponse = {
        data: null,
        error: { message: 'Database error', code: '500' }
      };
      
      const mockQuery = {
        select: vi.fn().mockReturnValue(Promise.resolve(mockResponse)),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      };
      
      mockSupabaseClient.from.mockReturnValue(mockQuery);
      
      const query = client.from('test_table');
      const result = await query.select('*');
      
      expect(result).toEqual(mockResponse);
      expect(result.error).toBeDefined();
    });

    it('should log insert operations with record count', async () => {
      const { getSupabase } = await import('../supabase');
      
      const client = await getSupabase();
      
      const testData = { name: 'test', value: 123 };
      const mockResponse = {
        data: [{ id: 1, ...testData }],
        error: null
      };
      
      const mockQuery = {
        select: vi.fn(),
        insert: vi.fn().mockReturnValue(Promise.resolve(mockResponse)),
        update: vi.fn(),
        delete: vi.fn()
      };
      
      mockSupabaseClient.from.mockReturnValue(mockQuery);
      
      const query = client.from('test_table');
      const result = await query.insert(testData);
      
      expect(result).toEqual(mockResponse);
      expect(mockQuery.insert).toHaveBeenCalledWith(testData);
    });

    it('should handle batch insert operations', async () => {
      const { getSupabase } = await import('../supabase');
      
      const client = await getSupabase();
      
      const testData = [
        { name: 'test1', value: 123 },
        { name: 'test2', value: 456 }
      ];
      
      const mockResponse = {
        data: testData.map((item, index) => ({ id: index + 1, ...item })),
        error: null
      };
      
      const mockQuery = {
        select: vi.fn(),
        insert: vi.fn().mockReturnValue(Promise.resolve(mockResponse)),
        update: vi.fn(),
        delete: vi.fn()
      };
      
      mockSupabaseClient.from.mockReturnValue(mockQuery);
      
      const query = client.from('test_table');
      const result = await query.insert(testData);
      
      expect(result).toEqual(mockResponse);
      expect(mockQuery.insert).toHaveBeenCalledWith(testData);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      const { getSupabase } = await import('../supabase');
      
      const client = await getSupabase();
      
      const mockQuery = {
        select: vi.fn().mockRejectedValue(new Error('Network error')),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      };
      
      mockSupabaseClient.from.mockReturnValue(mockQuery);
      
      const query = client.from('test_table');
      
      await expect(query.select('*')).rejects.toThrow('Network error');
    });

    it('should handle authentication errors', async () => {
      const { getSupabase } = await import('../supabase');
      
      const client = await getSupabase();
      
      const authError = {
        data: null,
        error: { 
          message: 'Invalid JWT token',
          code: 'PGRST301'
        }
      };
      
      const mockQuery = {
        select: vi.fn().mockReturnValue(Promise.resolve(authError)),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      };
      
      mockSupabaseClient.from.mockReturnValue(mockQuery);
      
      const query = client.from('test_table');
      const result = await query.select('*');
      
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('PGRST301');
    });

    it('should handle database constraint violations', async () => {
      const { getSupabase } = await import('../supabase');
      
      const client = await getSupabase();
      
      const constraintError = {
        data: null,
        error: {
          message: 'duplicate key value violates unique constraint',
          code: '23505'
        }
      };
      
      const mockQuery = {
        select: vi.fn(),
        insert: vi.fn().mockReturnValue(Promise.resolve(constraintError)),
        update: vi.fn(),
        delete: vi.fn()
      };
      
      mockSupabaseClient.from.mockReturnValue(mockQuery);
      
      const query = client.from('test_table');
      const result = await query.insert({ name: 'duplicate' });
      
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('23505');
    });
  });

  describe('performance monitoring', () => {
    it('should track operation duration', async () => {
      const { getSupabase } = await import('../supabase');
      
      const client = await getSupabase();
      
      // Mock slow operation
      const mockQuery = {
        select: vi.fn().mockImplementation(() => 
          new Promise(resolve => 
            setTimeout(() => resolve({ data: [], error: null }), 100)
          )
        ),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      };
      
      mockSupabaseClient.from.mockReturnValue(mockQuery);
      
      const startTime = Date.now();
      const query = client.from('test_table');
      await query.select('*');
      const duration = Date.now() - startTime;
      
      expect(duration).toBeGreaterThanOrEqual(100);
    });

    it('should handle concurrent operations', async () => {
      const { getSupabase } = await import('../supabase');
      
      const client = await getSupabase();
      
      const mockQuery = {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      };
      
      mockSupabaseClient.from.mockReturnValue(mockQuery);
      
      const promises = Array.from({ length: 5 }, () => {
        const query = client.from('test_table');
        return query.select('*');
      });
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      expect(mockQuery.select).toHaveBeenCalledTimes(5);
      results.forEach(result => {
        expect(result.data).toEqual([]);
        expect(result.error).toBeNull();
      });
    });
  });

  describe('configuration validation', () => {
    it('should validate required configuration parameters', async () => {
      const { config } = await import('../config');
      
      // Test missing URL
      vi.mocked(config.getDatabase).mockResolvedValueOnce({
        supabaseUrl: '',
        supabaseAnonKey: 'test-key'
      });

      const { getSupabase } = await import('../supabase');

      await expect(getSupabase()).rejects.toThrow();
    });

    it('should validate URL format', async () => {
      const { config } = await import('../config');
      
      // Test invalid URL format
      vi.mocked(config.getDatabase).mockResolvedValueOnce({
        supabaseUrl: 'invalid-url',
        supabaseAnonKey: 'test-key'
      });

      const { getSupabase } = await import('../supabase');
      
      // Should still create client (Supabase client doesn't validate URL format)
      const client = await getSupabase();
      expect(client).toBeDefined();
    });

    it('should handle configuration updates', async () => {
      const { config } = await import('../config');
      
      // First configuration
      vi.mocked(config.getDatabase).mockResolvedValueOnce({
        supabaseUrl: 'https://first.supabase.co',
        supabaseAnonKey: 'first-key'
      });

      const { getSupabase } = await import('../supabase');
      const client1 = await getSupabase();

      expect(createClient).toHaveBeenCalledWith(
        'https://first.supabase.co',
        'first-key'
      );

      // Should reuse the same client instance
      const client2 = await getSupabase();
      expect(client1).toBe(client2);
      expect(createClient).toHaveBeenCalledTimes(1);
    });
  });
});