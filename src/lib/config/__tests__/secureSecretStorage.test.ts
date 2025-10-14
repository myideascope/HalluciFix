/**
 * Tests for secure secret storage functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  SecureSecretStorage,
  FileSecretPersistenceProvider,
  type SecretAccessControl,
  type SecretMetadata 
} from '../secureSecretStorage.js';
import { SecretManagerError } from '../errors.js';

describe('SecureSecretStorage', () => {
  let storage: SecureSecretStorage;
  const masterPassword = 'test-master-password-with-sufficient-length';

  beforeEach(() => {
    storage = new SecureSecretStorage(masterPassword);
  });

  describe('basic secret operations', () => {
    it('should store and retrieve secrets', async () => {
      const secretKey = 'test/secret';
      const secretValue = 'MyStr0ng!P@ssw0rd#2024$';

      await storage.setSecret(secretKey, secretValue);
      const retrieved = await storage.getSecret(secretKey);

      expect(retrieved).toBe(secretValue);
    });

    it('should return null for non-existent secrets', async () => {
      const retrieved = await storage.getSecret('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should delete secrets', async () => {
      const secretKey = 'test/secret';
      const secretValue = 'MyStr0ng!P@ssw0rd#2024$';

      await storage.setSecret(secretKey, secretValue);
      await storage.deleteSecret(secretKey);
      
      const retrieved = await storage.getSecret(secretKey);
      expect(retrieved).toBeNull();
    });

    it('should get multiple secrets', async () => {
      await storage.setSecret('key1', 'MyStr0ng!P@ssw0rd#1$');
      await storage.setSecret('key2', 'MyStr0ng!P@ssw0rd#2$');
      await storage.setSecret('key3', 'MyStr0ng!P@ssw0rd#3$');

      const secrets = await storage.getSecrets(['key1', 'key2', 'non-existent']);
      
      expect(secrets).toEqual({
        key1: 'MyStr0ng!P@ssw0rd#1$',
        key2: 'MyStr0ng!P@ssw0rd#2$'
      });
    });
  });

  describe('secret validation', () => {
    it('should validate secret strength on storage', async () => {
      const weakSecret = '123';
      
      await expect(storage.setSecret('test/weak', weakSecret))
        .rejects.toThrow('Secret validation failed');
    });

    it('should accept strong secrets', async () => {
      const strongSecret = 'MyStr0ng!P@ssw0rd#2024$';
      
      await expect(storage.setSecret('test/strong', strongSecret))
        .resolves.not.toThrow();
    });
  });

  describe('metadata management', () => {
    it('should store and retrieve metadata', async () => {
      const secretKey = 'test/secret';
      const secretValue = 'MyStr0ng!P@ssw0rd#2024$';
      const metadata: Partial<SecretMetadata> = {
        description: 'Test secret',
        tags: ['test', 'demo']
      };

      await storage.setSecret(secretKey, secretValue, undefined, metadata);
      
      const secrets = storage.listSecrets();
      const secretInfo = secrets.find(s => s.key === secretKey);
      
      expect(secretInfo).toBeDefined();
      expect(secretInfo!.metadata.description).toBe('Test secret');
      expect(secretInfo!.metadata.tags).toEqual(['test', 'demo']);
    });

    it('should track creation and update times', async () => {
      const secretKey = 'test/secret';
      const beforeTime = Date.now();

      await storage.setSecret(secretKey, 'MyStr0ng!P@ssw0rd#1$');
      
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await storage.setSecret(secretKey, 'MyStr0ng!P@ssw0rd#2$');
      
      const secrets = storage.listSecrets();
      const secretInfo = secrets.find(s => s.key === secretKey);
      
      expect(secretInfo!.metadata.createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(secretInfo!.metadata.updatedAt).toBeGreaterThan(secretInfo!.metadata.createdAt);
    });
  });

  describe('access control', () => {
    beforeEach(() => {
      // Set up access controls for testing
      const adminAccess: SecretAccessControl = {
        allowedOperations: ['read', 'write', 'delete', 'rotate'],
        allowedSecrets: '*'
      };

      const readOnlyAccess: SecretAccessControl = {
        allowedOperations: ['read'],
        allowedSecrets: ['public/*']
      };

      const limitedAccess: SecretAccessControl = {
        allowedOperations: ['read', 'write'],
        allowedSecrets: ['user/test-user/*']
      };

      const defaultAccess: SecretAccessControl = {
        allowedOperations: ['read', 'write', 'delete', 'rotate'],
        allowedSecrets: '*'
      };

      storage.setAccessControl('admin', adminAccess);
      storage.setAccessControl('readonly', readOnlyAccess);
      storage.setAccessControl('limited', limitedAccess);
      storage.setAccessControl('default-role', defaultAccess);
    });

    it('should allow admin full access', async () => {
      await storage.setSecret('any/secret', 'MyStr0ng!P@ssw0rd#2024$', 'admin');
      const value = await storage.getSecret('any/secret', 'admin');
      expect(value).toBe('MyStr0ng!P@ssw0rd#2024$');
      
      await storage.deleteSecret('any/secret', 'admin');
      const deleted = await storage.getSecret('any/secret', 'admin');
      expect(deleted).toBeNull();
    });

    it('should restrict read-only user operations', async () => {
      // Admin sets up a secret
      await storage.setSecret('public/test', 'MyStr0ng!P@ssw0rd#2024$', 'admin');
      
      // Read-only user can read
      const value = await storage.getSecret('public/test', 'readonly');
      expect(value).toBe('MyStr0ng!P@ssw0rd#2024$');
      
      // Read-only user cannot write
      await expect(storage.setSecret('public/new', 'MyStr0ng!P@ssw0rd#New$', 'readonly'))
        .rejects.toThrow('Operation write not allowed');
      
      // Read-only user cannot delete
      await expect(storage.deleteSecret('public/test', 'readonly'))
        .rejects.toThrow('Operation delete not allowed');
    });

    it('should restrict access to specific secret patterns', async () => {
      // Admin sets up secrets
      await storage.setSecret('user/test-user/secret1', 'MyStr0ng!P@ssw0rd#1$', 'admin');
      await storage.setSecret('user/other-user/secret2', 'MyStr0ng!P@ssw0rd#2$', 'admin');
      
      // Limited user can access their own secrets
      const value1 = await storage.getSecret('user/test-user/secret1', 'limited');
      expect(value1).toBe('MyStr0ng!P@ssw0rd#1$');
      
      // Limited user cannot access other user's secrets
      await expect(storage.getSecret('user/other-user/secret2', 'limited'))
        .rejects.toThrow('Access to secret user/other-user/secret2 not allowed');
    });

    it('should handle expired access controls', async () => {
      const expiredAccess: SecretAccessControl = {
        allowedOperations: ['read'],
        allowedSecrets: '*',
        expiresAt: Date.now() - 1000 // Expired 1 second ago
      };

      storage.setAccessControl('expired-user', expiredAccess);
      
      await expect(storage.getSecret('any/secret', 'expired-user'))
        .rejects.toThrow('Access control has expired');
    });

    it('should deny access for users without permissions', async () => {
      // Remove the default access control for this test
      storage.removeAccessControl('default-role');
      
      // First set up a secret that exists
      await storage.setSecret('any/secret', 'MyStr0ng!P@ssw0rd#2024$', 'admin');
      
      // Then try to access it with unknown user
      await expect(storage.getSecret('any/secret', 'unknown-user'))
        .rejects.toThrow('Access denied');
    });

    it('should list only accessible secrets', async () => {
      // Admin sets up various secrets
      await storage.setSecret('public/secret1', 'MyStr0ng!P@ssw0rd#1$', 'admin');
      await storage.setSecret('private/secret2', 'MyStr0ng!P@ssw0rd#2$', 'admin');
      await storage.setSecret('user/test-user/secret3', 'MyStr0ng!P@ssw0rd#3$', 'admin');
      
      // Read-only user should only see public secrets
      const readOnlySecrets = storage.listSecrets('readonly');
      expect(readOnlySecrets).toHaveLength(1);
      expect(readOnlySecrets[0].key).toBe('public/secret1');
      
      // Limited user should only see their secrets
      const limitedSecrets = storage.listSecrets('limited');
      expect(limitedSecrets).toHaveLength(1);
      expect(limitedSecrets[0].key).toBe('user/test-user/secret3');
    });
  });

  describe('secret rotation', () => {
    it('should rotate secrets with rotation config', async () => {
      // Set up admin access for this test
      const adminAccess: SecretAccessControl = {
        allowedOperations: ['read', 'write', 'delete', 'rotate'],
        allowedSecrets: '*'
      };
      storage.setAccessControl('admin', adminAccess);

      const rotationConfig = {
        rotationIntervalMs: 100, // Very short for testing
        maxAge: 1000,
        notifyBeforeExpiry: 50,
        autoRotate: false
      };

      await storage.setSecret('test/rotate', 'MyStr0ng!P@ssw0rd#Original$', 'admin', {
        rotationConfig
      });

      // Wait for rotation interval
      await new Promise(resolve => setTimeout(resolve, 150));

      // Get secret should warn about rotation needed
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const value = await storage.getSecret('test/rotate', 'admin');
      expect(value).toBe('MyStr0ng!P@ssw0rd#Original$');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Secret test/rotate needs rotation')
      );

      consoleSpy.mockRestore();
    });

    it('should handle manual rotation', async () => {
      // Set up admin access for this test
      const adminAccess: SecretAccessControl = {
        allowedOperations: ['read', 'write', 'delete', 'rotate'],
        allowedSecrets: '*'
      };
      storage.setAccessControl('admin', adminAccess);

      await storage.setSecret('test/manual-rotate', 'MyStr0ng!P@ssw0rd#Original$', 'admin');
      
      // This would trigger rotation if a callback was set up
      // For now, we just test that the method exists and doesn't throw
      await expect(storage.rotateSecret('test/manual-rotate', 'admin'))
        .rejects.toThrow('No rotation callback registered');
    });
  });

  describe('export and import', () => {
    it('should export and import secrets', async () => {
      // Set up admin access for this test
      const adminAccess: SecretAccessControl = {
        allowedOperations: ['read', 'write', 'delete', 'rotate'],
        allowedSecrets: '*'
      };
      storage.setAccessControl('admin', adminAccess);

      await storage.setSecret('key1', 'MyStr0ng!P@ssw0rd#1$', 'admin');
      await storage.setSecret('key2', 'MyStr0ng!P@ssw0rd#2$', 'admin');
      
      const exported = storage.exportSecrets();
      expect(exported).toBeDefined();
      
      const newStorage = new SecureSecretStorage(masterPassword);
      newStorage.importSecrets(exported);
      
      const value1 = await newStorage.getSecret('key1');
      const value2 = await newStorage.getSecret('key2');
      
      expect(value1).toBe('MyStr0ng!P@ssw0rd#1$');
      expect(value2).toBe('MyStr0ng!P@ssw0rd#2$');
    });

    it('should validate import version compatibility', () => {
      const invalidExport = JSON.stringify({
        version: 999,
        timestamp: Date.now(),
        secrets: {},
        accessControls: {}
      });

      expect(() => storage.importSecrets(invalidExport))
        .toThrow('Incompatible export version');
    });
  });

  describe('access logging', () => {
    it('should provide access logs', async () => {
      // Set up admin access for this test
      const adminAccess: SecretAccessControl = {
        allowedOperations: ['read', 'write', 'delete', 'rotate'],
        allowedSecrets: '*'
      };
      storage.setAccessControl('admin', adminAccess);

      await storage.setSecret('test/logged', 'MyStr0ng!P@ssw0rd#2024$', 'admin');
      await storage.getSecret('test/logged', 'admin');
      
      const logs = storage.getAccessLogs();
      expect(logs.length).toBeGreaterThan(0);
      
      const readLog = logs.find(log => log.operation === 'read');
      const writeLog = logs.find(log => log.operation === 'write');
      
      expect(readLog).toBeDefined();
      expect(writeLog).toBeDefined();
    });

    it('should filter logs by secret key', async () => {
      // Set up admin access for this test
      const adminAccess: SecretAccessControl = {
        allowedOperations: ['read', 'write', 'delete', 'rotate'],
        allowedSecrets: '*'
      };
      storage.setAccessControl('admin', adminAccess);

      await storage.setSecret('key1', 'MyStr0ng!P@ssw0rd#1$', 'admin');
      await storage.setSecret('key2', 'MyStr0ng!P@ssw0rd#2$', 'admin');
      
      const key1Logs = storage.getAccessLogs('key1');
      expect(key1Logs.every(log => log.secretKey === 'key1')).toBe(true);
    });
  });
});

describe('FileSecretPersistenceProvider', () => {
  let provider: FileSecretPersistenceProvider;
  const testFilePath = '.test-secrets.json';

  beforeEach(() => {
    provider = new FileSecretPersistenceProvider(testFilePath);
  });

  afterEach(async () => {
    // Clean up test file
    try {
      const fs = await import('fs/promises');
      await fs.unlink(testFilePath);
    } catch {
      // File might not exist, ignore
    }
  });

  it('should save and load secrets', async () => {
    const testSecret = {
      encrypted: {
        encryptedData: 'test-encrypted-data',
        iv: 'test-iv',
        salt: 'test-salt',
        algorithm: 'aes-256-cbc',
        keyDerivation: 'pbkdf2',
        timestamp: Date.now(),
        version: 1
      },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        description: 'Test secret'
      }
    };

    await provider.saveSecret('test-key', testSecret);
    const loaded = await provider.loadSecret('test-key');
    
    expect(loaded).toEqual(testSecret);
  });

  it('should load all secrets', async () => {
    const secret1 = {
      encrypted: {
        encryptedData: 'data1',
        iv: 'iv1',
        salt: 'salt1',
        algorithm: 'aes-256-cbc' as const,
        keyDerivation: 'pbkdf2' as const,
        timestamp: Date.now(),
        version: 1
      },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };

    const secret2 = {
      encrypted: {
        encryptedData: 'data2',
        iv: 'iv2',
        salt: 'salt2',
        algorithm: 'aes-256-cbc' as const,
        keyDerivation: 'pbkdf2' as const,
        timestamp: Date.now(),
        version: 1
      },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };

    await provider.saveSecret('key1', secret1);
    await provider.saveSecret('key2', secret2);
    
    const allSecrets = await provider.loadAllSecrets();
    
    expect(allSecrets).toHaveProperty('key1');
    expect(allSecrets).toHaveProperty('key2');
    expect(allSecrets.key1).toEqual(secret1);
    expect(allSecrets.key2).toEqual(secret2);
  });

  it('should delete secrets', async () => {
    const testSecret = {
      encrypted: {
        encryptedData: 'test-data',
        iv: 'test-iv',
        salt: 'test-salt',
        algorithm: 'aes-256-cbc' as const,
        keyDerivation: 'pbkdf2' as const,
        timestamp: Date.now(),
        version: 1
      },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };

    await provider.saveSecret('test-key', testSecret);
    await provider.deleteSecret('test-key');
    
    const loaded = await provider.loadSecret('test-key');
    expect(loaded).toBeNull();
  });

  it('should handle non-existent files gracefully', async () => {
    const nonExistentProvider = new FileSecretPersistenceProvider('.non-existent.json');
    
    const allSecrets = await nonExistentProvider.loadAllSecrets();
    expect(allSecrets).toEqual({});
    
    const secret = await nonExistentProvider.loadSecret('any-key');
    expect(secret).toBeNull();
  });
});