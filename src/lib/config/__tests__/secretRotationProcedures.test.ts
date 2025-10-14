/**
 * Tests for secret rotation procedures functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecretRotationProcedures, type RotationProcedure } from '../secretRotationProcedures.js';
import { SecureSecretStorage } from '../secureSecretStorage.js';

describe('SecretRotationProcedures', () => {
  let storage: SecureSecretStorage;
  let procedures: SecretRotationProcedures;
  const masterPassword = 'test-master-password-with-sufficient-length';

  beforeEach(() => {
    storage = new SecureSecretStorage(masterPassword);
    procedures = new SecretRotationProcedures(storage);
  });

  describe('default procedures', () => {
    it('should have default procedures registered', () => {
      const allProcedures = procedures.listRotationProcedures();
      
      expect(allProcedures.length).toBeGreaterThan(0);
      
      const procedureKeys = allProcedures.map(p => p.secretKey);
      expect(procedureKeys).toContain('auth/jwt-secret');
      expect(procedureKeys).toContain('database/supabase-service-key');
      expect(procedureKeys).toContain('ai/openai-api-key');
      expect(procedureKeys).toContain('auth/google-client-secret');
      expect(procedureKeys).toContain('security/encryption-key');
    });

    it('should have proper procedure structure', () => {
      const jwtProcedure = procedures.getRotationProcedure('auth/jwt-secret');
      
      expect(jwtProcedure).toBeDefined();
      expect(jwtProcedure!.rotationType).toBe('jwt-secret');
      expect(jwtProcedure!.preRotationSteps).toBeInstanceOf(Array);
      expect(jwtProcedure!.postRotationSteps).toBeInstanceOf(Array);
      expect(jwtProcedure!.rollbackSteps).toBeInstanceOf(Array);
      expect(jwtProcedure!.validationSteps).toBeInstanceOf(Array);
      expect(jwtProcedure!.dependencies).toBeInstanceOf(Array);
    });
  });

  describe('custom procedures', () => {
    it('should register custom procedures', () => {
      const customProcedure: RotationProcedure = {
        secretKey: 'custom/test-secret',
        rotationType: 'api-key',
        preRotationSteps: ['Validate current key'],
        postRotationSteps: ['Update configuration'],
        rollbackSteps: ['Restore previous key'],
        validationSteps: ['Test API call'],
        dependencies: []
      };

      procedures.registerProcedure(customProcedure);
      
      const retrieved = procedures.getRotationProcedure('custom/test-secret');
      expect(retrieved).toEqual(customProcedure);
    });

    it('should override existing procedures', () => {
      const originalProcedure = procedures.getRotationProcedure('auth/jwt-secret');
      expect(originalProcedure).toBeDefined();

      const customProcedure: RotationProcedure = {
        secretKey: 'auth/jwt-secret',
        rotationType: 'jwt-secret',
        preRotationSteps: ['Custom pre-step'],
        postRotationSteps: ['Custom post-step'],
        rollbackSteps: ['Custom rollback'],
        validationSteps: ['Custom validation'],
        dependencies: []
      };

      procedures.registerProcedure(customProcedure);
      
      const updated = procedures.getRotationProcedure('auth/jwt-secret');
      expect(updated!.preRotationSteps).toEqual(['Custom pre-step']);
    });
  });

  describe('secret rotation', () => {
    beforeEach(async () => {
      // Set up a test secret
      await storage.setSecret('auth/jwt-secret', 'original-jwt-secret-value', 'admin');
    });

    it('should rotate a secret successfully', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const result = await procedures.rotateSecret('auth/jwt-secret', 'admin');
      
      expect(result.success).toBe(true);
      expect(result.secretKey).toBe('auth/jwt-secret');
      expect(result.oldSecretHash).toBeDefined();
      expect(result.newSecretHash).toBeDefined();
      expect(result.oldSecretHash).not.toBe(result.newSecretHash);
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
      
      // Verify the secret was actually updated
      const newSecret = await storage.getSecret('auth/jwt-secret', 'admin');
      expect(newSecret).not.toBe('original-jwt-secret-value');
      expect(newSecret).toBeDefined();
      
      consoleSpy.mockRestore();
    });

    it('should fail rotation for non-existent procedure', async () => {
      await expect(procedures.rotateSecret('non-existent/secret', 'admin'))
        .rejects.toThrow('No rotation procedure found');
    });

    it('should track rotation history', async () => {
      await procedures.rotateSecret('auth/jwt-secret', 'admin');
      
      const history = procedures.getRotationHistory();
      expect(history).toHaveLength(1);
      expect(history[0].secretKey).toBe('auth/jwt-secret');
      expect(history[0].success).toBe(true);
    });

    it('should filter rotation history by secret key', async () => {
      await storage.setSecret('ai/openai-api-key', 'original-openai-key', 'admin');
      
      await procedures.rotateSecret('auth/jwt-secret', 'admin');
      await procedures.rotateSecret('ai/openai-api-key', 'admin');
      
      const jwtHistory = procedures.getRotationHistory('auth/jwt-secret');
      expect(jwtHistory).toHaveLength(1);
      expect(jwtHistory[0].secretKey).toBe('auth/jwt-secret');
      
      const allHistory = procedures.getRotationHistory();
      expect(allHistory).toHaveLength(2);
    });
  });

  describe('rotation validation', () => {
    it('should validate rotation readiness for existing secret', async () => {
      await storage.setSecret('auth/jwt-secret', 'test-jwt-secret', 'admin');
      
      const validation = await procedures.validateRotationReadiness('auth/jwt-secret');
      
      expect(validation.ready).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should detect missing secret', async () => {
      const validation = await procedures.validateRotationReadiness('auth/jwt-secret');
      
      expect(validation.ready).toBe(false);
      expect(validation.issues).toContain('Secret does not exist');
    });

    it('should detect missing procedure', async () => {
      const validation = await procedures.validateRotationReadiness('unknown/secret');
      
      expect(validation.ready).toBe(false);
      expect(validation.issues).toContain('No rotation procedure defined');
    });

    it('should detect missing dependencies', async () => {
      // Create a procedure with dependencies
      const procedureWithDeps: RotationProcedure = {
        secretKey: 'test/dependent-secret',
        rotationType: 'api-key',
        preRotationSteps: [],
        postRotationSteps: [],
        rollbackSteps: [],
        validationSteps: [],
        dependencies: ['dependency/secret']
      };

      procedures.registerProcedure(procedureWithDeps);
      await storage.setSecret('test/dependent-secret', 'test-value', 'admin');
      
      const validation = await procedures.validateRotationReadiness('test/dependent-secret');
      
      expect(validation.ready).toBe(false);
      expect(validation.issues.some(issue => 
        issue.includes('Dependency secret missing: dependency/secret')
      )).toBe(true);
    });
  });

  describe('rotation planning', () => {
    beforeEach(async () => {
      // Set up test secrets
      await storage.setSecret('auth/jwt-secret', 'jwt-value', 'admin');
      await storage.setSecret('ai/openai-api-key', 'openai-value', 'admin');
      await storage.setSecret('database/supabase-service-key', 'db-value', 'admin');
    });

    it('should create rotation plan for multiple secrets', async () => {
      const secretKeys = ['auth/jwt-secret', 'ai/openai-api-key', 'database/supabase-service-key'];
      
      const plan = await procedures.createRotationPlan(secretKeys);
      
      expect(plan.plan).toHaveLength(3);
      expect(plan.totalEstimatedDuration).toBeGreaterThan(0);
      
      // Check that each secret has proper plan entry
      const jwtPlan = plan.plan.find(p => p.secretKey === 'auth/jwt-secret');
      expect(jwtPlan).toBeDefined();
      expect(jwtPlan!.order).toBeGreaterThan(0);
      expect(jwtPlan!.estimatedDuration).toBeGreaterThan(0);
    });

    it('should warn about missing procedures in plan', async () => {
      const secretKeys = ['auth/jwt-secret', 'unknown/secret'];
      
      const plan = await procedures.createRotationPlan(secretKeys);
      
      expect(plan.plan).toHaveLength(1); // Only the valid one
      expect(plan.warnings).toContain('No procedure found for unknown/secret');
    });

    it('should estimate reasonable durations', async () => {
      const secretKeys = ['auth/jwt-secret'];
      
      const plan = await procedures.createRotationPlan(secretKeys);
      
      expect(plan.totalEstimatedDuration).toBeGreaterThan(30000); // At least 30 seconds
      expect(plan.totalEstimatedDuration).toBeLessThan(600000); // Less than 10 minutes
    });
  });

  describe('secret generation', () => {
    it('should generate appropriate secrets for different types', async () => {
      // Test JWT secret generation
      await procedures.rotateSecret('auth/jwt-secret', 'admin');
      const jwtSecret = await storage.getSecret('auth/jwt-secret', 'admin');
      expect(jwtSecret).toBeDefined();
      expect(jwtSecret!.length).toBeGreaterThan(32); // Should be reasonably long

      // Test API key generation
      await procedures.rotateSecret('ai/openai-api-key', 'admin');
      const apiKey = await storage.getSecret('ai/openai-api-key', 'admin');
      expect(apiKey).toBeDefined();
      expect(apiKey!.startsWith('sk-')).toBe(true); // Should have API key format

      // Test OAuth secret generation
      await procedures.rotateSecret('auth/google-client-secret', 'admin');
      const oauthSecret = await storage.getSecret('auth/google-client-secret', 'admin');
      expect(oauthSecret).toBeDefined();
      expect(oauthSecret!.startsWith('GOCSPX-')).toBe(true); // Should have OAuth format
    });

    it('should generate different secrets on each rotation', async () => {
      await procedures.rotateSecret('auth/jwt-secret', 'admin');
      const secret1 = await storage.getSecret('auth/jwt-secret', 'admin');
      
      await procedures.rotateSecret('auth/jwt-secret', 'admin');
      const secret2 = await storage.getSecret('auth/jwt-secret', 'admin');
      
      expect(secret1).not.toBe(secret2);
    });
  });

  describe('error handling and rollback', () => {
    it('should handle rotation failures gracefully', async () => {
      // Mock a step that will fail
      const originalExecuteStep = (procedures as any).executeStep;
      (procedures as any).executeStep = vi.fn().mockRejectedValue(new Error('Simulated failure'));
      
      await expect(procedures.rotateSecret('auth/jwt-secret', 'admin'))
        .rejects.toThrow('Secret rotation failed');
      
      const history = procedures.getRotationHistory();
      expect(history).toHaveLength(1);
      expect(history[0].success).toBe(false);
      expect(history[0].rollbackPerformed).toBe(true);
      
      // Restore original method
      (procedures as any).executeStep = originalExecuteStep;
    });

    it('should track failed steps in rotation result', async () => {
      // Mock a step that will fail
      (procedures as any).executeStep = vi.fn()
        .mockResolvedValueOnce(undefined) // First step succeeds
        .mockRejectedValueOnce(new Error('Step failure')); // Second step fails
      
      try {
        await procedures.rotateSecret('auth/jwt-secret', 'admin');
      } catch {
        // Expected to fail
      }
      
      const history = procedures.getRotationHistory();
      const result = history[0];
      
      expect(result.steps.length).toBeGreaterThan(0);
      const failedStep = result.steps.find(step => !step.success);
      expect(failedStep).toBeDefined();
      expect(failedStep!.error).toBeDefined();
    });
  });
});