/**
 * Tests for Google Profile Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleProfileService, ProfileCacheConfig } from '../profileService';
import { TokenManager } from '../tokenManager';
import { UserProfile } from '../types';

// Mock dependencies
const mockSupabase = {
  from: vi.fn(() => ({
    upsert: vi.fn(() => Promise.resolve({ error: null })),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: null, error: null }))
      }))
    }))
  }))
};

vi.mock('../supabase', () => ({
  supabase: mockSupabase
}));

vi.mock('../tokenManager');

describe('GoogleProfileService', () => {
  let profileService: GoogleProfileService;
  let mockTokenManager: vi.Mocked<TokenManager>;
  let mockFetch: vi.MockedFunction<typeof fetch>;

  const mockProfile: UserProfile = {
    id: '123456789',
    email: 'test@example.com',
    name: 'Test User',
    givenName: 'Test',
    familyName: 'User',
    picture: 'https://example.com/avatar.jpg',
    locale: 'en',
    verified: true
  };

  const mockConfig: ProfileCacheConfig = {
    ttlMs: 15 * 60 * 1000, // 15 minutes
    maxRetries: 3,
    retryDelayMs: 1000,
    syncIntervalMs: 60 * 60 * 1000 // 1 hour
  };

  beforeEach(() => {
    mockTokenManager = {
      getValidTokens: vi.fn(),
      refreshTokensWithConcurrencyControl: vi.fn()
    } as any;

    profileService = new GoogleProfileService(mockTokenManager, mockConfig);

    // Mock fetch globally
    mockFetch = vi.fn() as any;
    global.fetch = mockFetch;

    // Reset Supabase mocks
    vi.clearAllMocks();
    mockSupabase.from.mockReturnValue({
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      }))
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validateAndSanitizeProfile', () => {
    it('should validate and sanitize a valid profile', () => {
      const rawProfile = {
        id: '123456789',
        email: 'TEST@EXAMPLE.COM',
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        picture: 'https://example.com/avatar.jpg',
        locale: 'en-US',
        verified_email: true
      };

      const result = profileService.validateAndSanitizeProfile(rawProfile);

      expect(result).toEqual({
        id: '123456789',
        email: 'test@example.com', // Should be lowercase
        name: 'Test User',
        givenName: 'Test',
        familyName: 'User',
        picture: 'https://example.com/avatar.jpg',
        locale: 'en-us', // Should be lowercase
        verified: true
      });
    });

    it('should reject profile with missing required fields', () => {
      const invalidProfile = {
        name: 'Test User'
        // Missing id and email
      };

      const result = profileService.validateAndSanitizeProfile(invalidProfile);
      expect(result).toBeNull();
    });

    it('should reject profile with invalid email', () => {
      const invalidProfile = {
        id: '123456789',
        email: 'invalid-email',
        name: 'Test User'
      };

      const result = profileService.validateAndSanitizeProfile(invalidProfile);
      expect(result).toBeNull();
    });

    it('should sanitize unsafe URLs', () => {
      const profileWithUnsafeUrl = {
        id: '123456789',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'javascript:alert("xss")'
      };

      const result = profileService.validateAndSanitizeProfile(profileWithUnsafeUrl);
      expect(result?.picture).toBe(''); // Should be empty for unsafe URLs
    });

    it('should generate name from email if name is missing', () => {
      const profileWithoutName = {
        id: '123456789',
        email: 'john.doe@example.com'
      };

      const result = profileService.validateAndSanitizeProfile(profileWithoutName);
      expect(result?.name).toBe('John Doe'); // Should generate from email
    });
  });

  describe('syncProfile', () => {
    it('should successfully sync profile from Google', async () => {
      const userId = 'user123';
      const mockTokens = {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'profile email',
        tokenType: 'Bearer'
      };

      mockTokenManager.getValidTokens.mockResolvedValue(mockTokens);
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: mockProfile.id,
          email: mockProfile.email,
          name: mockProfile.name,
          given_name: mockProfile.givenName,
          family_name: mockProfile.familyName,
          picture: mockProfile.picture,
          locale: mockProfile.locale,
          verified_email: mockProfile.verified
        })
      } as Response);

      const result = await profileService.syncProfile(userId);

      expect(result).toBeTruthy();
      expect(result?.email).toBe(mockProfile.email);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-access-token'
          })
        })
      );
    });

    it('should handle token refresh on 401 error', async () => {
      const userId = 'user123';
      const mockTokens = {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'profile email',
        tokenType: 'Bearer'
      };

      mockTokenManager.getValidTokens.mockResolvedValue(mockTokens);
      mockTokenManager.refreshTokensWithConcurrencyControl.mockResolvedValue(mockTokens);
      
      // First call returns 401, second call succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized'
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: mockProfile.id,
            email: mockProfile.email,
            name: mockProfile.name
          })
        } as Response);

      const result = await profileService.syncProfile(userId);

      expect(result).toBeTruthy();
      expect(mockTokenManager.refreshTokensWithConcurrencyControl).toHaveBeenCalledWith(userId);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return null when no valid tokens available', async () => {
      const userId = 'user123';
      mockTokenManager.getValidTokens.mockResolvedValue(null);

      const result = await profileService.syncProfile(userId);

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('cache management', () => {
    it('should return cached profile if valid', async () => {
      const userId = 'user123';
      
      // First call should fetch from Google
      mockTokenManager.getValidTokens.mockResolvedValue({
        accessToken: 'mock-token',
        refreshToken: 'mock-refresh',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'profile email',
        tokenType: 'Bearer'
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockProfile)
      } as Response);

      const firstResult = await profileService.getUserProfile(userId);
      expect(firstResult).toBeTruthy();

      // Second call should use cache (no fetch)
      mockFetch.mockClear();
      const secondResult = await profileService.getUserProfile(userId);
      
      expect(secondResult).toBeTruthy();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should clear user cache', () => {
      const userId = 'user123';
      
      profileService.clearUserCache(userId);
      
      // Should not throw and should work silently
      expect(() => profileService.clearUserCache(userId)).not.toThrow();
    });

    it('should provide cache statistics', () => {
      const stats = profileService.getCacheStats();
      
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('users');
      expect(Array.isArray(stats.users)).toBe(true);
    });
  });
});