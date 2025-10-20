import { vi } from 'vitest';

export interface TestUser {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  email_confirmed_at: string | null;
  role?: string;
}

export const createTestUser = (overrides: Partial<TestUser> = {}): TestUser => {
  const now = new Date().toISOString();
  const baseUser: TestUser = {
    id: `user-${Math.random().toString(36).substr(2, 9)}`,
    email: `test-${Math.random().toString(36).substr(2, 5)}@example.com`,
    created_at: now,
    updated_at: now,
    email_confirmed_at: now,
    role: 'user'
  };

  return { ...baseUser, ...overrides };
};

export const createAdminUser = (overrides: Partial<TestUser> = {}): TestUser => {
  return createTestUser({ role: 'admin', ...overrides });
};

export const createUnconfirmedUser = (overrides: Partial<TestUser> = {}): TestUser => {
  return createTestUser({ email_confirmed_at: null, ...overrides });
};

// Factory for creating multiple users
export const createTestUsers = (count: number, overrides: Partial<TestUser> = {}): TestUser[] => {
  return Array.from({ length: count }, () => createTestUser(overrides));
};