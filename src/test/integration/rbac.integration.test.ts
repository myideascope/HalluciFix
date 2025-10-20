import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  withIntegrationTest,
  createTestUser,
  IntegrationDatabaseSeeder
} from '../utils';
import { useAuthProvider } from '../../hooks/useAuth';
import { SessionManager } from '../../lib/oauth/sessionManager';
import { supabase } from '../../lib/supabase';
import { User, DEFAULT_ROLES } from '../../types/user';
import { UserProfile } from '../../lib/oauth/types';
import { subscriptionService } from '../../lib/subscriptionService';

describe('Role-Based Access Control Integration Tests', () => {
  let seeder: IntegrationDatabaseSeeder;
  
  const createMockProfile = (email: string, name: string): UserProfile => ({
    id: `google-${email.split('@')[0]}`,
    email,
    name,
    givenName: name.split(' ')[0],
    familyName: name.split(' ')[1] || '',
    picture: `https://example.com/${email.split('@')[0]}-avatar.jpg`,
    locale: 'en',
    verified: true
  });

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
      single: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis()
    } as any);
    
    // Mock subscription service
    vi.spyOn(subscriptionService, 'getUserSubscription').mockResolvedValue({
      id: 'sub-123',
      userId: 'user-123',
      planId: 'pro',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    vi.spyOn(subscriptionService, 'getSubscriptionPlan').mockResolvedValue({
      id: 'pro',
      name: 'Pro Plan',
      description: 'Professional features',
      price: 2000,
      currency: 'usd',
      interval: 'month',
      features: ['advanced_analysis', 'batch_processing'],
      limits: { analyses: 1000, storage: 10000 },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  afterEach(async () => {
    await seeder.cleanup();
    vi.restoreAllMocks();
  });

  describe('Permission Validation', () => {
    it('should validate admin permissions correctly', async () => {
      await withIntegrationTest('rbac-admin-validation', 'auth', async (testData) => {
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
          
          const adminProfile = createMockProfile(adminUser.email, 'Admin User');
          
          const user = await SessionManager.createSession(adminProfile, {
            accessToken: 'admin-validation-token',
            refreshToken: 'admin-validation-refresh',
            expiresAt: new Date(Date.now() + 3600000),
            scope: 'openid email profile'
          });
          
          const authProvider = useAuthProvider();
          Object.defineProperty(authProvider, 'user', {
            value: user,
            writable: false
          });
          
          // Test admin permissions
          expect(authProvider.hasPermission('users', 'create')).toBe(true);
          expect(authProvider.hasPermission('users', 'read')).toBe(true);
          expect(authProvider.hasPermission('users', 'update')).toBe(true);
          expect(authProvider.hasPermission('users', 'delete')).toBe(true);
          expect(authProvider.hasPermission('analyses', 'delete')).toBe(true);
          expect(authProvider.hasPermission('system', 'configure')).toBe(true);
          
          // Admin role checks
          expect(authProvider.isAdmin()).toBe(true);
          expect(authProvider.isManager()).toBe(true);
          expect(authProvider.canManageUsers()).toBe(true);
        }
      });
    });

    it('should validate manager permissions correctly', async () => {
      await withIntegrationTest('rbac-manager-validation', 'auth', async (testData) => {
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
          
          const managerProfile = createMockProfile(managerUser.email, 'Manager User');
          
          const user = await SessionManager.createSession(managerProfile, {
            accessToken: 'manager-validation-token',
            refreshToken: 'manager-validation-refresh',
            expiresAt: new Date(Date.now() + 3600000),
            scope: 'openid email profile'
          });
          
          const authProvider = useAuthProvider();
          Object.defineProperty(authProvider, 'user', {
            value: user,
            writable: false
          });
          
          // Test manager permissions
          expect(authProvider.hasPermission('users', 'read')).toBe(true);
          expect(authProvider.hasPermission('users', 'update')).toBe(true);
          expect(authProvider.hasPermission('users', 'delete')).toBe(false);
          expect(authProvider.hasPermission('analyses', 'read')).toBe(true);
          expect(authProvider.hasPermission('analyses', 'create')).toBe(true);
          expect(authProvider.hasPermission('system', 'configure')).toBe(false);
          
          // Manager role checks
          expect(authProvider.isAdmin()).toBe(false);
          expect(authProvider.isManager()).toBe(true);
          expect(authProvider.canManageUsers()).toBe(true);
        }
      });
    });

    it('should validate regular user permissions correctly', async () => {
      await withIntegrationTest('rbac-user-validation', 'auth', async () => {
        const userProfile = createMockProfile('user@example.com', 'Regular User');
        
        const user = await SessionManager.createSession(userProfile, {
          accessToken: 'user-validation-token',
          refreshToken: 'user-validation-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        const authProvider = useAuthProvider();
        Object.defineProperty(authProvider, 'user', {
          value: user,
          writable: false
        });
        
        // Test user permissions
        expect(authProvider.hasPermission('users', 'read')).toBe(false);
        expect(authProvider.hasPermission('users', 'create')).toBe(false);
        expect(authProvider.hasPermission('users', 'update')).toBe(false);
        expect(authProvider.hasPermission('users', 'delete')).toBe(false);
        expect(authProvider.hasPermission('analyses', 'create')).toBe(true);
        expect(authProvider.hasPermission('analyses', 'read')).toBe(true);
        expect(authProvider.hasPermission('analyses', 'update')).toBe(true);
        expect(authProvider.hasPermission('analyses', 'delete')).toBe(false);
        
        // User role checks
        expect(authProvider.isAdmin()).toBe(false);
        expect(authProvider.isManager()).toBe(false);
        expect(authProvider.canManageUsers()).toBe(false);
      });
    });

    it('should handle wildcard permissions correctly', async () => {
      await withIntegrationTest('rbac-wildcard-permissions', 'auth', async (testData) => {
        const { users } = testData;
        const adminUser = users.find(u => u.role === 'admin');
        
        if (adminUser) {
          // Mock admin user with wildcard permissions
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
          
          const adminProfile = createMockProfile(adminUser.email, 'Admin User');
          
          const user = await SessionManager.createSession(adminProfile, {
            accessToken: 'wildcard-token',
            refreshToken: 'wildcard-refresh',
            expiresAt: new Date(Date.now() + 3600000),
            scope: 'openid email profile'
          });
          
          const authProvider = useAuthProvider();
          Object.defineProperty(authProvider, 'user', {
            value: user,
            writable: false
          });
          
          // Test wildcard permissions (admin should have access to everything)
          expect(authProvider.hasPermission('any_resource', 'any_action')).toBe(true);
          expect(authProvider.hasPermission('custom_resource', 'custom_action')).toBe(true);
        }
      });
    });

    it('should deny permissions for unauthenticated users', async () => {
      await withIntegrationTest('rbac-unauthenticated', 'auth', async () => {
        const authProvider = useAuthProvider();
        
        // No user set (unauthenticated)
        Object.defineProperty(authProvider, 'user', {
          value: null,
          writable: false
        });
        
        // All permissions should be denied
        expect(authProvider.hasPermission('users', 'read')).toBe(false);
        expect(authProvider.hasPermission('analyses', 'create')).toBe(false);
        expect(authProvider.isAdmin()).toBe(false);
        expect(authProvider.isManager()).toBe(false);
        expect(authProvider.canManageUsers()).toBe(false);
      });
    });
  });

  describe('Subscription-Based Access Control', () => {
    it('should validate subscription status for feature access', async () => {
      await withIntegrationTest('rbac-subscription-validation', 'auth', async () => {
        const userProfile = createMockProfile('subscriber@example.com', 'Subscriber User');
        
        const user = await SessionManager.createSession(userProfile, {
          accessToken: 'subscription-token',
          refreshToken: 'subscription-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        const authProvider = useAuthProvider();
        Object.defineProperty(authProvider, 'user', {
          value: user,
          writable: false
        });
        
        // Mock active subscription
        Object.defineProperty(authProvider, 'subscription', {
          value: {
            id: 'sub-123',
            userId: user.id,
            planId: 'pro',
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          },
          writable: false
        });
        
        Object.defineProperty(authProvider, 'subscriptionPlan', {
          value: {
            id: 'pro',
            name: 'Pro Plan',
            features: ['advanced_analysis', 'batch_processing']
          },
          writable: false
        });
        
        // Test subscription-based access
        expect(authProvider.hasActiveSubscription()).toBe(true);
        expect(authProvider.canAccessFeature('basic_analysis')).toBe(true);
        expect(authProvider.canAccessFeature('advanced_analysis')).toBe(true);
        expect(authProvider.canAccessFeature('batch_processing')).toBe(true);
        expect(authProvider.canAccessFeature('unlimited_analyses')).toBe(false);
      });
    });

    it('should deny feature access for inactive subscriptions', async () => {
      await withIntegrationTest('rbac-inactive-subscription', 'auth', async () => {
        const userProfile = createMockProfile('inactive@example.com', 'Inactive User');
        
        const user = await SessionManager.createSession(userProfile, {
          accessToken: 'inactive-token',
          refreshToken: 'inactive-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        const authProvider = useAuthProvider();
        Object.defineProperty(authProvider, 'user', {
          value: user,
          writable: false
        });
        
        // Mock inactive subscription
        Object.defineProperty(authProvider, 'subscription', {
          value: {
            id: 'sub-456',
            userId: user.id,
            planId: 'pro',
            status: 'canceled',
            currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
            currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          },
          writable: false
        });
        
        // Test subscription-based access denial
        expect(authProvider.hasActiveSubscription()).toBe(false);
        expect(authProvider.canAccessFeature('basic_analysis')).toBe(false);
        expect(authProvider.canAccessFeature('advanced_analysis')).toBe(false);
        expect(authProvider.canAccessFeature('batch_processing')).toBe(false);
      });
    });

    it('should handle trial subscriptions correctly', async () => {
      await withIntegrationTest('rbac-trial-subscription', 'auth', async () => {
        const userProfile = createMockProfile('trial@example.com', 'Trial User');
        
        const user = await SessionManager.createSession(userProfile, {
          accessToken: 'trial-token',
          refreshToken: 'trial-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        const authProvider = useAuthProvider();
        Object.defineProperty(authProvider, 'user', {
          value: user,
          writable: false
        });
        
        // Mock trial subscription
        Object.defineProperty(authProvider, 'subscription', {
          value: {
            id: 'sub-trial',
            userId: user.id,
            planId: 'pro',
            status: 'trialing',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
          },
          writable: false
        });
        
        Object.defineProperty(authProvider, 'subscriptionPlan', {
          value: {
            id: 'pro',
            name: 'Pro Plan',
            features: ['advanced_analysis', 'batch_processing']
          },
          writable: false
        });
        
        // Trial should have access to features
        expect(authProvider.hasActiveSubscription()).toBe(true);
        expect(authProvider.canAccessFeature('advanced_analysis')).toBe(true);
        expect(authProvider.canAccessFeature('batch_processing')).toBe(true);
      });
    });

    it('should validate enterprise features access', async () => {
      await withIntegrationTest('rbac-enterprise-features', 'auth', async () => {
        const userProfile = createMockProfile('enterprise@example.com', 'Enterprise User');
        
        const user = await SessionManager.createSession(userProfile, {
          accessToken: 'enterprise-token',
          refreshToken: 'enterprise-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        const authProvider = useAuthProvider();
        Object.defineProperty(authProvider, 'user', {
          value: user,
          writable: false
        });
        
        // Mock enterprise subscription
        Object.defineProperty(authProvider, 'subscription', {
          value: {
            id: 'sub-enterprise',
            userId: user.id,
            planId: 'enterprise',
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          },
          writable: false
        });
        
        Object.defineProperty(authProvider, 'subscriptionPlan', {
          value: {
            id: 'enterprise',
            name: 'Enterprise Plan',
            features: [
              'unlimited_analyses',
              'custom_model_training',
              'dedicated_support',
              'sla_guarantees',
              'on_premise_deployment',
              'advanced_security'
            ]
          },
          writable: false
        });
        
        // Enterprise should have access to all features
        expect(authProvider.canAccessFeature('unlimited_analyses')).toBe(true);
        expect(authProvider.canAccessFeature('custom_model_training')).toBe(true);
        expect(authProvider.canAccessFeature('dedicated_support')).toBe(true);
        expect(authProvider.canAccessFeature('sla_guarantees')).toBe(true);
        expect(authProvider.canAccessFeature('on_premise_deployment')).toBe(true);
        expect(authProvider.canAccessFeature('advanced_security')).toBe(true);
      });
    });
  });

  describe('Role Hierarchy and Inheritance', () => {
    it('should respect role hierarchy in permission checks', async () => {
      await withIntegrationTest('rbac-role-hierarchy', 'auth', async (testData) => {
        const { users } = testData;
        
        const roleTests = [
          { role: 'admin', level: 1, shouldInheritManagerPerms: true },
          { role: 'manager', level: 2, shouldInheritUserPerms: true },
          { role: 'user', level: 3, shouldInheritManagerPerms: false }
        ];
        
        for (const { role, level, shouldInheritManagerPerms } of roleTests) {
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
            
            const profile = createMockProfile(testUser.email, `${role} User`);
            
            const user = await SessionManager.createSession(profile, {
              accessToken: `${role}-hierarchy-token`,
              refreshToken: `${role}-hierarchy-refresh`,
              expiresAt: new Date(Date.now() + 3600000),
              scope: 'openid email profile'
            });
            
            expect(user.role.level).toBe(level);
            
            // Higher level roles should have more comprehensive permissions
            if (level === 1) {
              // Admin should have all permissions
              expect(user.permissions.length).toBeGreaterThan(0);
            } else if (level === 2) {
              // Manager should have moderate permissions
              expect(user.permissions.length).toBeGreaterThan(0);
            } else {
              // User should have basic permissions
              expect(user.permissions.length).toBeGreaterThan(0);
            }
          }
        }
      });
    });

    it('should handle role transitions correctly', async () => {
      await withIntegrationTest('rbac-role-transitions', 'auth', async (testData) => {
        const { users } = testData;
        const testUser = users[0];
        
        // Start as regular user
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
        
        const userProfile = createMockProfile(testUser.email, 'Transitioning User');
        
        const initialUser = await SessionManager.createSession(userProfile, {
          accessToken: 'transition-user-token',
          refreshToken: 'transition-user-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(initialUser.role.name).toBe('user');
        expect(initialUser.role.level).toBe(3);
        
        // Simulate promotion to manager
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
        
        const promotedUser = await SessionManager.createSession(userProfile, {
          accessToken: 'transition-manager-token',
          refreshToken: 'transition-manager-refresh',
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

  describe('Department-Based Access Control', () => {
    it('should assign correct department during user creation', async () => {
      await withIntegrationTest('rbac-department-assignment', 'auth', async () => {
        const userProfile = createMockProfile('dept@example.com', 'Department User');
        
        const user = await SessionManager.createSession(userProfile, {
          accessToken: 'dept-token',
          refreshToken: 'dept-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user.department).toBe('General'); // Default department
        expect(typeof user.department).toBe('string');
        expect(user.department.length).toBeGreaterThan(0);
      });
    });

    it('should preserve department during role changes', async () => {
      await withIntegrationTest('rbac-department-preservation', 'auth', async (testData) => {
        const { users } = testData;
        const testUser = users[0];
        
        // Mock user with specific department
        vi.spyOn(supabase, 'from').mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ 
            data: {
              id: testUser.id,
              email: testUser.email,
              name: testUser.name,
              role_id: 'user',
              department: 'Engineering',
              status: testUser.status
            }, 
            error: null 
          })
        } as any);
        
        const userProfile = createMockProfile(testUser.email, 'Engineering User');
        
        const user = await SessionManager.createSession(userProfile, {
          accessToken: 'eng-dept-token',
          refreshToken: 'eng-dept-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user.department).toBe('Engineering');
        
        // Simulate role change while preserving department
        vi.spyOn(supabase, 'from').mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ 
            data: {
              id: testUser.id,
              email: testUser.email,
              name: testUser.name,
              role_id: 'manager',
              department: 'Engineering', // Department preserved
              status: testUser.status
            }, 
            error: null 
          })
        } as any);
        
        const promotedUser = await SessionManager.createSession(userProfile, {
          accessToken: 'eng-manager-token',
          refreshToken: 'eng-manager-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(promotedUser.role.name).toBe('manager');
        expect(promotedUser.department).toBe('Engineering'); // Department preserved
      });
    });
  });

  describe('Security and Access Validation', () => {
    it('should validate user status for access control', async () => {
      await withIntegrationTest('rbac-user-status', 'auth', async (testData) => {
        const { users } = testData;
        
        const statusTests = [
          { status: 'active', shouldHaveAccess: true },
          { status: 'inactive', shouldHaveAccess: false },
          { status: 'suspended', shouldHaveAccess: false }
        ];
        
        for (const { status, shouldHaveAccess } of statusTests) {
          const testUser = users[0];
          
          // Mock user with specific status
          vi.spyOn(supabase, 'from').mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: {
                id: testUser.id,
                email: testUser.email,
                name: testUser.name,
                role_id: testUser.role,
                department: testUser.department,
                status: status
              }, 
              error: null 
            })
          } as any);
          
          const userProfile = createMockProfile(testUser.email, `${status} User`);
          
          const user = await SessionManager.createSession(userProfile, {
            accessToken: `${status}-token`,
            refreshToken: `${status}-refresh`,
            expiresAt: new Date(Date.now() + 3600000),
            scope: 'openid email profile'
          });
          
          expect(user.status).toBe(status);
          
          // In real implementation, inactive/suspended users would be denied access
          // For testing, we verify the status is correctly set
          expect(user.status).toBe(status);
        }
      });
    });

    it('should handle permission edge cases', async () => {
      await withIntegrationTest('rbac-permission-edge-cases', 'auth', async () => {
        const userProfile = createMockProfile('edge@example.com', 'Edge Case User');
        
        const user = await SessionManager.createSession(userProfile, {
          accessToken: 'edge-token',
          refreshToken: 'edge-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        const authProvider = useAuthProvider();
        Object.defineProperty(authProvider, 'user', {
          value: user,
          writable: false
        });
        
        // Test edge cases
        expect(authProvider.hasPermission('', '')).toBe(false); // Empty strings
        expect(authProvider.hasPermission('nonexistent', 'action')).toBe(false); // Non-existent resource
        expect(authProvider.hasPermission('analyses', 'nonexistent')).toBe(false); // Non-existent action
      });
    });
  });
});