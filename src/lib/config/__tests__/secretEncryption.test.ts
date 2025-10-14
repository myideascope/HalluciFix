/**
 * Tests for secret encryption and rotation functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  SecretEncryptionService, 
  SecretRotationManager,
  type SecretRotationConfig 
} from '../secretEncryption.js';

describe('SecretEncryptionService', () => {
  let encryptionService: SecretEncryptionService;
  const masterPassword = 'test-master-password-with-sufficient-length';

  beforeEach(() => {
    encryptionService = new SecretEncryptionService(masterPassword);
  });

  afterEach(() => {
    encryptionService.clearAccessLogs();
  });

  describe('encryption and decryption', () => {
    it('should encrypt and decrypt secrets correctly', async () => {
      const plaintext = 'my-secret-value';
      const secretKey = 'test/secret';

      const encrypted = await encryptionService.encryptSecret(plaintext, secretKey);
      expect(encrypted).toBeDefined();
      expect(encrypted.encryptedData).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.salt).toBeDefined();
      expect(encrypted.algorithm).toBe('aes-256-cbc');

      const decrypted = await encryptionService.decryptSecret(encrypted, secretKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should fail to decrypt with wrong secret key', async () => {
      const plaintext = 'my-secret-value';
      const secretKey = 'test/secret';
      const wrongKey = 'wrong/key';

      const encrypted = await encryptionService.encryptSecret(plaintext, secretKey);
      
      await expect(
        encryptionService.decryptSecret(encrypted, wrongKey)
      ).rejects.toThrow('Failed to decrypt secret');
    });

    it('should fail without master key', async () => {
      const serviceWithoutKey = new SecretEncryptionService();
      
      await expect(
        serviceWithoutKey.encryptSecret('test', 'key')
      ).rejects.toThrow('Master key not set');
    });

    it('should handle different secret values', async () => {
      const testCases = [
        'simple-secret',
        'complex-secret-with-special-chars!@#$%^&*()',
        'very-long-secret-' + 'x'.repeat(1000),
        '123456789',
        'unicode-secret-🔐🔑'
      ];

      for (const secret of testCases) {
        const encrypted = await encryptionService.encryptSecret(secret, 'test-key');
        const decrypted = await encryptionService.decryptSecret(encrypted, 'test-key');
        expect(decrypted).toBe(secret);
      }
    });
  });

  describe('secret validation', () => {
    it('should validate strong secrets', () => {
      const strongSecret = 'MyStr0ng!P@ssw0rd#2024$';
      const validation = encryptionService.validateSecretStrength(strongSecret);
      
      expect(validation.isValid).toBe(true);
      expect(validation.score).toBeGreaterThan(70);
      expect(validation.issues).toHaveLength(0);
    });

    it('should reject weak secrets', () => {
      const weakSecret = '123';
      const validation = encryptionService.validateSecretStrength(weakSecret);
      
      expect(validation.isValid).toBe(false);
      expect(validation.score).toBeLessThan(70);
      expect(validation.issues.length).toBeGreaterThan(0);
    });

    it('should detect common patterns', () => {
      const commonPatterns = ['password123', 'admin', '123456789', 'qwerty'];
      
      for (const pattern of commonPatterns) {
        const validation = encryptionService.validateSecretStrength(pattern);
        expect(validation.isValid).toBe(false);
        expect(validation.issues.some(issue => 
          issue.includes('common patterns') || issue.includes('at least')
        )).toBe(true);
      }
    });

    it('should detect repeated characters', () => {
      const repeatedSecret = 'aaaaaaaaaa';
      const validation = encryptionService.validateSecretStrength(repeatedSecret);
      
      expect(validation.isValid).toBe(false);
      expect(validation.issues.some(issue => 
        issue.includes('repeated character') || issue.includes('entropy')
      )).toBe(true);
    });
  });

  describe('secret generation', () => {
    it('should generate secrets of correct length', () => {
      const lengths = [16, 32, 64];
      
      for (const length of lengths) {
        const secret = encryptionService.generateSecret(length);
        expect(secret).toHaveLength(length); // Direct character length
      }
    });

    it('should generate different secrets each time', () => {
      const secret1 = encryptionService.generateSecret();
      const secret2 = encryptionService.generateSecret();
      
      expect(secret1).not.toBe(secret2);
    });

    it('should generate strong secrets', () => {
      const secret = encryptionService.generateSecret(32);
      const validation = encryptionService.validateSecretStrength(secret);
      
      expect(validation.score).toBeGreaterThan(70); // Generated secrets should be strong
      expect(validation.isValid).toBe(true);
    });
  });

  describe('rotation detection', () => {
    it('should detect when secrets need rotation', async () => {
      const rotationConfig: SecretRotationConfig = {
        rotationIntervalMs: 1000, // 1 second for testing
        maxAge: 5000,
        notifyBeforeExpiry: 500,
        autoRotate: false
      };

      const encrypted = await encryptionService.encryptSecret('test-secret', 'test-key');
      
      // Should not need rotation immediately
      expect(encryptionService.needsRotation(encrypted, rotationConfig)).toBe(false);
      
      // Wait for rotation interval
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should need rotation now
      expect(encryptionService.needsRotation(encrypted, rotationConfig)).toBe(true);
    });

    it('should detect approaching expiry', async () => {
      const rotationConfig: SecretRotationConfig = {
        rotationIntervalMs: 2000,
        maxAge: 5000,
        notifyBeforeExpiry: 1500,
        autoRotate: false
      };

      const encrypted = await encryptionService.encryptSecret('test-secret', 'test-key');
      
      // Should not be approaching expiry immediately
      expect(encryptionService.isApproachingExpiry(encrypted, rotationConfig)).toBe(false);
      
      // Wait for notification threshold
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Should be approaching expiry now
      expect(encryptionService.isApproachingExpiry(encrypted, rotationConfig)).toBe(true);
    });
  });

  describe('access logging', () => {
    it('should log encryption operations', async () => {
      await encryptionService.encryptSecret('test-secret', 'test-key');
      
      const logs = encryptionService.getAccessLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].operation).toBe('write');
      expect(logs[0].secretKey).toBe('test-key');
      expect(logs[0].success).toBe(true);
    });

    it('should log decryption operations', async () => {
      const encrypted = await encryptionService.encryptSecret('test-secret', 'test-key');
      await encryptionService.decryptSecret(encrypted, 'test-key');
      
      const logs = encryptionService.getAccessLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].operation).toBe('read'); // Most recent first
      expect(logs[1].operation).toBe('write');
    });

    it('should log failed operations', async () => {
      try {
        await encryptionService.decryptSecret({
          encryptedData: 'invalid',
          iv: 'invalid',
          salt: 'invalid',
          algorithm: 'aes-256-cbc',
          keyDerivation: 'pbkdf2',
          timestamp: Date.now(),
          version: 1
        }, 'test-key');
      } catch {
        // Expected to fail
      }
      
      const logs = encryptionService.getAccessLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].success).toBe(false);
      expect(logs[0].error).toBeDefined();
    });

    it('should filter logs by secret key', async () => {
      await encryptionService.encryptSecret('secret1', 'key1');
      await encryptionService.encryptSecret('secret2', 'key2');
      
      const key1Logs = encryptionService.getAccessLogs('key1');
      expect(key1Logs).toHaveLength(1);
      expect(key1Logs[0].secretKey).toBe('key1');
    });

    it('should filter logs by timestamp', async () => {
      const beforeTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await encryptionService.encryptSecret('secret1', 'key1');
      
      const recentLogs = encryptionService.getAccessLogs(undefined, beforeTime);
      expect(recentLogs).toHaveLength(1);
    });
  });

  describe('export and import', () => {
    it('should export and import secrets', async () => {
      const secrets = {
        'key1': await encryptionService.encryptSecret('secret1', 'key1'),
        'key2': await encryptionService.encryptSecret('secret2', 'key2')
      };

      const exported = encryptionService.exportSecrets(secrets);
      expect(exported).toBeDefined();
      
      const imported = encryptionService.importSecrets(exported);
      expect(imported).toEqual(secrets);
    });

    it('should validate export version compatibility', () => {
      const invalidExport = JSON.stringify({
        version: 999,
        timestamp: Date.now(),
        secrets: {}
      });

      expect(() => encryptionService.importSecrets(invalidExport))
        .toThrow('Incompatible export version');
    });
  });
});

describe('SecretRotationManager', () => {
  let encryptionService: SecretEncryptionService;
  let rotationManager: SecretRotationManager;

  beforeEach(() => {
    encryptionService = new SecretEncryptionService('test-master-password');
    rotationManager = new SecretRotationManager(encryptionService);
  });

  afterEach(() => {
    rotationManager.clearAllSchedules();
  });

  describe('rotation scheduling', () => {
    it('should schedule rotation with callback', async () => {
      let rotationCalled = false;
      const callback = vi.fn(async (oldSecret: string, newSecret: string) => {
        rotationCalled = true;
        expect(newSecret).toBeDefined();
        expect(newSecret.length).toBeGreaterThan(0);
      });

      rotationManager.scheduleRotation('test-key', callback, {
        rotationIntervalMs: 100,
        maxAge: 1000,
        notifyBeforeExpiry: 50,
        autoRotate: true
      });

      // Wait for rotation to trigger
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(callback).toHaveBeenCalled();
    });

    it('should not auto-rotate when disabled', async () => {
      const callback = vi.fn();

      rotationManager.scheduleRotation('test-key', callback, {
        rotationIntervalMs: 100,
        maxAge: 1000,
        notifyBeforeExpiry: 50,
        autoRotate: false
      });

      // Wait longer than rotation interval
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(callback).not.toHaveBeenCalled();
    });

    it('should clear rotation schedules', () => {
      const callback = vi.fn();
      
      rotationManager.scheduleRotation('test-key', callback);
      rotationManager.clearRotationSchedule('test-key');
      
      const status = rotationManager.getRotationStatus();
      const testKeyStatus = status.find(s => s.secretKey === 'test-key');
      expect(testKeyStatus?.hasSchedule).toBe(false);
    });
  });

  describe('manual rotation', () => {
    it('should rotate secret manually', async () => {
      let newSecret: string | undefined;
      const callback = vi.fn(async (oldSecret: string, generated: string) => {
        newSecret = generated;
      });

      rotationManager.scheduleRotation('test-key', callback);
      
      const result = await rotationManager.rotateSecret('test-key');
      
      expect(result).toBeDefined();
      expect(callback).toHaveBeenCalled();
      expect(newSecret).toBeDefined();
    });

    it('should fail rotation without callback', async () => {
      await expect(rotationManager.rotateSecret('unknown-key'))
        .rejects.toThrow('No rotation callback registered');
    });
  });

  describe('rotation status', () => {
    it('should track rotation status', () => {
      const callback = vi.fn();
      
      rotationManager.scheduleRotation('key1', callback);
      rotationManager.scheduleRotation('key2', callback, { autoRotate: false });
      
      const status = rotationManager.getRotationStatus();
      expect(status).toHaveLength(2);
      
      const key1Status = status.find(s => s.secretKey === 'key1');
      const key2Status = status.find(s => s.secretKey === 'key2');
      
      expect(key1Status?.hasCallback).toBe(true);
      expect(key2Status?.hasCallback).toBe(true);
    });
  });
});