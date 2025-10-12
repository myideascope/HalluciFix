import { describe, it, expect, vi } from 'vitest';
import { createTestUser, createTestAnalysisResult } from './factories';
import { createMockSupabaseClient, mockFetch } from './utils/mocks';

describe('Test Setup Verification', () => {
  it('should have proper test environment setup', () => {
    expect(vi).toBeDefined();
    expect(global.IntersectionObserver).toBeDefined();
    expect(global.ResizeObserver).toBeDefined();
    expect(window.matchMedia).toBeDefined();
  });

  it('should create test users with factories', () => {
    const user = createTestUser();
    
    expect(user).toMatchObject({
      id: expect.any(String),
      email: expect.stringMatching(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
      name: expect.any(String),
      role: expect.stringMatching(/^(user|admin)$/),
      status: expect.stringMatching(/^(active|inactive|pending)$/),
      created_at: expect.any(String),
      updated_at: expect.any(String)
    });
  });

  it('should create test analysis results with factories', () => {
    const result = createTestAnalysisResult();
    
    expect(result).toMatchObject({
      id: expect.any(String),
      user_id: expect.any(String),
      content: expect.any(String),
      accuracy: expect.any(Number),
      risk_level: expect.stringMatching(/^(low|medium|high|critical)$/),
      hallucinations: expect.any(Array),
      verification_sources: expect.any(Number),
      processing_time: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String)
    });
    
    expect(result.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.accuracy).toBeLessThanOrEqual(100);
  });

  it('should create mock Supabase client', () => {
    const mockClient = createMockSupabaseClient();
    
    expect(mockClient.auth.getSession).toBeDefined();
    expect(mockClient.from).toBeDefined();
    expect(mockClient.select).toBeDefined();
  });

  it('should mock fetch responses', async () => {
    const mockResponse = { success: true, data: 'test' };
    const fetch = mockFetch(mockResponse);
    
    const response = await fetch('/test');
    const data = await response.json();
    
    expect(data).toEqual(mockResponse);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it('should handle environment variables', () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBe('https://test.supabase.co');
    expect(import.meta.env.VITE_SUPABASE_ANON_KEY).toBe('test-anon-key');
  });
});