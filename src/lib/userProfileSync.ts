/**
 * User Profile Synchronization Service
 * Handles synchronization between Cognito and RDS user profiles
 */

import { cognitoAuth, CognitoUser } from './cognitoAuth';
import { logger } from './logging';

interface UserProfile {
  id: string;
  cognitoUserId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  role: string;
  department: string;
  status: 'active' | 'inactive' | 'suspended';
  lastActive: string;
  createdAt: string;
  updatedAt: string;
  preferences?: Record<string, any>;
  metadata?: Record<string, any>;
}

interface SyncResult {
  success: boolean;
  action: 'created' | 'updated' | 'skipped' | 'error';
  message: string;
  profile?: UserProfile;
}

class UserProfileSyncService {
  private logger = logger.child({ component: 'UserProfileSync' });

  /**
   * Sync Cognito user to RDS user profile
   */
  async syncCognitoUserToRDS(cognitoUser: CognitoUser): Promise<SyncResult> {
    try {
      this.logger.info('Syncing Cognito user to RDS', { 
        userId: cognitoUser.userId,
        email: cognitoUser.email 
      });

      // Check if user profile already exists
      const existingProfile = await this.getUserProfileByCognitoId(cognitoUser.userId);

      if (existingProfile) {
        // Update existing profile
        return await this.updateUserProfile(existingProfile, cognitoUser);
      } else {
        // Create new profile
        return await this.createUserProfile(cognitoUser);
      }
    } catch (error) {
      this.logger.error('Failed to sync Cognito user to RDS', error as Error, {
        userId: cognitoUser.userId,
        email: cognitoUser.email
      });

      return {
        success: false,
        action: 'error',
        message: `Sync failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get user profile by Cognito user ID
   */
  private async getUserProfileByCognitoId(cognitoUserId: string): Promise<UserProfile | null> {
    try {
      // For now, we'll use a placeholder implementation
      // This will be updated when RDS migration is complete (task 4.3)
      
      // Check if we have Supabase available for backward compatibility
      const { config } = await import('./env');
      
      if (config.useSupabase) {
        const { supabase } = await import('./supabase');
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('cognito_user_id', cognitoUserId)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
          throw error;
        }

        return data ? this.convertDatabaseToProfile(data) : null;
      }

      // TODO: Replace with RDS query when migration is complete
      return null;
    } catch (error) {
      this.logger.error('Failed to get user profile by Cognito ID', error as Error, {
        cognitoUserId
      });
      throw error;
    }
  }

  /**
   * Create new user profile from Cognito user
   */
  private async createUserProfile(cognitoUser: CognitoUser): Promise<SyncResult> {
    try {
      const profile: Partial<UserProfile> = {
        cognitoUserId: cognitoUser.userId,
        email: cognitoUser.email || '',
        name: cognitoUser.name || 
              `${cognitoUser.givenName || ''} ${cognitoUser.familyName || ''}`.trim() ||
              cognitoUser.email?.split('@')[0] || 'User',
        avatarUrl: cognitoUser.picture,
        role: cognitoUser.attributes?.['custom:role'] || 'user',
        department: cognitoUser.attributes?.['custom:department'] || 'General',
        status: 'active',
        lastActive: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        preferences: {},
        metadata: {
          source: 'cognito',
          emailVerified: cognitoUser.emailVerified,
          cognitoAttributes: cognitoUser.attributes
        }
      };

      // Save to database
      const savedProfile = await this.saveUserProfile(profile);

      this.logger.info('Created new user profile', {
        cognitoUserId: cognitoUser.userId,
        profileId: savedProfile.id,
        email: savedProfile.email
      });

      return {
        success: true,
        action: 'created',
        message: 'User profile created successfully',
        profile: savedProfile
      };
    } catch (error) {
      this.logger.error('Failed to create user profile', error as Error, {
        cognitoUserId: cognitoUser.userId
      });

      return {
        success: false,
        action: 'error',
        message: `Failed to create profile: ${(error as Error).message}`
      };
    }
  }

  /**
   * Update existing user profile with Cognito data
   */
  private async updateUserProfile(existingProfile: UserProfile, cognitoUser: CognitoUser): Promise<SyncResult> {
    try {
      const updates: Partial<UserProfile> = {
        email: cognitoUser.email || existingProfile.email,
        name: cognitoUser.name || existingProfile.name,
        avatarUrl: cognitoUser.picture || existingProfile.avatarUrl,
        lastActive: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          ...existingProfile.metadata,
          emailVerified: cognitoUser.emailVerified,
          cognitoAttributes: cognitoUser.attributes,
          lastSyncAt: new Date().toISOString()
        }
      };

      // Check if any meaningful changes occurred
      const hasChanges = this.hasProfileChanges(existingProfile, updates);

      if (!hasChanges) {
        return {
          success: true,
          action: 'skipped',
          message: 'No changes detected, profile sync skipped',
          profile: existingProfile
        };
      }

      // Save updates
      const updatedProfile = await this.saveUserProfile({
        ...existingProfile,
        ...updates
      });

      this.logger.info('Updated user profile', {
        cognitoUserId: cognitoUser.userId,
        profileId: updatedProfile.id,
        changes: Object.keys(updates)
      });

      return {
        success: true,
        action: 'updated',
        message: 'User profile updated successfully',
        profile: updatedProfile
      };
    } catch (error) {
      this.logger.error('Failed to update user profile', error as Error, {
        cognitoUserId: cognitoUser.userId,
        profileId: existingProfile.id
      });

      return {
        success: false,
        action: 'error',
        message: `Failed to update profile: ${(error as Error).message}`
      };
    }
  }

  /**
   * Save user profile to database
   */
  private async saveUserProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    try {
      // For now, we'll use Supabase if available
      // This will be updated when RDS migration is complete (task 4.3)
      
      const { config } = await import('./env');
      
      if (config.useSupabase) {
        const { supabase } = await import('./supabase');
        
        const profileData = {
          cognito_user_id: profile.cognitoUserId,
          email: profile.email,
          name: profile.name,
          avatar_url: profile.avatarUrl,
          role: profile.role,
          department: profile.department,
          status: profile.status,
          last_active: profile.lastActive,
          created_at: profile.createdAt,
          updated_at: profile.updatedAt,
          preferences: profile.preferences,
          metadata: profile.metadata
        };

        if (profile.id) {
          // Update existing
          const { data, error } = await supabase
            .from('user_profiles')
            .update(profileData)
            .eq('id', profile.id)
            .select()
            .single();

          if (error) throw error;
          return this.convertDatabaseToProfile(data);
        } else {
          // Create new
          const { data, error } = await supabase
            .from('user_profiles')
            .insert(profileData)
            .select()
            .single();

          if (error) throw error;
          return this.convertDatabaseToProfile(data);
        }
      }

      // TODO: Replace with RDS implementation when migration is complete
      throw new Error('Database not available for user profile storage');
    } catch (error) {
      this.logger.error('Failed to save user profile to database', error as Error);
      throw error;
    }
  }

  /**
   * Check if profile has meaningful changes
   */
  private hasProfileChanges(existing: UserProfile, updates: Partial<UserProfile>): boolean {
    const fieldsToCheck = ['email', 'name', 'avatarUrl'];
    
    return fieldsToCheck.some(field => {
      const existingValue = existing[field as keyof UserProfile];
      const updateValue = updates[field as keyof UserProfile];
      return updateValue !== undefined && updateValue !== existingValue;
    });
  }

  /**
   * Convert database row to UserProfile
   */
  private convertDatabaseToProfile(data: any): UserProfile {
    return {
      id: data.id,
      cognitoUserId: data.cognito_user_id,
      email: data.email,
      name: data.name,
      avatarUrl: data.avatar_url,
      role: data.role,
      department: data.department,
      status: data.status,
      lastActive: data.last_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      preferences: data.preferences || {},
      metadata: data.metadata || {}
    };
  }

  /**
   * Sync user profile on authentication
   */
  async syncOnAuthentication(cognitoUser: CognitoUser): Promise<UserProfile | null> {
    try {
      const result = await this.syncCognitoUserToRDS(cognitoUser);
      
      if (result.success && result.profile) {
        return result.profile;
      }

      this.logger.warn('Profile sync failed during authentication', {
        userId: cognitoUser.userId,
        result
      });

      return null;
    } catch (error) {
      this.logger.error('Failed to sync profile on authentication', error as Error, {
        userId: cognitoUser.userId
      });
      return null;
    }
  }

  /**
   * Batch sync multiple users
   */
  async batchSyncUsers(cognitoUsers: CognitoUser[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const user of cognitoUsers) {
      try {
        const result = await this.syncCognitoUserToRDS(user);
        results.push(result);

        // Add delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          success: false,
          action: 'error',
          message: `Batch sync failed: ${(error as Error).message}`
        });
      }
    }

    this.logger.info('Batch sync completed', {
      total: cognitoUsers.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });

    return results;
  }
}

// Export singleton instance
export const userProfileSync = new UserProfileSyncService();