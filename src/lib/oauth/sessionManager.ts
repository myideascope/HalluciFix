import { supabase } from '../supabase';
import { User } from '../../types/user';
import { UserProfile } from './types';

/**
 * Session management for OAuth authentication
 */
export class SessionManager {
  private static readonly SESSION_KEY = 'hallucifix_oauth_session';
  private static readonly USER_KEY = 'hallucifix_user_data';

  /**
   * Create a user session after successful OAuth
   */
  static async createSession(oauthUser: UserProfile, tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }): Promise<User> {
    try {
      // First, try to find existing user in our database
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', oauthUser.email)
        .single();

      let userId: string;
      let userData: any;

      if (existingUser && !fetchError) {
        // Update existing user with latest OAuth data
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({
            name: oauthUser.name,
            avatar: oauthUser.picture,
            google_id: oauthUser.id,
            last_active: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingUser.id)
          .select()
          .single();

        if (updateError) {
          throw new Error(`Failed to update user: ${updateError.message}`);
        }

        userId = existingUser.id;
        userData = updatedUser;
      } else {
        // Create new user
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            email: oauthUser.email,
            name: oauthUser.name,
            avatar: oauthUser.picture,
            google_id: oauthUser.id,
            role: 'user', // Default role
            department: 'General',
            status: 'active',
            last_active: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          throw new Error(`Failed to create user: ${createError.message}`);
        }

        userId = newUser.id;
        userData = newUser;
      }

      // Create Supabase auth session
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken
      });

      if (sessionError) {
        throw new Error(`Failed to create Supabase session: ${sessionError.message}`);
      }

      // Store session info locally for quick access
      const sessionData = {
        userId,
        email: oauthUser.email,
        name: oauthUser.name,
        avatar: oauthUser.picture,
        expiresAt: tokens.expiresAt.toISOString(),
        createdAt: new Date().toISOString()
      };

      localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionData));
      localStorage.setItem(this.USER_KEY, JSON.stringify(userData));

      // Convert to our User type
      return this.convertToAppUser(userData);
    } catch (error) {
      console.error('Session creation failed:', error);
      throw error;
    }
  }

  /**
   * Get current session info
   */
  static getSessionInfo(): {
    userId: string;
    email: string;
    name: string;
    avatar?: string;
    expiresAt: Date;
    createdAt: Date;
  } | null {
    try {
      const sessionData = localStorage.getItem(this.SESSION_KEY);
      if (!sessionData) return null;

      const parsed = JSON.parse(sessionData);
      return {
        ...parsed,
        expiresAt: new Date(parsed.expiresAt),
        createdAt: new Date(parsed.createdAt)
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if session is valid
   */
  static isSessionValid(): boolean {
    const session = this.getSessionInfo();
    if (!session) return false;

    // Check if session has expired
    return new Date() < session.expiresAt;
  }

  /**
   * Clear session data
   */
  static clearSession(): void {
    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  /**
   * Get stored user data
   */
  static getStoredUser(): User | null {
    try {
      const userData = localStorage.getItem(this.USER_KEY);
      if (!userData) return null;

      const parsed = JSON.parse(userData);
      return this.convertToAppUser(parsed);
    } catch {
      return null;
    }
  }

  /**
   * Update stored user data
   */
  static updateStoredUser(userData: any): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(userData));
  }

  /**
   * Convert database user to app User type
   */
  private static convertToAppUser(userData: any): User {
    // Define role mapping
    const roleMapping: Record<string, { name: string; level: number; permissions: any[] }> = {
      'admin': { name: 'admin', level: 1, permissions: [] },
      'manager': { name: 'manager', level: 2, permissions: [] },
      'user': { name: 'user', level: 3, permissions: [] }
    };

    const role = roleMapping[userData.role] || roleMapping['user'];

    return {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      avatar: userData.avatar,
      role,
      department: userData.department || 'General',
      status: userData.status || 'active',
      lastActive: userData.last_active || new Date().toISOString(),
      createdAt: userData.created_at,
      permissions: role.permissions
    };
  }

  /**
   * Refresh session with new token data
   */
  static async refreshSession(tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }): Promise<void> {
    const session = this.getSessionInfo();
    if (!session) {
      throw new Error('No active session to refresh');
    }

    // Update Supabase session
    const { error } = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken
    });

    if (error) {
      throw new Error(`Failed to refresh Supabase session: ${error.message}`);
    }

    // Update local session data
    const updatedSession = {
      ...session,
      expiresAt: tokens.expiresAt.toISOString()
    };

    localStorage.setItem(this.SESSION_KEY, JSON.stringify(updatedSession));
  }

  /**
   * Handle session expiry
   */
  static handleSessionExpiry(): void {
    console.warn('Session has expired');
    this.clearSession();
    
    // Redirect to login or show re-authentication prompt
    // This could be customized based on app requirements
    window.location.reload();
  }

  /**
   * Monitor session validity
   */
  static startSessionMonitoring(): () => void {
    const checkInterval = 60000; // Check every minute
    
    const intervalId = setInterval(() => {
      if (!this.isSessionValid()) {
        this.handleSessionExpiry();
      }
    }, checkInterval);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }
}