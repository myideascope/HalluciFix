/**
 * Google Profile Service with caching and synchronization
 * Handles fetching, caching, and synchronizing user profile data from Google
 */

import { UserProfile } from './types';
import { TokenManager } from './tokenManager';
import { supabase } from '../supabase';

import { logger } from '../logging';
export interface CachedProfile extends UserProfile {
  cachedAt: Date;
  lastSyncAt: Date;
  syncVersion: number;
}

export interface ProfileSyncResult {
  success: boolean;
  updated: boolean;
  profile?: CachedProfile;
  error?: string;
}

export interface ProfileCacheConfig {
  ttlMs: number; // Time to live in milliseconds
  maxRetries: number;
  retryDelayMs: number;
  syncIntervalMs: number; // How often to sync with Google
}

export class GoogleProfileService {
  private tokenManager: TokenManager;
  private cache: Map<string, CachedProfile> = new Map();
  private syncPromises: Map<string, Promise<ProfileSyncResult>> = new Map();
  private config: ProfileCacheConfig;
  private readonly googleProfileUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';

  constructor(tokenManager: TokenManager, config?: Partial<ProfileCacheConfig>) {
    this.tokenManager = tokenManager;
    this.config = {
      ttlMs: 15 * 60 * 1000, // 15 minutes default TTL
      maxRetries: 3,
      retryDelayMs: 1000,
      syncIntervalMs: 60 * 60 * 1000, // 1 hour sync interval
      ...config
    };
  }

