/**
 * Example usage of GoogleProfileService
 * This demonstrates how to use the profile caching and synchronization features
 */

import { GoogleProfileService } from './profileService';
import { TokenManager } from './tokenManager';

// Example configuration
const profileConfig = {
  ttlMs: 15 * 60 * 1000, // 15 minutes cache TTL
  maxRetries: 3,
  retryDelayMs: 1000,
  syncIntervalMs: 60 * 60 * 1000 // 1 hour sync interval
};

// Initialize services
const tokenManager = new TokenManager('your-encryption-key');
const profileService = new GoogleProfileService(tokenManager, profileConfig);

// Example usage functions
export async function exampleProfileUsage() {
  const userId = 'user-123';

  try {
    // Get user profile (uses cache if available and valid)
    console.log('Getting user profile...');
    const profile = await profileService.getUserProfile(userId);
    
    if (profile) {
      console.log('Profile retrieved:', {
        name: profile.name,
        email: profile.email,
        cached: profile.cachedAt,
        lastSync: profile.lastSyncAt
      });
    } else {
      console.log('No profile found or user not authenticated');
    }

    // Force refresh profile from Google
    console.log('Force refreshing profile...');
    const refreshedProfile = await profileService.getUserProfile(userId, true);
    
    if (refreshedProfile) {
      console.log('Profile refreshed:', {
        name: refreshedProfile.name,
        email: refreshedProfile.email,
        syncVersion: refreshedProfile.syncVersion
      });
    }

    // Manually sync profile
    console.log('Manually syncing profile...');
    const syncResult = await profileService.syncProfile(userId);
    
    if (syncResult) {
      console.log('Profile synced successfully');
    }

    // Get cache statistics
    const cacheStats = profileService.getCacheStats();
    console.log('Cache statistics:', cacheStats);

  } catch (error) {
    console.error('Profile service error:', error);
  }
}

// Example of profile validation
export function exampleProfileValidation() {
  const rawGoogleProfile = {
    id: '123456789',
    email: 'USER@EXAMPLE.COM', // Will be normalized to lowercase
    name: 'John Doe',
    given_name: 'John',
    family_name: 'Doe',
    picture: 'https://lh3.googleusercontent.com/a/default-user',
    locale: 'en-US',
    verified_email: true
  };

  const validatedProfile = profileService.validateAndSanitizeProfile(rawGoogleProfile);
  
  if (validatedProfile) {
    console.log('Validated profile:', validatedProfile);
    // Output:
    // {
    //   id: '123456789',
    //   email: 'user@example.com', // normalized
    //   name: 'John Doe',
    //   givenName: 'John',
    //   familyName: 'Doe',
    //   picture: 'https://lh3.googleusercontent.com/a/default-user',
    //   locale: 'en-us', // normalized
    //   verified: true
    // }
  } else {
    console.log('Profile validation failed');
  }
}

// Example of cache management
export function exampleCacheManagement() {
  const userId = 'user-123';

  // Clear specific user cache
  profileService.clearUserCache(userId);
  console.log(`Cache cleared for user ${userId}`);

  // Clear all cache
  profileService.clearAllCache();
  console.log('All cache cleared');

  // Get cache statistics
  const stats = profileService.getCacheStats();
  console.log('Cache stats:', {
    totalUsers: stats.size,
    users: stats.users,
    oldestEntry: stats.oldestEntry,
    newestEntry: stats.newestEntry
  });
}