import { vi } from 'vitest';

export interface TestUser {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  email_confirmed_at: string | null;
  role?: string;
  subscription_status?: 'active' | 'inactive' | 'trialing' | 'past_due' | 'canceled';
  subscription_plan?: 'free' | 'pro' | 'enterprise' | null;
  stripe_customer_id?: string | null;
  trial_end?: string | null;
  usage_quota?: number;
  usage_current?: number;
}

// Realistic email domains for testing
const EMAIL_DOMAINS = [
  'example.com', 'test.org', 'demo.net', 'sample.io', 
  'mock.dev', 'testing.co', 'fixture.app'
];

// Realistic first and last names for generating emails
const FIRST_NAMES = [
  'john', 'jane', 'alex', 'sarah', 'mike', 'emma', 'david', 'lisa',
  'chris', 'anna', 'tom', 'mary', 'james', 'kate', 'paul', 'lucy'
];

const LAST_NAMES = [
  'smith', 'johnson', 'brown', 'davis', 'miller', 'wilson', 'moore',
  'taylor', 'anderson', 'thomas', 'jackson', 'white', 'harris', 'martin'
];

export const createTestUser = (overrides: Partial<TestUser> = {}): TestUser => {
  const now = new Date().toISOString();
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const domain = EMAIL_DOMAINS[Math.floor(Math.random() * EMAIL_DOMAINS.length)];
  const randomSuffix = Math.random().toString(36).substr(2, 3);
  
  const baseUser: TestUser = {
    id: `user-${Math.random().toString(36).substr(2, 9)}`,
    email: `${firstName}.${lastName}.${randomSuffix}@${domain}`,
    created_at: now,
    updated_at: now,
    email_confirmed_at: now,
    role: 'user',
    subscription_status: 'active',
    subscription_plan: 'free',
    stripe_customer_id: `cus_${Math.random().toString(36).substr(2, 14)}`,
    trial_end: null,
    usage_quota: 100,
    usage_current: Math.floor(Math.random() * 50)
  };

  return { ...baseUser, ...overrides };
};

export const createAdminUser = (overrides: Partial<TestUser> = {}): TestUser => {
  return createTestUser({ 
    role: 'admin',
    subscription_plan: 'enterprise',
    usage_quota: 10000,
    ...overrides 
  });
};

export const createUnconfirmedUser = (overrides: Partial<TestUser> = {}): TestUser => {
  return createTestUser({ 
    email_confirmed_at: null,
    subscription_status: 'inactive',
    subscription_plan: null,
    stripe_customer_id: null,
    ...overrides 
  });
};

export const createTrialUser = (overrides: Partial<TestUser> = {}): TestUser => {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14); // 14 days from now
  
  return createTestUser({
    subscription_status: 'trialing',
    subscription_plan: 'pro',
    trial_end: trialEnd.toISOString(),
    usage_quota: 1000,
    ...overrides
  });
};

export const createProUser = (overrides: Partial<TestUser> = {}): TestUser => {
  return createTestUser({
    subscription_plan: 'pro',
    usage_quota: 1000,
    ...overrides
  });
};

export const createExpiredUser = (overrides: Partial<TestUser> = {}): TestUser => {
  return createTestUser({
    subscription_status: 'past_due',
    subscription_plan: 'pro',
    usage_quota: 1000,
    usage_current: 1000, // At quota limit
    ...overrides
  });
};

export const createUserWithUsage = (
  usagePercentage: number, 
  overrides: Partial<TestUser> = {}
): TestUser => {
  const quota = overrides.usage_quota || 1000;
  const current = Math.floor(quota * (usagePercentage / 100));
  
  return createTestUser({
    usage_quota: quota,
    usage_current: current,
    ...overrides
  });
};

// Factory for creating multiple users with different characteristics
export const createTestUsers = (count: number, overrides: Partial<TestUser> = {}): TestUser[] => {
  return Array.from({ length: count }, () => createTestUser(overrides));
};

export const createMixedUsers = (count: number): TestUser[] => {
  const users: TestUser[] = [];
  const userTypes = [
    () => createTestUser(), // Regular user
    () => createProUser(),  // Pro user
    () => createTrialUser(), // Trial user
    () => createAdminUser(), // Admin user
    () => createExpiredUser() // Expired user
  ];
  
  for (let i = 0; i < count; i++) {
    const userType = userTypes[i % userTypes.length];
    users.push(userType());
  }
  
  return users;
};

// Utility functions for specific test scenarios
export const createUserWithSpecificEmail = (email: string, overrides: Partial<TestUser> = {}): TestUser => {
  return createTestUser({ email, ...overrides });
};

export const createUserCreatedDaysAgo = (days: number, overrides: Partial<TestUser> = {}): TestUser => {
  const createdDate = new Date();
  createdDate.setDate(createdDate.getDate() - days);
  
  return createTestUser({
    created_at: createdDate.toISOString(),
    updated_at: createdDate.toISOString(),
    ...overrides
  });
};

export const createUserWithCustomId = (id: string, overrides: Partial<TestUser> = {}): TestUser => {
  return createTestUser({ id, ...overrides });
};