  /**
   * Gets user profile with caching and automatic synchronization
   */
  async getUserProfile(userId: string, forceRefresh = false): Promise<CachedProfile | null> {
    try {
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cachedProfile = await this.getCachedProfile(userId);
        if (cachedProfile && this.isCacheValid(cachedProfile)) {
          // Check if we need background sync
          if (this.needsBackgroundSync(cachedProfile)) {
            // Start background sync without waiting
            this.syncProfileInBackground(userId);
          }
          return cachedProfile;
        }
      }

      // Fetch fresh profile data
      return await this.syncProfile(userId);
    } catch (error) {
      logger.error("Failed to get user profile:", error instanceof Error ? error : new Error(String(error)));
      
      // Return cached profile as fallback if available
      const cachedProfile = await this.getCachedProfile(userId);
      if (cachedProfile) {
        logger.warn("Returning stale cached profile due to sync error");
        return cachedProfile;
      }
      
      return null;
    }
  }

  /**
   * Synchronizes profile data with Google and updates cache/database
   */
  async syncProfile(userId: string): Promise<CachedProfile | null> {
    // Check for existing sync operation
    const existingSync = this.syncPromises.get(userId);
    if (existingSync) {
      const result = await existingSync;
      return result.profile || null;
    }

    // Start new sync operation
    const syncPromise = this.performProfileSync(userId);
    this.syncPromises.set(userId, syncPromise);

    try {
      const result = await syncPromise;
      return result.profile || null;
    } finally {
      this.syncPromises.delete(userId);
    }
  }

  /**
   * Validates and sanitizes profile data
   */
  validateAndSanitizeProfile(profile: any): UserProfile | null {
    try {
      // Required fields validation
      if (!profile.id || !profile.email) {
        logger.error("Profile missing required fields:", { hasId: !!profile.id, hasEmail: !!profile.email } instanceof Error ? { hasId: !!profile.id, hasEmail: !!profile.email } : new Error(String({ hasId: !!profile.id, hasEmail: !!profile.email })));
        return null;
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(profile.email)) {
        logger.error("Invalid email format:", profile.email instanceof Error ? profile.email : new Error(String(profile.email)));
        return null;
      }

      // Sanitize and validate fields
      const sanitizedProfile: UserProfile = {
        id: String(profile.id).trim(),
        email: String(profile.email).toLowerCase().trim(),
        name: this.sanitizeString(profile.name) || this.generateNameFromEmail(profile.email),
        givenName: this.sanitizeString(profile.given_name) || '',
        familyName: this.sanitizeString(profile.family_name) || '',
        picture: this.sanitizeUrl(profile.picture) || '',
        locale: this.sanitizeLocale(profile.locale) || 'en',
        verified: Boolean(profile.verified_email)
      };

      return sanitizedProfile;
    } catch (error) {
      logger.error("Profile validation failed:", error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Updates profile in database and cache
   */
  async updateProfileInDatabase(userId: string, profile: UserProfile): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .upsert({
          id: userId,
          email: profile.email,
          name: profile.name,
          avatar_url: profile.picture,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        });

      if (error) {
        logger.error("Failed to update profile in database:", error instanceof Error ? error : new Error(String(error)));
        return false;
      }

      return true;
    } catch (error) {
      logger.error("Database update error:", error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  /**
   * Gets cached profile from memory and database
   */
  private async getCachedProfile(userId: string): Promise<CachedProfile | null> {
    // Check memory cache first
    const memoryCache = this.cache.get(userId);
    if (memoryCache) {
      return memoryCache;
    }

    // Check database cache
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      // Convert database record to cached profile
      const cachedProfile: CachedProfile = {
        id: data.id,
        email: data.email,
        name: data.name,
        givenName: '', // Not stored in database
        familyName: '', // Not stored in database
        picture: data.avatar_url || '',
        locale: 'en', // Default locale
        verified: true, // Assume verified if in database
        cachedAt: new Date(data.updated_at),
        lastSyncAt: new Date(data.updated_at),
        syncVersion: 1
      };

      // Update memory cache
      this.cache.set(userId, cachedProfile);
      return cachedProfile;
    } catch (error) {
      logger.error("Failed to get cached profile from database:", error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Performs the actual profile synchronization
   */
  private async performProfileSync(userId: string): Promise<ProfileSyncResult> {
    let retries = 0;
    
    while (retries < this.config.maxRetries) {
      try {
        // Get valid tokens
        const tokens = await this.tokenManager.getValidTokens(userId);
        if (!tokens) {
          return {
            success: false,
            updated: false,
            error: 'No valid tokens available'
          };
        }

        // Fetch profile from Google
        const response = await fetch(this.googleProfileUrl, {
          headers: {
            'Authorization': `Bearer ${tokens.accessToken}`,
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          if (response.status === 401) {
            // Token might be expired, try refresh
            await this.tokenManager.refreshTokensWithConcurrencyControl(userId);
            retries++;
            continue;
          }
          throw new Error(`Profile fetch failed: ${response.status} ${response.statusText}`);
        }

        const profileData = await response.json();
        
        // Validate and sanitize profile
        const validatedProfile = this.validateAndSanitizeProfile(profileData);
        if (!validatedProfile) {
          return {
            success: false,
            updated: false,
            error: 'Profile validation failed'
          };
        }

        // Check if profile has changed
        const existingProfile = await this.getCachedProfile(userId);
        const hasChanged = !existingProfile || this.hasProfileChanged(existingProfile, validatedProfile);

        // Update database if changed
        if (hasChanged) {
          const updateSuccess = await this.updateProfileInDatabase(userId, validatedProfile);
          if (!updateSuccess) {
            return {
              success: false,
              updated: false,
              error: 'Database update failed'
            };
          }
        }

        // Create cached profile
        const cachedProfile: CachedProfile = {
          ...validatedProfile,
          cachedAt: new Date(),
          lastSyncAt: new Date(),
          syncVersion: (existingProfile?.syncVersion || 0) + 1
        };

        // Update memory cache
        this.cache.set(userId, cachedProfile);

        return {
          success: true,
          updated: hasChanged,
          profile: cachedProfile
        };

      } catch (error) {
        retries++;
        console.error(`Profile sync attempt ${retries} failed:`, error);
        
        if (retries < this.config.maxRetries) {
          await this.delay(this.config.retryDelayMs * retries);
        }
      }
    }

    return {
      success: false,
      updated: false,
      error: `Profile sync failed after ${this.config.maxRetries} retries`
    };
  }

  /**
   * Starts background profile synchronization
   */
  private syncProfileInBackground(userId: string): void {
    this.syncProfile(userId).catch(error => {
      logger.error("Background profile sync failed:", error instanceof Error ? error : new Error(String(error)));
    });
  }

  /**
   * Checks if cached profile is still valid
   */
  private isCacheValid(profile: CachedProfile): boolean {
    const now = new Date();
    const cacheAge = now.getTime() - profile.cachedAt.getTime();
    return cacheAge < this.config.ttlMs;
  }

  /**
   * Checks if profile needs background synchronization
   */
  private needsBackgroundSync(profile: CachedProfile): boolean {
    const now = new Date();
    const syncAge = now.getTime() - profile.lastSyncAt.getTime();
    return syncAge > this.config.syncIntervalMs;
  }

  /**
   * Checks if profile data has changed
   */
  private hasProfileChanged(existing: CachedProfile, updated: UserProfile): boolean {
    return (
      existing.email !== updated.email ||
      existing.name !== updated.name ||
      existing.picture !== updated.picture ||
      existing.verified !== updated.verified
    );
  }

  /**
   * Sanitizes string input
   */
  private sanitizeString(input: any): string {
    if (typeof input !== 'string') return '';
    return input.trim().substring(0, 255); // Limit length
  }

  /**
   * Sanitizes URL input
   */
  private sanitizeUrl(input: any): string {
    if (typeof input !== 'string') return '';
    try {
      const url = new URL(input);
      // Only allow https URLs for profile pictures
      return url.protocol === 'https:' ? url.toString() : '';
    } catch {
      return '';
    }
  }

  /**
   * Sanitizes locale input
   */
  private sanitizeLocale(input: any): string {
    if (typeof input !== 'string') return 'en';
    const locale = input.toLowerCase().trim();
    // Basic locale validation (language or language-country)
    return /^[a-z]{2}(-[a-z]{2})?$/.test(locale) ? locale : 'en';
  }

  /**
   * Generates name from email if name is not available
   */
  private generateNameFromEmail(email: string): string {
    const localPart = email.split('@')[0];
    return localPart.replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clears cache for a specific user
   */
  clearUserCache(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Clears all cached profiles
   */
  clearAllCache(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): {
    size: number;
    users: string[];
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const users = Array.from(this.cache.keys());
    const profiles = Array.from(this.cache.values());
    
    let oldestEntry: Date | undefined;
    let newestEntry: Date | undefined;
    
    if (profiles.length > 0) {
      oldestEntry = profiles.reduce((oldest, profile) => 
        profile.cachedAt < oldest ? profile.cachedAt : oldest, profiles[0].cachedAt);
      newestEntry = profiles.reduce((newest, profile) => 
        profile.cachedAt > newest ? profile.cachedAt : newest, profiles[0].cachedAt);
    }

    return {
      size: this.cache.size,
      users,
      oldestEntry,
      newestEntry
    };
  }
}