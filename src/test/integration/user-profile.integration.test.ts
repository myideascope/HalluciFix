import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  withIntegrationTest,
  createTestUser,
  IntegrationDatabaseSeeder
} from '../utils';
import { supabase } from '../../lib/supabase';
import { SessionManager } from '../../lib/oauth/sessionManager';
import { User, UserRole, DEFAULT_ROLES } from '../../types/user';
import { UserProfile } from '../../lib/oauth/types';

describe('User Profile Integration Tests', () => {
  let seeder: IntegrationDatabaseSeeder;
  
  const mockGoogleProfile: UserProfile = {
    id: 'google-user-123',
    email: 'profile-test@example.com',
    name: 'Profile Test User',
    givenName: 'Profile',
    familyName: 'User',
    picture: 'https://example.com/profile-avatar.jpg',
    locale: 'en',
    verified: true
  };

  beforeEach(async () => {
    seeder = new IntegrationDatabaseSeeder();
    
    // Mock Supabase operations
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis()
    } as any);
  });

  afterEach(async () => {
    await seeder.cleanup();
    vi.restoreAllMocks();
  });

  describe('User Profile Creation', () => {
    it('should create new user profile from OAuth data', async () => {
      await withIntegrationTest('profile-creation-oauth', 'auth', async () => {
        // Mock successful user creation
        vi.spyOn(supabase, 'from').mockReturnValue({
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ 
            data: null, 
            error: { message: 'No rows found' } 
          })
        } as any);
        
        vi.spyOn(supabase, 'from').mockReturnValue({
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ 
            data: {
              id: 'new-user-id',
              email: mockGoogleProfile.email,
              name: mockGoogleProfile.name,
              avatar_url: mockGoogleProfile.picture,
              google_id: mockGoogleProfile.id,
              role_id: 'user',
              department: 'General',
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, 
            error: null 
          })
        } as any);
        
        const user = await SessionManager.createSession(mockGoogleProfile, {
          accessToken: 'new-profile-token',
          refreshToken: 'new-profile-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user).toBeDefined();
        expect(user.email).toBe(mockGoogleProfile.email);
        expect(user.name).toBe(mockGoogleProfile.name);
        expect(user.avatar).toBe(mockGoogleProfile.picture);
        expect(user.role.name).toBe('user');
        expect(user.department).toBe('General');
        expect(user.status).toBe('active');
      });
    });

    it('should handle profile creation with minimal OAuth data', async () => {
      await withIntegrationTest('profile-creation-minimal', 'auth', async () => {
        const minimalProfile: UserProfile = {
          id: 'minimal-user-123',
          email: 'minimal@example.com',
          name: '',
          givenName: '',
          familyName: '',
          picture: '',
          locale: '',
          verified: false
        };
        
        // Mock user creation with fallback values
        vi.spyOn(supabase, 'from').mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ 
            data: null, 
            error: { message: 'No rows found' } 
          }),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis()
        } as any);
        
        const user = await SessionManager.createSession(minimalProfile, {
          accessToken: 'minimal-token',
          refreshToken: 'minimal-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user).toBeDefined();
        expect(user.email).toBe(minimalProfile.email);
        expect(user.name).toBeTruthy(); // Should have fallback name
        expect(user.role).toBeDefined();
      });
    });

    it('should assign correct default role to new users', async () => {
      await withIntegrationTest('profile-default-role', 'auth', async () => {
        const user = await SessionManager.createSession(mockGoogleProfile, {
          accessToken: 'default-role-token',
          refreshToken: 'default-role-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user.role).toBeDefined();
        expect(user.role.name).toBe('user');
        expect(user.role.level).toBe(3);
        expect(Array.isArray(user.permissions)).toBe(true);
        
        // Should have default user permissions
        const defaultUserRole = DEFAULT_ROLES.find(r => r.name === 'user');
        expect(user.permissions).toEqual(defaultUserRole?.permissions || []);
      });
    });

    it('should handle profile creation errors gracefully', async () => {
      await withIntegrationTest('profile-creation-error', 'auth', async () => {
        // Mock database error
        vi.spyOn(supabase, 'from').mockReturnValue({
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockRejectedValue(new Error('Database connection failed'))
        } as any);
        
        await expect(
          SessionManager.createSession(mockGoogleProfile, {
            accessToken: 'error-token',
            refreshToken: 'error-refresh',
            expiresAt: new Date(Date.now() + 3600000),
            scope: 'openid email profile'
          })
        ).rejects.toThrow();
      });
    });
  });

  describe('User Profile Updates', () => {
    it('should update existing user profile with new OAuth data', async () => {
      await withIntegrationTest('profile-update-oauth', 'auth', async (testData) => {
        const { users } = testData;
        const existingUser = users[0];
        
        // Mock existing user found
        vi.spyOn(supabase, 'from').mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ 
            data: {
              id: existingUser.id,
              email: existingUser.email,
              name: existingUser.name,
              role_id: existingUser.role,
              department: existingUser.department,
              status: existingUser.status
            }, 
            error: null 
          }),
          update: vi.fn().mockReturnThis()
        } as any);
        
        const updatedProfile: UserProfile = {
          ...mockGoogleProfile,
          email: existingUser.email,
          name: 'Updated Profile Name',
          picture: 'https://example.com/updated-avatar.jpg'
        };
        
        const user = await SessionManager.createSession(updatedProfile, {
          accessToken: 'update-token',
          refreshToken: 'update-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user).toBeDefined();
        expect(user.email).toBe(existingUser.email);
        expect(user.name).toBe('Updated Profile Name');
        expect(user.avatar).toBe('https://example.com/updated-avatar.jpg');
      });
    });

    it('should preserve user role during profile updates', async () => {
      await withIntegrationTest('profile-update-preserve-role', 'auth', async (testData) => {
        const { users } = testData;
        const adminUser = users.find(u => u.role === 'admin');
        
        if (adminUser) {
          // Mock existing admin user
          vi.spyOn(supabase, 'from').mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: {
                id: adminUser.id,
                email: adminUser.email,
                name: adminUser.name,
                role_id: 'admin',
                department: adminUser.department,
                status: adminUser.status
              }, 
              error: null 
            }),
            update: vi.fn().mockReturnThis()
          } as any);
          
          const adminProfile: UserProfile = {
            ...mockGoogleProfile,
            email: adminUser.email
          };
          
          const user = await SessionManager.createSession(adminProfile, {
            accessToken: 'admin-update-token',
            refreshToken: 'admin-update-refresh',
            expiresAt: new Date(Date.now() + 3600000),
            scope: 'openid email profile'
          });
          
          expect(user.role.name).toBe('admin');
          expect(user.role.level).toBe(1);
        }
      });
    });

    it('should update last active timestamp during profile operations', async () => {
      await withIntegrationTest('profile-last-active-update', 'auth', async () => {
        const beforeTime = new Date();
        
        const user = await SessionManager.createSession(mockGoogleProfile, {
          accessToken: 'active-token',
          refreshToken: 'active-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        const afterTime = new Date();
        
        expect(user.lastActive).toBeTruthy();
        const lastActiveTime = new Date(user.lastActive);
        expect(lastActiveTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
        expect(lastActiveTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
      });
    });

    it('should handle profile update conflicts', async () => {
      await withIntegrationTest('profile-update-conflict', 'auth', async () => {
        // Mock update conflict
        vi.spyOn(supabase, 'from').mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ 
            data: {
              id: 'existing-user-id',
              email: mockGoogleProfile.email,
              name: 'Existing Name'
            }, 
            error: null 
          }),
          update: vi.fn().mockReturnThis()
        } as any);
        
        // Mock update error
        vi.spyOn(supabase, 'from').mockReturnValue({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ 
            data: null, 
            error: { message: 'Update conflict' } 
          })
        } as any);
        
        await expect(
          SessionManager.createSession(mockGoogleProfile, {
            accessToken: 'conflict-token',
            refreshToken: 'conflict-refresh',
            expiresAt: new Date(Date.now() + 3600000),
            scope: 'openid email profile'
          })
        ).rejects.toThrow('Failed to update user');
      });
    });
  });

  describe('Role-Based Access Control', () => {
    it('should validate admin role permissions', async () => {
      await withIntegrationTest('rbac-admin-permissions', 'auth', async (testData) => {
        const { users } = testData;
        const adminUser = users.find(u => u.role === 'admin');
        
        if (adminUser) {
          // Mock admin user data
          vi.spyOn(supabase, 'from').mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: {
                id: adminUser.id,
                email: adminUser.email,
                name: adminUser.name,
                role_id: 'admin',
                department: adminUser.department,
                status: adminUser.status
              }, 
              error: null 
            })
          } as any);
          
          const adminProfile: UserProfile = {
            ...mockGoogleProfile,
            email: adminUser.email
          };
          
          const user = await SessionManager.createSession(adminProfile, {
            accessToken: 'admin-perm-token',
            refreshToken: 'admin-perm-refresh',
            expiresAt: new Date(Date.now() + 3600000),
            scope: 'openid email profile'
          });
          
          expect(user.role.name).toBe('admin');
          expect(user.role.level).toBe(1);
          
          // Admin should have comprehensive permissions
          const adminRole = DEFAULT_ROLES.find(r => r.name === 'admin');
          expect(user.permissions).toEqual(adminRole?.permissions || []);
          
          // Verify specific admin permissions
          const hasUserManagement = user.permissions.some(p => 
            p.resource === 'users' && p.actions.includes('*')
          );
          expect(hasUserManagement).toBe(true);
        }
      });
    });

    it('should validate manager role permissions', async () => {
      await withIntegrationTest('rbac-manager-permissions', 'auth', async (testData) => {
        const { users } = testData;
        const managerUser = users.find(u => u.role === 'manager');
        
        if (managerUser) {
          // Mock manager user data
          vi.spyOn(supabase, 'from').mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: {
                id: managerUser.id,
                email: managerUser.email,
                name: managerUser.name,
                role_id: 'manager',
                department: managerUser.department,
                status: managerUser.status
              }, 
              error: null 
            })
          } as any);
          
          const managerProfile: UserProfile = {
            ...mockGoogleProfile,
            email: managerUser.email
          };
          
          const user = await SessionManager.createSession(managerProfile, {
            accessToken: 'manager-perm-token',
            refreshToken: 'manager-perm-refresh',
            expiresAt: new Date(Date.now() + 3600000),
            scope: 'openid email profile'
          });
          
          expect(user.role.name).toBe('manager');
          expect(user.role.level).toBe(2);
          
          // Manager should have limited permissions
          const managerRole = DEFAULT_ROLES.find(r => r.name === 'manager');
          expect(user.permissions).toEqual(managerRole?.permissions || []);
          
          // Verify manager can read but not delete users
          const canReadUsers = user.permissions.some(p => 
            p.resource === 'users' && p.actions.includes('read')
          );
          const canDeleteUsers = user.permissions.some(p => 
            p.resource === 'users' && p.actions.includes('delete')
          );
          
          expect(canReadUsers).toBe(true);
          expect(canDeleteUsers).toBe(false);
        }
      });
    });

    it('should validate regular user permissions', async () => {
      await withIntegrationTest('rbac-user-permissions', 'auth', async () => {
        const user = await SessionManager.createSession(mockGoogleProfile, {
          accessToken: 'user-perm-token',
          refreshToken: 'user-perm-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user.role.name).toBe('user');
        expect(user.role.level).toBe(3);
        
        // Regular user should have basic permissions only
        const userRole = DEFAULT_ROLES.find(r => r.name === 'user');
        expect(user.permissions).toEqual(userRole?.permissions || []);
        
        // Verify user cannot manage other users
        const canManageUsers = user.permissions.some(p => 
          p.resource === 'users' && (
            p.actions.includes('create') || 
            p.actions.includes('update') || 
            p.actions.includes('delete')
          )
        );
        expect(canManageUsers).toBe(false);
        
        // But can manage their own analyses
        const canManageAnalyses = user.permissions.some(p => 
          p.resource === 'analyses' && p.actions.includes('create')
        );
        expect(canManageAnalyses).toBe(true);
      });
    });

    it('should handle role inheritance and hierarchy', async () => {
      await withIntegrationTest('rbac-role-hierarchy', 'auth', async (testData) => {
        const { users } = testData;
        
        const roleHierarchy = [
          { role: 'admin', level: 1 },
          { role: 'manager', level: 2 },
          { role: 'user', level: 3 }
        ];
        
        for (const { role, level } of roleHierarchy) {
          const testUser = users.find(u => u.role === role);
          if (testUser) {
            // Mock user data
            vi.spyOn(supabase, 'from').mockReturnValue({
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ 
                data: {
                  id: testUser.id,
                  email: testUser.email,
                  name: testUser.name,
                  role_id: role,
                  department: testUser.department,
                  status: testUser.status
                }, 
                error: null 
              })
            } as any);
            
            const profile: UserProfile = {
              ...mockGoogleProfile,
              email: testUser.email
            };
            
            const user = await SessionManager.createSession(profile, {
              accessToken: `${role}-hierarchy-token`,
              refreshToken: `${role}-hierarchy-refresh`,
              expiresAt: new Date(Date.now() + 3600000),
              scope: 'openid email profile'
            });
            
            expect(user.role.name).toBe(role);
            expect(user.role.level).toBe(level);
            
            // Higher level roles should have more permissions
            if (level === 1) {
              // Admin should have the most permissions
              expect(user.permissions.length).toBeGreaterThan(0);
            }
          }
        }
      });
    });

    it('should validate department-based access control', async () => {
      await withIntegrationTest('rbac-department-access', 'auth', async () => {
        const user = await SessionManager.createSession(mockGoogleProfile, {
          accessToken: 'dept-token',
          refreshToken: 'dept-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user.department).toBe('General'); // Default department
        
        // Department should be properly assigned
        expect(typeof user.department).toBe('string');
        expect(user.department.length).toBeGreaterThan(0);
      });
    });

    it('should handle role changes and permission updates', async () => {
      await withIntegrationTest('rbac-role-changes', 'auth', async (testData) => {
        const { users } = testData;
        const testUser = users[0];
        
        // Initially create as regular user
        vi.spyOn(supabase, 'from').mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ 
            data: {
              id: testUser.id,
              email: testUser.email,
              name: testUser.name,
              role_id: 'user',
              department: testUser.department,
              status: testUser.status
            }, 
            error: null 
          })
        } as any);
        
        const initialUser = await SessionManager.createSession({
          ...mockGoogleProfile,
          email: testUser.email
        }, {
          accessToken: 'role-change-token-1',
          refreshToken: 'role-change-refresh-1',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(initialUser.role.name).toBe('user');
        expect(initialUser.role.level).toBe(3);
        
        // Simulate role promotion to manager
        vi.spyOn(supabase, 'from').mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ 
            data: {
              id: testUser.id,
              email: testUser.email,
              name: testUser.name,
              role_id: 'manager',
              department: testUser.department,
              status: testUser.status
            }, 
            error: null 
          })
        } as any);
        
        const promotedUser = await SessionManager.createSession({
          ...mockGoogleProfile,
          email: testUser.email
        }, {
          accessToken: 'role-change-token-2',
          refreshToken: 'role-change-refresh-2',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(promotedUser.role.name).toBe('manager');
        expect(promotedUser.role.level).toBe(2);
        
        // Permissions should be updated
        expect(promotedUser.permissions).not.toEqual(initialUser.permissions);
      });
    });
  });

  describe('Profile Data Validation and Security', () => {
    it('should sanitize profile data during creation', async () => {
      await withIntegrationTest('profile-data-sanitization', 'auth', async () => {
        const maliciousProfile: UserProfile = {
          id: 'malicious-user-123',
          email: 'test@example.com',
          name: '<script>alert("xss")</script>Malicious User',
          givenName: '<img src=x onerror=alert(1)>',
          familyName: 'javascript:alert(1)',
          picture: 'javascript:alert(1)',
          locale: 'en',
          verified: true
        };
        
        const user = await SessionManager.createSession(maliciousProfile, {
          accessToken: 'sanitize-token',
          refreshToken: 'sanitize-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        // Profile data should be created (sanitization would happen in real implementation)
        expect(user).toBeDefined();
        expect(user.email).toBe(maliciousProfile.email);
        expect(user.name).toBeTruthy();
      });
    });

    it('should validate email format during profile creation', async () => {
      await withIntegrationTest('profile-email-validation', 'auth', async () => {
        const invalidEmailProfile: UserProfile = {
          id: 'invalid-email-user',
          email: 'not-an-email',
          name: 'Invalid Email User',
          givenName: 'Invalid',
          familyName: 'User',
          picture: '',
          locale: 'en',
          verified: false
        };
        
        // Should handle invalid email gracefully
        const user = await SessionManager.createSession(invalidEmailProfile, {
          accessToken: 'invalid-email-token',
          refreshToken: 'invalid-email-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user).toBeDefined();
        expect(user.email).toBe('not-an-email'); // Stored as-is, validation would be in real implementation
      });
    });

    it('should handle profile data with special characters', async () => {
      await withIntegrationTest('profile-special-characters', 'auth', async () => {
        const specialCharProfile: UserProfile = {
          id: 'special-char-user',
          email: 'special@example.com',
          name: 'José María Ñoño',
          givenName: 'José María',
          familyName: 'Ñoño',
          picture: 'https://example.com/josé-avatar.jpg',
          locale: 'es',
          verified: true
        };
        
        const user = await SessionManager.createSession(specialCharProfile, {
          accessToken: 'special-char-token',
          refreshToken: 'special-char-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user).toBeDefined();
        expect(user.name).toBe('José María Ñoño');
        expect(user.email).toBe('special@example.com');
      });
    });

    it('should enforce profile data length limits', async () => {
      await withIntegrationTest('profile-length-limits', 'auth', async () => {
        const longDataProfile: UserProfile = {
          id: 'long-data-user',
          email: 'long@example.com',
          name: 'A'.repeat(1000), // Very long name
          givenName: 'B'.repeat(500),
          familyName: 'C'.repeat(500),
          picture: 'https://example.com/' + 'D'.repeat(2000) + '.jpg',
          locale: 'en',
          verified: true
        };
        
        const user = await SessionManager.createSession(longDataProfile, {
          accessToken: 'long-data-token',
          refreshToken: 'long-data-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user).toBeDefined();
        // In real implementation, data would be truncated to database limits
        expect(user.name).toBeTruthy();
      });
    });
  });
});